// Google Takvim entegrasyonu: OAuth 2.0 Loopback + PKCE (Desktop app client) + Calendar v3.
//
// Neden Device Flow değil: Google'ın "Limited-Input Device" akışı yalnızca sınırlı bir scope
// listesini (email/openid/profile/drive.appdata/drive.file/youtube…) destekler — Calendar bu
// listede YOKTUR. Bu yüzden masaüstü için doğru yol: tarayıcıda onay → 127.0.0.1 loopback
// redirect + PKCE (code_verifier/challenge). Yerel tek seferlik HTTP dinleyici kodu yakalar.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const UA: &str = "Loomen-App";
const CAL_API: &str = "https://www.googleapis.com/calendar/v3";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const LOGIN_TIMEOUT_SECS: u64 = 300; // kullanıcının tarayıcıda onaylaması için süre

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .expect("reqwest client")
}

/// URL-safe base64 (padding'siz) rastgele dize — PKCE verifier ve state için.
fn rand_b64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

/// PKCE (code_verifier, code_challenge=S256(verifier)).
fn pkce() -> (String, String) {
    let verifier = rand_b64(48); // 64 karakter → 43..128 aralığında
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

// ---------- Token modeli ----------

#[derive(Serialize, Clone)]
pub struct GoogleTokens {
    access_token: String,
    /// İlk girişte gelir; refresh çağrılarında genelde gelmez (eski değer korunmalı).
    refresh_token: Option<String>,
    /// Saniye cinsinden geçerlilik (genelde 3599).
    expires_in: u64,
    scope: String,
    token_type: String,
}

fn tokens_from(v: &Value) -> GoogleTokens {
    GoogleTokens {
        access_token: v["access_token"].as_str().unwrap_or_default().to_string(),
        refresh_token: v["refresh_token"].as_str().map(|s| s.to_string()),
        expires_in: v["expires_in"].as_u64().unwrap_or(3600),
        scope: v["scope"].as_str().unwrap_or_default().to_string(),
        token_type: v["token_type"].as_str().unwrap_or("Bearer").to_string(),
    }
}

// ---------- Loopback + PKCE giriş ----------

/// Loopback dinleyiciden tek istek bekleyip `?code=...&state=...` ayrıştırır.
/// Tarayıcıya küçük bir "kapatabilirsiniz" sayfası döner. favicon vb. istekleri yok sayar.
fn wait_for_code(listener: TcpListener, expected_state: String) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(LOGIN_TIMEOUT_SECS);

    loop {
        if Instant::now() > deadline {
            return Err("Giriş zaman aşımına uğradı.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                // Tarayıcı preconnect'leri veri göndermeden soket açabilir → okuma zaman aşımı + boş okumaları atla.
                stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
                let mut buf = [0u8; 8192];
                let n = match stream.read(&mut buf) {
                    Ok(0) => continue,
                    Ok(n) => n,
                    Err(_) => continue,
                };
                let req = String::from_utf8_lossy(&buf[..n]);
                let path = req
                    .lines()
                    .next()
                    .and_then(|l| l.split_whitespace().nth(1))
                    .unwrap_or("/");

                // Göreli path'i mutlak URL'ye çevirip query çiftlerini ayrıştır.
                let url = reqwest::Url::parse(&format!("http://127.0.0.1{path}"))
                    .map_err(|e| e.to_string())?;
                let mut code: Option<String> = None;
                let mut state: Option<String> = None;
                let mut oauth_err: Option<String> = None;
                for (k, val) in url.query_pairs() {
                    match k.as_ref() {
                        "code" => code = Some(val.into_owned()),
                        "state" => state = Some(val.into_owned()),
                        "error" => oauth_err = Some(val.into_owned()),
                        _ => {}
                    }
                }

                // İlgisiz istek (örn. /favicon.ico) → 204 ile geç, beklemeye devam et.
                if code.is_none() && oauth_err.is_none() {
                    let _ = stream.write_all(
                        b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n",
                    );
                    continue;
                }

                let body = "<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\">\
<title>Loomen</title><body style=\"font-family:system-ui,sans-serif;text-align:center;padding-top:4rem;color:#222\">\
<h2>Loomen · Google Takvim</h2><p>Giriş tamamlandı. Bu sekmeyi kapatıp uygulamaya dönebilirsiniz.</p>\
<script>setTimeout(function(){window.close()},800)</script></body></html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();

                if let Some(e) = oauth_err {
                    return Err(e);
                }
                if state.as_deref() != Some(expected_state.as_str()) {
                    return Err("Güvenlik doğrulaması başarısız (state uyuşmadı).".into());
                }
                return code.ok_or_else(|| "Yetki kodu alınamadı.".into());
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<GoogleTokens, String> {
    let res = http()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(e) = v["error"].as_str() {
        let d = v["error_description"].as_str().unwrap_or("");
        return Err(format!("{e}: {d}"));
    }
    Ok(tokens_from(&v))
}

/// Tarayıcıda OAuth onayı başlat, loopback'te kodu yakala, token'a çevir.
#[tauri::command]
pub async fn google_login(
    app: AppHandle,
    client_id: String,
    client_secret: String,
    scope: String,
) -> Result<GoogleTokens, String> {
    // Rastgele loopback portuna bağlan (Google "Desktop app" client'ında herhangi bir 127.0.0.1 portu geçerlidir).
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let (verifier, challenge) = pkce();
    let state = rand_b64(18);

    let auth_url = reqwest::Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", scope.as_str()),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("state", state.as_str()),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .map_err(|e| e.to_string())?;

    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| e.to_string())?;

    // Dinleme bloklayıcı → ayrı iş parçacığında bekle.
    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(listener, state))
        .await
        .map_err(|e| e.to_string())??;

    exchange_code(&client_id, &client_secret, &code, &verifier, &redirect_uri).await
}

// ---------- Mobil OAuth: özel şema (deep-link) + PKCE, client_secret YOK ----------
// Mobilde loopback yok. Akış JS-orkestralı: google_auth_url → tarayıcı → deep-link redirect →
// JS kodu çıkarır → google_exchange. iOS "public" client secret istemez.

#[derive(Serialize)]
pub struct AuthUrl {
    url: String,
    verifier: String,
    state: String,
}

/// Mobil: verilen özel şema redirect'i ile OAuth onay URL'i + PKCE (verifier/state) üret.
#[tauri::command]
pub fn google_auth_url(client_id: String, scope: String, redirect_uri: String) -> Result<AuthUrl, String> {
    let (verifier, challenge) = pkce();
    let state = rand_b64(18);
    let url = reqwest::Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", scope.as_str()),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("state", state.as_str()),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(AuthUrl {
        url: url.to_string(),
        verifier,
        state,
    })
}

/// Mobil: authorization code → token (PKCE, secret'sız).
#[tauri::command]
pub async fn google_exchange(
    client_id: String,
    code: String,
    verifier: String,
    redirect_uri: String,
) -> Result<GoogleTokens, String> {
    let res = http()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(e) = v["error"].as_str() {
        let d = v["error_description"].as_str().unwrap_or("");
        return Err(format!("{e}: {d}"));
    }
    Ok(tokens_from(&v))
}

/// Mobil: refresh (secret'sız — iOS public client).
#[tauri::command]
pub async fn google_refresh_pkce(
    client_id: String,
    refresh_token: String,
) -> Result<GoogleTokens, String> {
    let res = http()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(e) = v["error"].as_str() {
        let d = v["error_description"].as_str().unwrap_or("");
        return Err(format!("{e}: {d}"));
    }
    let mut t = tokens_from(&v);
    if t.refresh_token.is_none() {
        t.refresh_token = Some(refresh_token);
    }
    Ok(t)
}

/// Refresh token ile yeni access token al (refresh_token korunur — yanıtta gelmez).
#[tauri::command]
pub async fn google_refresh(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<GoogleTokens, String> {
    let res = http()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(e) = v["error"].as_str() {
        let d = v["error_description"].as_str().unwrap_or("");
        return Err(format!("{e}: {d}"));
    }
    let mut t = tokens_from(&v);
    // Refresh yanıtı yeni refresh_token içermez → çağıran eskisini saklamaya devam etmeli.
    if t.refresh_token.is_none() {
        t.refresh_token = Some(refresh_token);
    }
    Ok(t)
}

// ---------- Kullanıcı bilgisi ----------

#[derive(Serialize)]
pub struct GUser {
    email: String,
    name: Option<String>,
    picture: Option<String>,
}

#[tauri::command]
pub async fn google_userinfo(access_token: String) -> Result<GUser, String> {
    let res = http()
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Kullanıcı bilgisi hatası: {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(GUser {
        email: v["email"].as_str().unwrap_or_default().to_string(),
        name: v["name"].as_str().map(|s| s.to_string()),
        picture: v["picture"].as_str().map(|s| s.to_string()),
    })
}

// ---------- Takvim listesi ----------

#[derive(Serialize)]
pub struct GCalendar {
    id: String,
    summary: String,
    primary: bool,
    background_color: Option<String>,
}

#[tauri::command]
pub async fn google_list_calendars(access_token: String) -> Result<Vec<GCalendar>, String> {
    let res = http()
        .get(format!("{CAL_API}/users/me/calendarList?minAccessRole=writer"))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Takvim listesi hatası: {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    let items = v["items"].as_array().cloned().unwrap_or_default();
    Ok(items
        .iter()
        .map(|c| GCalendar {
            id: c["id"].as_str().unwrap_or_default().to_string(),
            summary: c["summary"].as_str().unwrap_or_default().to_string(),
            primary: c["primary"].as_bool().unwrap_or(false),
            background_color: c["backgroundColor"].as_str().map(|s| s.to_string()),
        })
        .collect())
}

// ---------- Etkinlik okuma (pull) ----------

#[derive(Serialize)]
pub struct GEvent {
    id: String,
    summary: String,
    /// ISO tarih (all-day) ya da RFC3339 dateTime.
    start: String,
    end: String,
    all_day: bool,
    html_link: Option<String>,
    /// Loomen tarafından oluşturulmuş bir görev mi (extendedProperties.private.loomen == "1").
    loomen: bool,
}

#[tauri::command]
pub async fn google_list_events(
    access_token: String,
    calendar_id: String,
    time_min: String,
    time_max: String,
) -> Result<Vec<GEvent>, String> {
    let url = reqwest::Url::parse_with_params(
        &format!("{CAL_API}/calendars/{}/events", urlencode_path(&calendar_id)),
        &[
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
            ("maxResults", "250"),
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
        ],
    )
    .map_err(|e| e.to_string())?;
    let res = http()
        .get(url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Etkinlik listesi hatası: {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    let items = v["items"].as_array().cloned().unwrap_or_default();
    Ok(items
        .iter()
        .filter(|e| e["status"].as_str() != Some("cancelled"))
        .map(|e| {
            let all_day = e["start"]["date"].is_string();
            let start = e["start"]["dateTime"]
                .as_str()
                .or_else(|| e["start"]["date"].as_str())
                .unwrap_or_default()
                .to_string();
            let end = e["end"]["dateTime"]
                .as_str()
                .or_else(|| e["end"]["date"].as_str())
                .unwrap_or_default()
                .to_string();
            let loomen = e["extendedProperties"]["private"]["loomen"].as_str() == Some("1");
            GEvent {
                id: e["id"].as_str().unwrap_or_default().to_string(),
                summary: e["summary"].as_str().unwrap_or("(başlıksız)").to_string(),
                start,
                end,
                all_day,
                html_link: e["htmlLink"].as_str().map(|s| s.to_string()),
                loomen,
            }
        })
        .collect())
}

// ---------- Etkinlik yazma (push) ----------

/// Path segmentinde geçen `@`, `#` gibi karakterleri kaçır (takvim id'leri e-posta olabilir).
fn urlencode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[derive(Serialize)]
pub struct UpsertResult {
    id: String,
}

/// event_id verilirse PATCH (güncelle), yoksa POST (oluştur). Dönen Google event id.
#[tauri::command]
pub async fn google_upsert_event(
    access_token: String,
    calendar_id: String,
    event_id: Option<String>,
    payload: Value,
) -> Result<UpsertResult, String> {
    let base = format!("{CAL_API}/calendars/{}/events", urlencode_path(&calendar_id));
    let client = http();
    let req = match &event_id {
        Some(id) => client
            .patch(format!("{base}/{}", urlencode_path(id)))
            .bearer_auth(&access_token)
            .json(&payload),
        None => client.post(&base).bearer_auth(&access_token).json(&payload),
    };
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    // PATCH bilinmeyen id'de 404/410 verebilir → çağıran yeniden oluşturmak için silebilir.
    if !status.is_success() {
        let msg = v["error"]["message"].as_str().unwrap_or("etkinlik yazılamadı");
        return Err(format!("{msg} ({status})"));
    }
    Ok(UpsertResult {
        id: v["id"].as_str().unwrap_or_default().to_string(),
    })
}

/// Etkinliği sil. Zaten silinmiş (404/410) durumları başarı sayılır.
#[tauri::command]
pub async fn google_delete_event(
    access_token: String,
    calendar_id: String,
    event_id: String,
) -> Result<(), String> {
    let url = format!(
        "{CAL_API}/calendars/{}/events/{}",
        urlencode_path(&calendar_id),
        urlencode_path(&event_id)
    );
    let res = http()
        .delete(url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let code = res.status().as_u16();
    if res.status().is_success() || code == 404 || code == 410 {
        Ok(())
    } else {
        Err(format!("Etkinlik silinemedi: {}", res.status()))
    }
}
