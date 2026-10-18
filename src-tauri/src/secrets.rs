//! GitHub ve Google girişlerinin saklanması (LOM-46).
//!
//! Önceden webview `localStorage`'ındaydı (`loomen.settings`, düz metin). 16 Eki 2026'da Air'de
//! `~/Library/WebKit` silinince bütün bağlantılar düştü; Anahtar Zinciri etkilenmedi.
//!
//! - **Masaüstü:** işletim sisteminin anahtar zinciri (macOS Keychain, Windows Credential
//!   Manager) — `keyring` crate'i, `ai/keys.rs` ile aynı yol, ayrı servis adı.
//! - **Mobil:** uygulamanın veri klasöründe JSON (konteyner diğer uygulamalara kapalı).
//!
//! AI anahtarlarından farkı: değer webview'e döner, çünkü senkron ve takvim komutları
//! token'ı argüman olarak alıyor. Ama artık diske düz metin olarak yazılmıyor.

use tauri::AppHandle;

/// Yalnız bu adlar saklanabilir — webview rastgele anahtar zinciri kaydı açamasın.
const NAMES: [&str; 2] = ["github", "google"];

fn check_name(name: &str) -> Result<(), String> {
    if NAMES.contains(&name) {
        Ok(())
    } else {
        Err(format!("bilinmeyen giriş adı: {name}"))
    }
}

#[cfg(desktop)]
const SERVICE: &str = "org.loomen.notes.auth";

#[cfg(desktop)]
fn entry(name: &str) -> Result<keyring::v1::Entry, String> {
    keyring::v1::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[cfg(desktop)]
fn set(_app: &AppHandle, name: &str, value: &str) -> Result<(), String> {
    entry(name)?.set_password(value).map_err(|e| e.to_string())
}

#[cfg(desktop)]
fn get(_app: &AppHandle, name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::v1::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(desktop)]
fn delete(_app: &AppHandle, name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(mobile)]
fn path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("auth");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

#[cfg(mobile)]
fn read_all(app: &AppHandle) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let p = path(app)?;
    if !p.exists() {
        return Ok(serde_json::Map::new());
    }
    let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(serde_json::Value::Object(m)) => Ok(m),
        _ => Ok(serde_json::Map::new()), // bozuk dosya: kullanıcı yeniden bağlanır
    }
}

#[cfg(mobile)]
fn write_all(app: &AppHandle, map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let p = path(app)?;
    let body = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&p, body).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[cfg(mobile)]
fn set(app: &AppHandle, name: &str, value: &str) -> Result<(), String> {
    let mut m = read_all(app)?;
    m.insert(name.to_string(), serde_json::Value::String(value.to_string()));
    write_all(app, &m)
}

#[cfg(mobile)]
fn get(app: &AppHandle, name: &str) -> Result<Option<String>, String> {
    Ok(read_all(app)?.get(name).and_then(|v| v.as_str()).map(|s| s.to_string()))
}

#[cfg(mobile)]
fn delete(app: &AppHandle, name: &str) -> Result<(), String> {
    let mut m = read_all(app)?;
    if m.remove(name).is_some() {
        write_all(app, &m)?;
    }
    Ok(())
}

#[tauri::command]
pub fn secret_set(app: AppHandle, name: String, value: String) -> Result<(), String> {
    check_name(&name)?;
    if value.is_empty() {
        return Err("boş değer saklanmaz".into());
    }
    set(&app, &name, &value)
}

/// Kayıt yoksa `None` (hata değil). Anahtar zinciri erişimi reddedilirse hata.
#[tauri::command]
pub fn secret_get(app: AppHandle, name: String) -> Result<Option<String>, String> {
    check_name(&name)?;
    get(&app, &name)
}

#[tauri::command]
pub fn secret_delete(app: AppHandle, name: String) -> Result<(), String> {
    check_name(&name)?;
    delete(&app, &name)
}

#[cfg(test)]
mod tests {
    use super::check_name;

    #[test]
    fn yalniz_bilinen_adlar() {
        assert!(check_name("github").is_ok());
        assert!(check_name("google").is_ok());
        assert!(check_name("ai").is_err());
        assert!(check_name("").is_err());
        assert!(check_name("github/../x").is_err());
    }
}
