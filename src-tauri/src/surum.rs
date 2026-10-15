// loomen.org sürüm dosyası — mobil güncelleme uyarısı (LOM-32).
// Dosya webview yerine Rust'tan çekilir: loomen.org CORS başlığı vermese de okunur.
// Sürüm karşılaştırması ve erteleme arayüzde (src/core/update/mobileUpdate.ts);
// burası yalnız kurulu sürümü ve uzak dosyanın ham içeriğini döner.
use serde::Serialize;
use std::time::Duration;

const SURUM_URL: &str = "https://loomen.org/surum.json";
const UA: &str = "Loomen-App";
/// Ağ yavaşsa kontrol açılışı bekletmesin; arayüz hatayı sessizce yutar.
const ZAMAN_ASIMI: Duration = Duration::from_secs(8);

#[derive(Serialize)]
pub struct SurumKontrol {
    /// Kurulu uygulamanın sürümü (tauri.conf.json → "0.1.0" biçimi).
    current: String,
    /// surum.json'un içeriği olduğu gibi; alanları arayüz yorumlar.
    remote: serde_json::Value,
}

/// Gövdeyi JSON olarak çözer. Bozuk dosya hata döner, arayüz şerit göstermez.
fn cozumle(govde: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(govde).map_err(|e| format!("sürüm dosyası okunamadı: {e}"))
}

#[tauri::command]
pub async fn surum_kontrol(app: tauri::AppHandle) -> Result<SurumKontrol, String> {
    let istemci = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(ZAMAN_ASIMI)
        .build()
        .map_err(|e| format!("http istemcisi kurulamadı: {e}"))?;
    // Ara önbellek eski dosyayı verirse yeni sürüm günlerce fark edilmez.
    let res = istemci
        .get(SURUM_URL)
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|e| format!("sürüm dosyasına ulaşılamadı: {e}"))?;
    let durum = res.status();
    if !durum.is_success() {
        // 404 = dosya henüz siteye yüklenmedi; özellik sessizce kapalı kalır.
        return Err(format!("sürüm dosyası alınamadı (HTTP {})", durum.as_u16()));
    }
    let govde = res
        .text()
        .await
        .map_err(|e| format!("sürüm dosyası okunamadı: {e}"))?;
    Ok(SurumKontrol {
        current: app.package_info().version.to_string(),
        remote: cozumle(&govde)?,
    })
}

#[cfg(test)]
mod tests {
    use super::cozumle;

    #[test]
    fn gecerli_dosya_cozulur() {
        let v = cozumle(r#"{"android":{"version":"0.1.1"},"ios":{"version":"0.1.1"}}"#)
            .expect("geçerli JSON");
        assert_eq!(v["android"]["version"], "0.1.1");
        assert_eq!(v["ios"]["version"], "0.1.1");
    }

    #[test]
    fn bozuk_dosya_hata_doner() {
        assert!(cozumle("<html>404</html>").is_err());
        assert!(cozumle("").is_err());
    }
}
