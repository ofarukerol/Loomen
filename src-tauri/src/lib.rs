// Modüller:
//  - github      : OAuth device flow + repo yönetimi (reqwest) — tüm platformlar
//  - github_api  : GitHub REST (Git Data API) senkronu (reqwest) — tüm platformlar (mobil dahil)
//  - github_git  : git2/libgit2 senkron — YALNIZ masaüstü (openssl mobilde derlenmez)
//  - google      : Google Takvim OAuth + API
mod github;
mod github_api;
#[cfg(desktop)]
mod github_git;
mod google;
#[cfg(target_os = "macos")]
mod macos_bookmark;

use tauri_plugin_fs::FsExt;

/// Kasa klasörünü fs eklentisinin çalışma zamanı kapsamına alır.
///
/// Statik kapsam (capabilities/default.json) yalnız `$HOME` ve `$APPDATA` altını kapsar;
/// kullanıcı kasayı harici disk gibi başka bir yere koyduğunda ya da macOS kum havuzunda
/// `$HOME` konteynere işaret ettiğinde okuma/yazma "forbidden path" ile reddedilir.
/// Bu yüzden kasa yolu seçildiği ve yer imi çözüldüğü anda kapsama eklenir.
fn allow_vault(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Ok(());
    }
    let yol = dogrula_kasa_yolu(path)?;
    app.fs_scope()
        .allow_directory(&yol, true)
        .map_err(|e| format!("kasa kapsama alınamadı: {e}"))
}

/// Kapsama alınacak yolu doğrular.
///
/// Uygulamanın kendi komutları Tauri v2'de ACL ile sınırlanmıyor: webview'deki
/// herhangi bir betik `invoke("vault_allow", { path: "/" })` diyerek statik
/// kapsamı tamamen kaldırabilirdi. `csp: null` olduğu için not içeriğinden
/// gelen bir betik gerçek bir ihtimal. Bu yüzden yol burada elenir:
///
/// - göreli yol ve `..` yok (gerçek konum belirsiz kalmasın),
/// - gerçekten var olan bir KLASÖR olmalı (canonicalize),
/// - kök ve ev klasörünün kendisi reddedilir (tüm diski açmak demek).
fn dogrula_kasa_yolu(path: &str) -> Result<std::path::PathBuf, String> {
    let ham = std::path::Path::new(path);
    if !ham.is_absolute() {
        return Err("Kasa yolu tam yol olmalı".into());
    }
    if ham.components().any(|c| c == std::path::Component::ParentDir) {
        return Err("Kasa yolunda `..` olamaz".into());
    }
    let yol = ham
        .canonicalize()
        .map_err(|e| format!("Kasa klasörü bulunamadı: {e}"))?;
    if !yol.is_dir() {
        return Err("Kasa yolu bir klasör olmalı".into());
    }
    if yol.parent().is_none() {
        return Err("Kök klasör kasa olarak açılamaz".into());
    }
    if let Some(ev) = dirs_ev() {
        if yol == ev {
            return Err("Ev klasörünün tamamı kasa olarak açılamaz".into());
        }
    }
    Ok(yol)
}

/// Ev klasörü (ortam değişkeninden; yeni bağımlılık eklemeden).
fn dirs_ev() -> Option<std::path::PathBuf> {
    let ham = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    std::path::PathBuf::from(ham).canonicalize().ok()
}

/// Kayıtlı kasa yolunu fs kapsamına alır — macOS dışı platformlarda (yer imi yok) açılışta
/// ve kasa değiştirildiğinde arayüz bunu çağırır.
#[tauri::command]
fn vault_allow(app: tauri::AppHandle, path: String) -> Result<(), String> {
    allow_vault(&app, &path)
}

/// Frontend'in platforma göre davranması için (mobilde yerel kasa + API sync).
#[tauri::command]
fn app_is_mobile() -> bool {
    cfg!(mobile)
}

/// Hedef platform ("ios" | "android" | "macos" | "windows" | "linux") — Google mobil OAuth'ta
/// platforma özel client id seçmek için.
#[tauri::command]
fn app_platform() -> String {
    if cfg!(target_os = "ios") {
        "ios".into()
    } else if cfg!(target_os = "android") {
        "android".into()
    } else if cfg!(target_os = "macos") {
        "macos".into()
    } else if cfg!(target_os = "windows") {
        "windows".into()
    } else {
        "linux".into()
    }
}


/// Uygulama macOS kum havuzunda (sandbox) mı çalışıyor?
///
/// Mac App Store sürümünde true döner. Sandbox'ta kullanıcı klasör seçicisiz de kasa
/// oluşturabilmelidir (uygulamanın kendi konteyneri) — arayüz bu bilgiye göre seçenek sunar.
#[tauri::command]
fn app_is_sandboxed() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("APP_SANDBOX_CONTAINER_ID").is_some()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Kasa klasörü için security-scoped bookmark üretir (macOS sandbox / App Store).
/// Diğer platformlarda sandbox yoktur; boş döner ve çağıran taraf yok sayar.
#[tauri::command]
fn bookmark_create(app: tauri::AppHandle, path: String) -> Result<String, String> {
    // Kasa az önce seçildi: hangi platform olursa olsun kapsama al.
    allow_vault(&app, &path)?;
    #[cfg(target_os = "macos")]
    {
        macos_bookmark::bookmark_create(path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(String::new())
    }
}

/// Bookmark'ı çözer ve klasöre erişimi başlatır (macOS sandbox).
#[tauri::command]
fn bookmark_resolve(app: tauri::AppHandle, data: String) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let r = macos_bookmark::bookmark_resolve(data)?;
        // Yer imi erişimi açtı; fs eklentisinin kapsamı ayrı bir katman, onu da aç.
        allow_vault(&app, &r.path)?;
        Ok(serde_json::json!({ "path": r.path, "stale": r.stale }))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, data);
        Err("unsupported-platform".into())
    }
}

/// Klasöre erişimi bırakır — çağrılmazsa çekirdek kaynağı sızar (macOS sandbox).
#[tauri::command]
fn bookmark_release(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_bookmark::bookmark_release(path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init());

    // Masaüstü: git2 tabanlı git_sync dahil hepsi.
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_is_mobile,
        app_platform,
        app_is_sandboxed,
        vault_allow,
        bookmark_create,
        bookmark_resolve,
        bookmark_release,
        github::github_device_start,
        github::github_device_poll,
        github::github_user,
        github::github_list_repos,
        github::github_create_repo,
        github_api::github_api_sync,
        github_git::git_sync,
        google::google_login,
        google::google_refresh,
        google::google_userinfo,
        google::google_list_calendars,
        google::google_list_events,
        google::google_upsert_event,
        google::google_delete_event,
        google::google_auth_url,
        google::google_exchange,
        google::google_refresh_pkce,
    ]);

    // Mobil: git_sync YOK (git2 derlenmez); senkron github_api ile.
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_is_mobile,
        app_platform,
        app_is_sandboxed,
        vault_allow,
        bookmark_create,
        bookmark_resolve,
        bookmark_release,
        github::github_device_start,
        github::github_device_poll,
        github::github_user,
        github::github_list_repos,
        github::github_create_repo,
        github_api::github_api_sync,
        google::google_login,
        google::google_refresh,
        google::google_userinfo,
        google::google_list_calendars,
        google::google_list_events,
        google::google_upsert_event,
        google::google_delete_event,
        google::google_auth_url,
        google::google_exchange,
        google::google_refresh_pkce,
    ]);

    // macOS: yerel menü çubuğu. KRİTİK — sistem "Start Dictation" (sesli yazma) ve
    // "Emoji & Symbols" öğelerini otomatik olarak DÜZEN (Edit) menüsüne ekler. Uygulamanın
    // Edit menüsü yoksa dikte klavye kısayolu hiç aktifleşmez (metin alanı odakta olsa bile).
    #[cfg(target_os = "macos")]
    let builder = builder.setup(|app| {
        use tauri::menu::{MenuBuilder, SubmenuBuilder};

        let app_menu = SubmenuBuilder::new(app, "Loomen")
            .about(None)
            .separator()
            .hide()
            .separator()
            .quit()
            .build()?;

        let edit_menu = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;

        let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu]).build()?;
        app.set_menu(menu)?;
        Ok(())
    });

    // Kapanışta security-scoped erişimleri bırak. Bırakılmazsa çekirdek kaynağı sızar
    // (bkz macos_bookmark modül belgesi).
    #[cfg(target_os = "macos")]
    let builder = builder.on_window_event(|_window, event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            macos_bookmark::release_all();
        }
    });

    // Panik yerine okunur hata + çıkış kodu: çökme raporu yerine anlaşılır bir mesaj.
    if let Err(e) = builder.run(tauri::generate_context!()) {
        eprintln!("Loomen başlatılamadı: {e}");
        std::process::exit(1);
    }
}
