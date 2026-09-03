//! Sağlayıcı-agnostik LLM sohbeti (akışlı).
//!
//! Tüm HTTP trafiği burada, Rust tarafında olur — projedeki mevcut kural (webview'de `fetch`
//! yok, bkz. `github.rs` / `google.rs`). API anahtarı `keys.rs`'ten okunur ve doğrudan başlığa
//! yazılır; JS tarafı anahtarı hiç görmez.
//!
//! Desteklenen sağlayıcı türleri (`kind`):
//!   - `openai`    → OpenAI `/v1/chat/completions`
//!   - `compat`    → OpenAI-uyumlu herhangi bir endpoint (Ollama, LM Studio, OpenRouter,
//!                   Groq, Together, vLLM…). Bu sayede "tamamen yerel" kullanım da mümkündür:
//!                   base URL = `http://127.0.0.1:11434/v1`.
//!   - `anthropic` → Anthropic `/v1/messages`
//!   - `gemini`    → Google Generative Language `:streamGenerateContent`
//!
//! Akış: her metin parçası `ai:token` olayıyla yayınlanır; komut biterken tüm metni döner.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use super::keys;

const DEFAULT_MAX_TOKENS: u32 = 4096;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCfg {
    pub id: String,
    /// "openai" | "compat" | "anthropic" | "gemini"
    pub kind: String,
    /// Boşsa türün varsayılanı kullanılır (`compat` için zorunludur).
    pub base_url: Option<String>,
    pub model: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct ChatMsg {
    /// "user" | "assistant"
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TokenEvent {
    request_id: String,
    delta: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResult {
    pub text: String,
    pub model: String,
    /// Kullanıcı akışı yarıda kestiyse true — o ana kadar gelen metin `text` içindedir.
    pub cancelled: bool,
}

// ---------------------------------------------------------------- iptal kaydı

fn registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static R: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register(request_id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut m) = registry().lock() {
        m.insert(request_id.to_string(), flag.clone());
    }
    flag
}

fn unregister(request_id: &str) {
    if let Ok(mut m) = registry().lock() {
        m.remove(request_id);
    }
}

/// Süren bir akışı iptal et. Bilinmeyen kimlik sessizce yok sayılır (çift tıklama zararsız).
#[tauri::command]
pub fn ai_chat_cancel(request_id: String) {
    if let Ok(m) = registry().lock() {
        if let Some(flag) = m.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

// ---------------------------------------------------------------- istek kurulumu

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Loomen-App")
        .build()
        .expect("reqwest client")
}

fn base_of(p: &ProviderCfg) -> Result<String, String> {
    let explicit = p.base_url.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let url = match (p.kind.as_str(), explicit) {
        (_, Some(u)) => u.to_string(),
        ("openai", None) => "https://api.openai.com/v1".into(),
        ("anthropic", None) => "https://api.anthropic.com".into(),
        ("gemini", None) => "https://generativelanguage.googleapis.com".into(),
        ("compat", None) => return Err("OpenAI-uyumlu sağlayıcı için adres (base URL) gerekli".into()),
        (k, None) => return Err(format!("Bilinmeyen sağlayıcı türü: {k}")),
    };
    Ok(url.trim_end_matches('/').to_string())
}

/// Sağlayıcıya göre istek gövdesi + hedef URL + başlıklar. `stream` hem gövdeyi hem URL'i etkiler.
fn build(
    client: &reqwest::Client,
    p: &ProviderCfg,
    key: &str,
    messages: &[ChatMsg],
    system: Option<&str>,
    max_tokens: u32,
    stream: bool,
) -> Result<reqwest::RequestBuilder, String> {
    let base = base_of(p)?;

    match p.kind.as_str() {
        "openai" | "compat" => {
            let mut msgs: Vec<serde_json::Value> = Vec::with_capacity(messages.len() + 1);
            if let Some(sys) = system {
                msgs.push(serde_json::json!({ "role": "system", "content": sys }));
            }
            for m in messages {
                msgs.push(serde_json::json!({ "role": m.role, "content": m.content }));
            }
            let body = serde_json::json!({
                "model": p.model,
                "messages": msgs,
                "max_tokens": max_tokens,
                "stream": stream,
            });
            Ok(client
                .post(format!("{base}/chat/completions"))
                .header("Authorization", format!("Bearer {key}"))
                .json(&body))
        }
        "anthropic" => {
            let msgs: Vec<serde_json::Value> = messages
                .iter()
                .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
                .collect();
            let mut body = serde_json::json!({
                "model": p.model,
                "messages": msgs,
                "max_tokens": max_tokens,
                "stream": stream,
            });
            if let Some(sys) = system {
                body["system"] = serde_json::Value::String(sys.to_string());
            }
            Ok(client
                .post(format!("{base}/v1/messages"))
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .json(&body))
        }
        "gemini" => {
            let contents: Vec<serde_json::Value> = messages
                .iter()
                .map(|m| {
                    // Gemini'de asistan rolünün adı "model".
                    let role = if m.role == "assistant" { "model" } else { "user" };
                    serde_json::json!({ "role": role, "parts": [{ "text": m.content }] })
                })
                .collect();
            let mut body = serde_json::json!({
                "contents": contents,
                "generationConfig": { "maxOutputTokens": max_tokens },
            });
            if let Some(sys) = system {
                body["systemInstruction"] = serde_json::json!({ "parts": [{ "text": sys }] });
            }
            let method = if stream {
                "streamGenerateContent?alt=sse"
            } else {
                "generateContent"
            };
            let url = format!("{base}/v1beta/models/{}:{}", p.model, method);
            Ok(client.post(url).header("x-goog-api-key", key).json(&body))
        }
        k => Err(format!("Bilinmeyen sağlayıcı türü: {k}")),
    }
}

/// 429 gövdesinden "ne kadar sonra tekrar dene" bilgisini çıkar.
/// Gemini bunu `error.details[]` içinde `RetryInfo.retryDelay` ("23s") olarak verir.
fn retry_delay(v: &serde_json::Value) -> Option<String> {
    v["error"]["details"]
        .as_array()?
        .iter()
        .find_map(|d| d["retryDelay"].as_str())
        .map(|s| s.trim_end_matches('s').to_string())
        .filter(|s| !s.is_empty())
}

/// Hata gövdesinden kullanıcıya gösterilebilir bir mesaj çıkar (sağlayıcılar farklı şema kullanır).
fn error_message(status: reqwest::StatusCode, body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();

    // Kota dolması hata değil, bekleme sebebidir — kullanıcıya sade bir dille söylenir.
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return match parsed.as_ref().and_then(retry_delay) {
            Some(sn) => format!("Ücretsiz kullanım hakkın şu an dolu. Yaklaşık {sn} saniye sonra tekrar dene."),
            None => "Ücretsiz kullanım hakkın şu an dolu. Dakikalık sınırsa birkaç dakika içinde, \
günlük sınırsa yarın yeniden açılır. Daha hafif bir model seçmek de yardımcı olur."
                .into(),
        };
    }

    let detail = parsed
        .and_then(|v| {
            v["error"]["message"]
                .as_str()
                .or_else(|| v["error"]["msg"].as_str())
                .or_else(|| v["message"].as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| body.chars().take(300).collect());
    if detail.trim().is_empty() {
        format!("Sağlayıcı hatası ({status})")
    } else {
        format!("Sağlayıcı hatası ({status}): {detail}")
    }
}

/// Bir SSE `data:` satırından metin parçasını çıkar. `None` = bu olayda metin yok (yok sayılır).
fn delta_from(kind: &str, v: &serde_json::Value) -> Option<String> {
    match kind {
        "openai" | "compat" => v["choices"][0]["delta"]["content"].as_str().map(str::to_string),
        "anthropic" => {
            if v["type"] == "content_block_delta" {
                v["delta"]["text"].as_str().map(str::to_string)
            } else {
                None
            }
        }
        "gemini" => {
            let parts = v["candidates"][0]["content"]["parts"].as_array()?;
            let text: String = parts.iter().filter_map(|p| p["text"].as_str()).collect();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        }
        _ => None,
    }
}

fn text_from_nonstream(kind: &str, v: &serde_json::Value) -> String {
    match kind {
        "openai" | "compat" => v["choices"][0]["message"]["content"].as_str().unwrap_or_default().to_string(),
        "anthropic" => v["content"]
            .as_array()
            .map(|blocks| blocks.iter().filter_map(|b| b["text"].as_str()).collect())
            .unwrap_or_default(),
        "gemini" => v["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| parts.iter().filter_map(|p| p["text"].as_str()).collect())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

// ---------------------------------------------------------------- komutlar

/// Akışlı sohbet. Parçalar `ai:token` olayıyla gelir; komut biterken tüm metni döner.
#[tauri::command]
pub async fn ai_chat_stream(
    app: AppHandle,
    request_id: String,
    provider: ProviderCfg,
    messages: Vec<ChatMsg>,
    system: Option<String>,
    max_tokens: Option<u32>,
) -> Result<ChatResult, String> {
    if messages.is_empty() {
        return Err("Gönderilecek mesaj yok".into());
    }
    let key = keys::get(&app, &provider.id)?;
    let client = http();
    let req = build(
        &client,
        &provider,
        &key,
        &messages,
        system.as_deref(),
        max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        true,
    )?;

    let cancel = register(&request_id);
    // Buradan sonraki her çıkış yolunda kaydı temizlemek için sonucu bir kapanışta topluyoruz.
    let outcome = stream_loop(&app, &request_id, &provider, req, &cancel).await;
    unregister(&request_id);
    outcome
}

async fn stream_loop(
    app: &AppHandle,
    request_id: &str,
    provider: &ProviderCfg,
    req: reqwest::RequestBuilder,
    cancel: &Arc<AtomicBool>,
) -> Result<ChatResult, String> {
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(error_message(status, &body));
    }

    let mut stream = res.bytes_stream();
    let mut buf = String::new();
    let mut text = String::new();
    let mut cancelled = false;

    'outer: while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // Satır satır işle; son (yarım kalmış olabilecek) parçayı tamponda bırak.
        while let Some(nl) = buf.find('\n') {
            let line = buf[..nl].trim_end_matches('\r').to_string();
            buf.drain(..=nl);

            let Some(data) = line.strip_prefix("data:") else { continue };
            let data = data.trim();
            if data.is_empty() {
                continue;
            }
            if data == "[DONE]" {
                break 'outer;
            }
            let Ok(v) = serde_json::from_str::<serde_json::Value>(data) else { continue };

            // Bazı sağlayıcılar hatayı 200 gövdesinin içinde SSE olarak yollar.
            if let Some(msg) = v["error"]["message"].as_str() {
                return Err(format!("Sağlayıcı hatası: {msg}"));
            }

            if let Some(delta) = delta_from(&provider.kind, &v) {
                if delta.is_empty() {
                    continue;
                }
                text.push_str(&delta);
                let _ = app.emit(
                    "ai:token",
                    TokenEvent { request_id: request_id.to_string(), delta },
                );
            }
        }
    }

    Ok(ChatResult { text, model: provider.model.clone(), cancelled })
}

/// Sağlayıcı ayarını doğrula: anahtar + adres + model gerçekten çalışıyor mu?
/// Ayarlar ekranındaki "Test et" butonu bunu kullanır. Kısa, akışsız, ucuz bir istek atar.
#[tauri::command]
pub async fn ai_provider_test(app: AppHandle, provider: ProviderCfg) -> Result<String, String> {
    let key = keys::get(&app, &provider.id)?;
    let client = http();
    let messages = vec![ChatMsg { role: "user".into(), content: "ping".into() }];
    let req = build(&client, &provider, &key, &messages, Some("Yalnızca 'pong' yaz."), 16, false)?;

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(error_message(status, &body));
    }
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let text = text_from_nonstream(&provider.kind, &v);
    if text.trim().is_empty() {
        return Err("Sağlayıcı boş cevap döndü".into());
    }
    Ok(text.trim().to_string())
}
