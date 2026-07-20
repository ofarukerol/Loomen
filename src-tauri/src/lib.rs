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

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
