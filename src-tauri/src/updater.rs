//! Uygulama içi güncelleme (yalnız masaüstü, `updater` özelliği açıkken).
//!
//! JS eklentisi yerine Rust komutları kullanılır: capability dosyalarında `updater:` izni
//! olmadığı için özellik kapalıyken (App Store derlemesi) derleme kırılmaz. Arayüz önce
//! `app_update_supported` ile sorar; `false` ise güncelleme bölümünü hiç göstermez.
//!
//! `LOOMEN_UPDATE_URL` ortam değişkeni conf'taki endpoint'i ezer (yerel sahte latest.json
//! denemesi için). Not: http:// adres yalnız debug derlemede kabul edilir; release'te
//! eklenti https dışını reddeder.

use serde::Serialize;

/// Arayüze dönen güncelleme bilgisi (yeni sürüm yoksa komut `None` döner).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

/// `update://progress` olayının yükü: indirilen bayt ve (biliniyorsa) toplam.
#[cfg_attr(not(all(desktop, feature = "updater")), allow(dead_code))]
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// Bu derlemede uygulama içi güncelleme var mı?
#[tauri::command]
pub fn app_update_supported() -> bool {
    cfg!(all(desktop, feature = "updater"))
}

#[cfg(all(desktop, feature = "updater"))]
mod imp {
    use super::{UpdateInfo, UpdateProgress};
    use tauri::{AppHandle, Emitter};
    use tauri_plugin_updater::{Update, UpdaterExt};

    async fn find(app: &AppHandle) -> Result<Option<Update>, String> {
        let mut builder = app.updater_builder();
        if let Ok(url) = std::env::var("LOOMEN_UPDATE_URL") {
            let url = url.trim();
            if !url.is_empty() {
                let parsed = url
                    .parse()
                    .map_err(|e| format!("LOOMEN_UPDATE_URL geçersiz: {e}"))?;
                builder = builder.endpoints(vec![parsed]).map_err(|e| e.to_string())?;
            }
        }
        let updater = builder.build().map_err(|e| e.to_string())?;
        updater.check().await.map_err(|e| e.to_string())
    }

    pub async fn check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
        Ok(find(&app).await?.map(|u| UpdateInfo {
            version: u.version.clone(),
            current_version: u.current_version.clone(),
            notes: u.body.clone(),
            date: u.date.map(|d| d.to_string()),
        }))
    }

    pub async fn install(app: AppHandle) -> Result<(), String> {
        let update = find(&app)
            .await?
            .ok_or_else(|| "Yeni sürüm bulunamadı.".to_string())?;
        let mut downloaded: u64 = 0;
        let emitter = app.clone();
        update
            .download_and_install(
                move |chunk, total| {
                    downloaded += chunk as u64;
                    let _ = emitter.emit("update://progress", UpdateProgress { downloaded, total });
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;
        app.restart()
    }
}

/// Yeni sürüm varsa bilgisini döner, yoksa `None`.
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    #[cfg(all(desktop, feature = "updater"))]
    {
        imp::check(app).await
    }
    #[cfg(not(all(desktop, feature = "updater")))]
    {
        let _ = app;
        Ok(None)
    }
}

/// Yeni sürümü indirir (ilerleme `update://progress` olayıyla), kurar ve uygulamayı
/// yeniden başlatır. Başarılıysa geri dönmez.
#[tauri::command]
pub async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(all(desktop, feature = "updater"))]
    {
        imp::install(app).await
    }
    #[cfg(not(all(desktop, feature = "updater")))]
    {
        let _ = app;
        Err("Bu sürümde uygulama içi güncelleme yok.".to_string())
    }
}
