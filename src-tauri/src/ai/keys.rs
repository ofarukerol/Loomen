//! AI sağlayıcı API anahtarlarının saklanması.
//!
//! TASARIM KURALI: anahtar **hiçbir zaman** webview'e dönmez. Buradaki komutlar yalnızca
//! "yaz", "sil" ve "var mı?" yapar; okuma yalnızca Rust içinden (`get`) yapılır ve doğrudan
//! HTTP başlığına gider. Böylece anahtar `localStorage`'a, zustand `partialize` listesine
//! veya JS bundle'ına hiçbir yolla sızamaz.
//!
//! - **Masaüstü:** işletim sisteminin anahtar zinciri (macOS Keychain, Windows Credential
//!   Manager, Linux Secret Service) — `keyring` crate'i.
//! - **Mobil:** uygulamanın kendi veri klasöründe JSON. iOS/Android'de uygulama konteyneri
//!   zaten diğer uygulamalara kapalıdır; ayrıca `keyring` mobilde desteklenmez.

use tauri::AppHandle;

#[cfg(desktop)]
const SERVICE: &str = "org.loomen.notes.ai";

// ---------------------------------------------------------------- masaüstü (anahtar zinciri)

#[cfg(desktop)]
fn entry(provider_id: &str) -> Result<keyring::v1::Entry, String> {
    keyring::v1::Entry::new(SERVICE, provider_id).map_err(|e| e.to_string())
}

#[cfg(desktop)]
pub fn set(_app: &AppHandle, provider_id: &str, key: &str) -> Result<(), String> {
    entry(provider_id)?.set_password(key).map_err(|e| e.to_string())
}

#[cfg(desktop)]
pub fn get(_app: &AppHandle, provider_id: &str) -> Result<String, String> {
    entry(provider_id)?
        .get_password()
        .map_err(|_| format!("'{provider_id}' için API anahtarı bulunamadı"))
}

#[cfg(desktop)]
pub fn delete(_app: &AppHandle, provider_id: &str) -> Result<(), String> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) => Ok(()),
        // Zaten yoksa hata değil — silme istenen sonucu vermiş sayılır.
        Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---------------------------------------------------------------- mobil (uygulama konteyneri)

#[cfg(mobile)]
fn keys_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("ai");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("keys.json"))
}

#[cfg(mobile)]
fn read_all(app: &AppHandle) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = keys_path(app)?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(serde_json::Value::Object(m)) => Ok(m),
        // Bozuk dosya sessizce boş kabul edilir; üzerine yazılır (anahtar türetilmiş veri değil,
        // kullanıcı yeniden girer — bir notu bozmakla kıyaslanabilir bir risk yok).
        _ => Ok(serde_json::Map::new()),
    }
}

#[cfg(mobile)]
fn write_all(app: &AppHandle, map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let path = keys_path(app)?;
    let body = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, body).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[cfg(mobile)]
pub fn set(app: &AppHandle, provider_id: &str, key: &str) -> Result<(), String> {
    let mut map = read_all(app)?;
    map.insert(provider_id.to_string(), serde_json::Value::String(key.to_string()));
    write_all(app, &map)
}

#[cfg(mobile)]
pub fn get(app: &AppHandle, provider_id: &str) -> Result<String, String> {
    read_all(app)?
        .get(provider_id)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("'{provider_id}' için API anahtarı bulunamadı"))
}

#[cfg(mobile)]
pub fn delete(app: &AppHandle, provider_id: &str) -> Result<(), String> {
    let mut map = read_all(app)?;
    map.remove(provider_id);
    write_all(app, &map)
}

// ---------------------------------------------------------------- komutlar (platform ortak)

#[tauri::command]
pub fn ai_key_set(app: AppHandle, provider_id: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("API anahtarı boş olamaz".into());
    }
    set(&app, &provider_id, key)
}

#[tauri::command]
pub fn ai_key_delete(app: AppHandle, provider_id: String) -> Result<(), String> {
    delete(&app, &provider_id)
}

/// Anahtar kayıtlı mı? (Anahtarın kendisi **dönmez** — yalnızca varlığı.)
#[tauri::command]
pub fn ai_key_has(app: AppHandle, provider_id: String) -> bool {
    get(&app, &provider_id).is_ok()
}
