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
fn bookmark_create(path: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        macos_bookmark::bookmark_create(path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(String::new())
    }
}

/// Bookmark'ı çözer ve klasöre erişimi başlatır (macOS sandbox).
#[tauri::command]
fn bookmark_resolve(data: String) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let r = macos_bookmark::bookmark_resolve(data)?;
        Ok(serde_json::json!({ "path": r.path, "stale": r.stale }))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = data;
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

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
