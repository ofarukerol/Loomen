//! Konuşma tanıma (ses → metin) — "sesle sor" düğmesinin arka ucu.
//!
//! Kayıt webview'de ham PCM olarak yakalanır, WAV'a kodlanır ve base64 olarak buraya gelir;
//! ağa çıkan taraf yine yalnızca Rust'tır (llm.rs ile aynı kural — anahtar webview'e hiç
//! dönmez).
//!
//! Sağlayıcıya göre iki ayrı yol var:
//!   - `gemini`             → `:generateContent` çağrısına sesi `inline_data` olarak gömer;
//!                            aynı sohbet modeli sesi de anlar, ayrı model gerekmez.
//!   - `openai` / `compat`  → OpenAI'nin `/audio/transcriptions` ucu (multipart). Buradaki
//!                            model SOHBET MODELİ DEĞİLDİR (gpt-5 bu uçta çalışmaz), ayrı
//!                            bir konuşma modeli gerekir: `stt_model`, varsayılanı `whisper-1`.
//!                            `compat` sayesinde tamamen yerel çalışan bir whisper sunucusu
//!                            da kullanılabilir.
//!   - `anthropic`          → ses desteği yok; kullanıcıya ne yapacağını söyleyen bir hata.
//!
//! Dönen değer yalnızca metindir: uygulama onu sohbet kutusuna yazar, kullanıcı görmeden
//! hiçbir şey gönderilmez.

use base64::Engine;
use tauri::AppHandle;

use super::keys;
use super::llm::ProviderCfg;

/// OpenAI uyumlu uçlarda ses için varsayılan model (sohbet modeli burada çalışmaz).
const DEFAULT_STT_MODEL: &str = "whisper-1";

/// Sesin ne kadar büyüyebileceği (base64 çözülmüş hâli). ~25 MB OpenAI'nin de sınırı;
/// 16 kHz mono WAV'da bu yaklaşık 13 dakika konuşma eder — bir soru için fazlasıyla yeter.
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Loomen-App")
        .build()
        .expect("reqwest client")
}

/// Modelden yalnız düz döküm istenir; "işte metin:" gibi girişler soruyu bozardı.
const GEMINI_PROMPT: &str = "Bu ses kaydındaki konuşmayı olduğu gibi yaz. \
Yalnızca konuşulan metni döndür; açıklama, başlık, tırnak ya da zaman damgası ekleme. \
Ses boşsa ya da anlaşılmıyorsa boş cevap ver.";

/// Konuşmayı metne çevir. `audio_base64` = WAV baytlarının base64'ü.
#[tauri::command]
pub async fn ai_transcribe(
    app: AppHandle,
    provider: ProviderCfg,
    audio_base64: String,
    // `language`: arayüz dili (tr/en/ar) — OpenAI uçlarına ipucu geçilir, isabeti artırır.
    language: Option<String>,
) -> Result<String, String> {
    let audio = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.as_bytes())
        .map_err(|_| "Ses verisi çözülemedi".to_string())?;
    if audio.is_empty() {
        return Err("Ses kaydı boş".into());
    }
    if audio.len() > MAX_AUDIO_BYTES {
        return Err("Ses kaydı çok uzun; daha kısa konuşup tekrar deneyin".into());
    }

    let key = keys::get(&app, &provider.id)?;
    let client = http();

    match provider.kind.as_str() {
        "gemini" => gemini(&client, &provider, &key, &audio).await,
        "openai" | "compat" => openai(&client, &provider, &key, audio, language.as_deref()).await,
        "anthropic" => Err("Anthropic ses çözümlemeyi desteklemiyor. \
Sesle sormak için OpenAI, Google Gemini ya da kendi sunucunuzu seçin."
            .into()),
        k => Err(format!("Bilinmeyen sağlayıcı türü: {k}")),
    }
}

async fn gemini(
    client: &reqwest::Client,
    p: &ProviderCfg,
    key: &str,
    audio: &[u8],
) -> Result<String, String> {
    let base = super::llm::base_of(p)?;
    let data = base64::engine::general_purpose::STANDARD.encode(audio);
    // Ses için sohbet modeli kullanılır; kullanıcı ayrı bir model yazdıysa o kazanır.
    let model = p.stt_model.as_deref().map(str::trim).filter(|s| !s.is_empty()).unwrap_or(&p.model);
    let body = serde_json::json!({
        "contents": [{
            "role": "user",
            "parts": [
                { "text": GEMINI_PROMPT },
                { "inline_data": { "mime_type": "audio/wav", "data": data } }
            ]
        }],
        // Döküm yaratıcılık işi değil: sıcaklık 0, model duyduğuna sadık kalsın.
        "generationConfig": { "temperature": 0 }
    });

    let res = client
        .post(format!("{base}/v1beta/models/{model}:generateContent"))
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(super::llm::error_message(status, &text));
    }
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let out: String = v["candidates"][0]["content"]["parts"]
        .as_array()
        .map(|parts| parts.iter().filter_map(|p| p["text"].as_str()).collect())
        .unwrap_or_default();
    Ok(out.trim().to_string())
}

async fn openai(
    client: &reqwest::Client,
    p: &ProviderCfg,
    key: &str,
    audio: Vec<u8>,
    language: Option<&str>,
) -> Result<String, String> {
    let base = super::llm::base_of(p)?;
    let model = p
        .stt_model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_STT_MODEL)
        .to_string();

    let part = reqwest::multipart::Part::bytes(audio)
        .file_name("soru.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", model)
        .text("response_format", "json")
        .part("file", part);
    // Dil ipucu: yanlış dile kayan dökümleri belirgin biçimde azaltır. Bilinmeyen kod
    // gönderilmez — sağlayıcı ISO-639-1 bekler, arayüz dilleri zaten o biçimde.
    if let Some(l) = language.filter(|l| matches!(*l, "tr" | "en" | "ar")) {
        form = form.text("language", l.to_string());
    }

    let res = client
        .post(format!("{base}/audio/transcriptions"))
        .header("Authorization", format!("Bearer {key}"))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(super::llm::error_message(status, &text));
    }
    // Uçtan `{"text": "..."}` gelir; bazı uyumlu sunucular düz metin döndürüyor.
    let out = match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) => v["text"].as_str().unwrap_or_default().to_string(),
        Err(_) => text.clone(),
    };
    Ok(out.trim().to_string())
}
