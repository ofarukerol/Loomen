//! Görseldeki yazıyı okuma (fotoğraf → metin) — Kütüphane "Fotoğraftan al" düğmesinin arka ucu (LOM-87).
//!
//! Basılı kitap sayfasının fotoğrafı webview'de küçültülür (en uzun kenar ~1600 px, JPEG) ve
//! base64 olarak buraya gelir. Ağa çıkan taraf yine yalnızca Rust'tır (llm.rs ile aynı kural —
//! anahtar webview'e hiç dönmez). Ayrı bir OCR motoru yoktur; kullanıcının seçtiği sohbet
//! modeli görseli okur (görsel anlayan bir model gerekir).
//!
//! Sağlayıcıya göre:
//!   - `gemini`            → `:generateContent`, görsel `inline_data` olarak.
//!   - `openai` / `compat` → `/chat/completions`, görsel `image_url` (data URL) olarak.
//!   - `anthropic`         → `/v1/messages`, görsel `image` bloğu (base64) olarak.
//!
//! Dönen değer yalnızca metindir: uygulama onu kullanıcıya gösterir, kullanıcı seçip onaylamadan
//! hiçbir şey kaydedilmez. Görsel diske yazılmaz.

use base64::Engine;
use tauri::AppHandle;

use super::keys;
use super::llm::ProviderCfg;

/// Görselin base64 hâlinin en büyük boyutu. Küçültülmüş bir sayfa ~0,5 MB tutar; Anthropic'in
/// görsel sınırı (5 MB) base64 hâline uygulanır, Gemini satır içi istek sınırı 20 MB.
const MAX_IMAGE_BASE64: usize = 5 * 1024 * 1024;

/// Bir sayfanın metni için fazlasıyla yeter; "düşünen" modellerde (Gemini 2.5) düşünme jetonları da
/// bu sınıra girer, o yüzden pay bırakıldı.
const MAX_TOKENS: u32 = 8192;

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Loomen-App")
        .build()
        .expect("reqwest client")
}

/// Modelden yalnız düz döküm istenir; "işte metin:" gibi girişler alıntıyı bozardı.
const PROMPT: &str = "Bu görsel bir kitap sayfasının fotoğrafı. Görseldeki metni olduğu gibi, \
yorum eklemeden yaz. Yalnızca sayfadaki metni döndür; açıklama, başlık, tırnak, Markdown ya da \
kod bloğu ekleme. Paragrafları boş satırla ayır. Sayfa numarasını, üst ve alt bilgiyi yazma. \
Okunabilir metin yoksa boş cevap ver.";

/// Görsel türünü doğrula; bilinmeyen tür gönderilmez (sağlayıcılar yalnız bunları kabul eder).
fn mime_of(mime: &str) -> Result<&'static str, String> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => Ok("image/jpeg"),
        "image/png" => Ok("image/png"),
        "image/webp" => Ok("image/webp"),
        "image/gif" => Ok("image/gif"),
        _ => Err("Bu görsel biçimi okunamıyor; JPEG ya da PNG bir fotoğraf seçin".into()),
    }
}

/// Dil ipucu: modelin yazıyı o dilde beklemesi isabeti artırır (metni çevirmez).
fn prompt_for(language: Option<&str>) -> String {
    match language {
        Some("tr") => format!("{PROMPT} Metin büyük olasılıkla Türkçedir; çevirme, olduğu dilde yaz."),
        Some("en") => format!("{PROMPT} The text is probably in English; do not translate it."),
        Some("ar") => format!("{PROMPT} النص غالبًا بالعربية؛ لا تترجمه."),
        _ => format!("{PROMPT} Metni çevirme, olduğu dilde yaz."),
    }
}

/// Fotoğraftaki yazıyı metne çevir. `image_base64` = görsel baytlarının base64'ü.
#[tauri::command]
pub async fn ai_ocr_image(
    app: AppHandle,
    provider: ProviderCfg,
    image_base64: String,
    mime: String,
    // `language`: arayüz dili (tr/en/ar) — modele ipucu olarak geçilir.
    language: Option<String>,
) -> Result<String, String> {
    let mime = mime_of(&mime)?;
    let data = image_base64.trim();
    if data.len() > MAX_IMAGE_BASE64 {
        return Err("Fotoğraf çok büyük; daha küçük bir fotoğraf seçin".into());
    }
    // Yalnız doğrulama: bozuk veri sağlayıcıya gönderilmez. Gönderilen metin gelen base64'ün kendisi.
    let image = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "Fotoğraf verisi çözülemedi".to_string())?;
    if image.is_empty() {
        return Err("Fotoğraf boş".into());
    }
    let prompt = prompt_for(language.as_deref().filter(|l| matches!(*l, "tr" | "en" | "ar")));
    let key = keys::get(&app, &provider.id)?;
    let client = http();
    let req = request(&client, &provider, &key, &prompt, mime, data)?;

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(super::llm::error_message(status, &text));
    }
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    // Sağlayıcı reddettiyse ya da yarıda kestiyse "yazı yok" denmez; gerçek sebep söylenir.
    if let Some(e) = refusal(&provider.kind, &v) {
        return Err(e);
    }
    Ok(extract_text(&provider.kind, &v).trim().to_string())
}

/// Cevap reddedildi, engellendi ya da sınırda kesildi mi? Öyleyse kullanıcıya söylenecek metin.
fn refusal(kind: &str, v: &serde_json::Value) -> Option<String> {
    const BLOCKED: &str = "Sağlayıcı bu fotoğrafı okumayı reddetti";
    const CUT: &str = "Sayfadaki metin çok uzun, sağlayıcı yarıda kesti; sayfanın bir kısmını çekip tekrar deneyin";
    match kind {
        "gemini" => {
            if let Some(r) = v["promptFeedback"]["blockReason"].as_str() {
                return Some(format!("{BLOCKED} ({r})"));
            }
            match v["candidates"][0]["finishReason"].as_str() {
                Some("MAX_TOKENS") => Some(CUT.into()),
                Some(r @ ("SAFETY" | "RECITATION" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII" | "OTHER")) => {
                    Some(format!("{BLOCKED} ({r})"))
                }
                _ => None,
            }
        }
        "anthropic" => match v["stop_reason"].as_str() {
            Some("max_tokens") => Some(CUT.into()),
            Some("refusal") => Some(BLOCKED.into()),
            _ => None,
        },
        _ => {
            let c = &v["choices"][0];
            if let Some(r) = c["message"]["refusal"].as_str().filter(|r| !r.trim().is_empty()) {
                return Some(format!("{BLOCKED}: {}", r.chars().take(200).collect::<String>()));
            }
            match c["finish_reason"].as_str() {
                Some("length") => Some(CUT.into()),
                Some("content_filter") => Some(BLOCKED.into()),
                _ => None,
            }
        }
    }
}

/// Sağlayıcıya göre istek (adres, başlıklar, gövde).
fn request(
    client: &reqwest::Client,
    p: &ProviderCfg,
    key: &str,
    prompt: &str,
    mime: &str,
    data: &str,
) -> Result<reqwest::RequestBuilder, String> {
    let base = super::llm::base_of(p)?;
    match p.kind.as_str() {
        "gemini" => {
            let body = serde_json::json!({
                "contents": [{
                    "role": "user",
                    "parts": [
                        { "text": prompt },
                        { "inline_data": { "mime_type": mime, "data": data } }
                    ]
                }],
                // Döküm yaratıcılık işi değil: sıcaklık 0, model gördüğüne sadık kalsın.
                "generationConfig": { "temperature": 0, "maxOutputTokens": MAX_TOKENS }
            });
            Ok(client
                .post(format!("{base}/v1beta/models/{}:generateContent", p.model))
                .header("x-goog-api-key", key)
                .json(&body))
        }
        "openai" | "compat" => {
            let body = serde_json::json!({
                "model": p.model,
                "messages": [{
                    "role": "user",
                    "content": [
                        { "type": "text", "text": prompt },
                        { "type": "image_url", "image_url": { "url": format!("data:{mime};base64,{data}") } }
                    ]
                }],
                "max_tokens": MAX_TOKENS,
                "stream": false,
            });
            Ok(client
                .post(format!("{base}/chat/completions"))
                .header("Authorization", format!("Bearer {key}"))
                .json(&body))
        }
        "anthropic" => {
            let body = serde_json::json!({
                "model": p.model,
                "max_tokens": MAX_TOKENS,
                "messages": [{
                    "role": "user",
                    "content": [
                        { "type": "image", "source": { "type": "base64", "media_type": mime, "data": data } },
                        { "type": "text", "text": prompt }
                    ]
                }],
            });
            Ok(client
                .post(format!("{base}/v1/messages"))
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .json(&body))
        }
        k => Err(format!("Bilinmeyen sağlayıcı türü: {k}")),
    }
}

/// Cevaptaki metni çıkar (sağlayıcıya göre alan farklı). Metin yoksa boş.
fn extract_text(kind: &str, v: &serde_json::Value) -> String {
    match kind {
        "gemini" => v["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| parts.iter().filter_map(|p| p["text"].as_str()).collect())
            .unwrap_or_default(),
        "anthropic" => v["content"]
            .as_array()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|b| b["type"] == "text")
                    .filter_map(|b| b["text"].as_str())
                    .collect()
            })
            .unwrap_or_default(),
        _ => {
            let c = &v["choices"][0]["message"]["content"];
            // Bazı uyumlu sunucular içeriği parça dizisi olarak döndürür.
            match c.as_str() {
                Some(s) => s.to_string(),
                None => c
                    .as_array()
                    .map(|parts| parts.iter().filter_map(|p| p["text"].as_str()).collect())
                    .unwrap_or_default(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_kabul_ve_ret() {
        assert_eq!(mime_of("image/JPG").unwrap(), "image/jpeg");
        assert_eq!(mime_of(" image/png ").unwrap(), "image/png");
        assert!(mime_of("image/heic").is_err());
        assert!(mime_of("application/pdf").is_err());
    }

    #[test]
    fn metin_cikarma() {
        let g = serde_json::json!({"candidates":[{"content":{"parts":[{"text":"Bir "},{"text":"iki"}]}}]});
        assert_eq!(extract_text("gemini", &g), "Bir iki");
        let a = serde_json::json!({"content":[{"type":"text","text":"Merhaba"}]});
        assert_eq!(extract_text("anthropic", &a), "Merhaba");
        let o = serde_json::json!({"choices":[{"message":{"content":"Selam"}}]});
        assert_eq!(extract_text("openai", &o), "Selam");
        let c = serde_json::json!({"choices":[{"message":{"content":[{"type":"text","text":"Parça"}]}}]});
        assert_eq!(extract_text("compat", &c), "Parça");
        assert_eq!(extract_text("openai", &serde_json::json!({})), "");
    }

    #[test]
    fn ret_ve_kesilme_sessiz_gecmez() {
        let blocked = serde_json::json!({"promptFeedback":{"blockReason":"SAFETY"}});
        assert!(refusal("gemini", &blocked).unwrap().contains("reddetti"));
        let cut = serde_json::json!({"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[]}}]});
        assert!(refusal("gemini", &cut).unwrap().contains("yarıda"));
        let ok = serde_json::json!({"candidates":[{"finishReason":"STOP"}]});
        assert!(refusal("gemini", &ok).is_none());
        assert!(refusal("anthropic", &serde_json::json!({"stop_reason":"max_tokens"})).is_some());
        assert!(refusal("anthropic", &serde_json::json!({"stop_reason":"end_turn"})).is_none());
        let r = serde_json::json!({"choices":[{"message":{"content":null,"refusal":"Yapamam"},"finish_reason":"stop"}]});
        assert!(refusal("openai", &r).unwrap().contains("Yapamam"));
        assert!(refusal("compat", &serde_json::json!({"choices":[{"finish_reason":"length"}]})).is_some());
        assert!(refusal("compat", &serde_json::json!({"choices":[{"finish_reason":"stop"}]})).is_none());
    }
}
