// GitHub OAuth Device Flow + kullanıcı/repo yönetimi (reqwest — tüm platformlar).
// Git senkronu ayrı: masaüstü git2 → github_git.rs, mobil reqwest API → github_api.rs.
use serde::Serialize;

const UA: &str = "Loomen-App";
const API: &str = "https://api.github.com";

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .expect("reqwest client")
}

// ---------- OAuth Device Flow ----------

#[derive(Serialize)]
pub struct DeviceStart {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[tauri::command]
pub async fn github_device_start(client_id: String, scope: String) -> Result<DeviceStart, String> {
    let res = http()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", scope.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = v["error_description"].as_str() {
        return Err(err.to_string());
    }
    Ok(DeviceStart {
        device_code: v["device_code"].as_str().unwrap_or_default().to_string(),
        user_code: v["user_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: v["verification_uri"]
            .as_str()
            .unwrap_or("https://github.com/login/device")
            .to_string(),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
    })
}

#[derive(Serialize)]
pub struct DevicePoll {
    /// "ok" | "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | hata
    status: String,
    access_token: Option<String>,
}

#[tauri::command]
pub async fn github_device_poll(
    client_id: String,
    device_code: String,
) -> Result<DevicePoll, String> {
    let res = http()
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(tok) = v["access_token"].as_str() {
        Ok(DevicePoll {
            status: "ok".into(),
            access_token: Some(tok.to_string()),
        })
    } else {
        Ok(DevicePoll {
            status: v["error"].as_str().unwrap_or("unknown_error").to_string(),
            access_token: None,
        })
    }
}

// ---------- Kullanıcı + Repo yönetimi ----------

#[derive(Serialize)]
pub struct GhUser {
    login: String,
    name: Option<String>,
    avatar_url: String,
}

#[tauri::command]
pub async fn github_user(token: String) -> Result<GhUser, String> {
    let res = http()
        .get(format!("{API}/user"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("GitHub kullanıcı hatası: {}", res.status()));
    }
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(GhUser {
        login: v["login"].as_str().unwrap_or_default().to_string(),
        name: v["name"].as_str().map(|s| s.to_string()),
        avatar_url: v["avatar_url"].as_str().unwrap_or_default().to_string(),
    })
}

#[derive(Serialize)]
pub struct GhRepo {
    name: String,
    full_name: String,
    private: bool,
    default_branch: String,
    clone_url: String,
    updated_at: String,
}

fn to_repo(v: &serde_json::Value) -> GhRepo {
    GhRepo {
        name: v["name"].as_str().unwrap_or_default().to_string(),
        full_name: v["full_name"].as_str().unwrap_or_default().to_string(),
        private: v["private"].as_bool().unwrap_or(false),
        default_branch: v["default_branch"].as_str().unwrap_or("main").to_string(),
        clone_url: v["clone_url"].as_str().unwrap_or_default().to_string(),
        updated_at: v["updated_at"].as_str().unwrap_or_default().to_string(),
    }
}

#[tauri::command]
pub async fn github_list_repos(token: String) -> Result<Vec<GhRepo>, String> {
    let res = http()
        .get(format!(
            "{API}/user/repos?per_page=100&sort=updated&affiliation=owner"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Repo listesi hatası: {}", res.status()));
    }
    let arr: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(arr
        .as_array()
        .map(|a| a.iter().map(to_repo).collect())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn github_create_repo(
    token: String,
    name: String,
    private: bool,
) -> Result<GhRepo, String> {
    let body = serde_json::json!({
        "name": name,
        "private": private,
        "auto_init": false, // boş repo → ilk senkron temiz push (unrelated-history merge'ü yok)
        "description": "Loomen kasası"
    });
    let res = http()
        .post(format!("{API}/user/repos"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = v["message"].as_str().unwrap_or("repo oluşturulamadı");
        return Err(format!("{msg} ({status})"));
    }
    Ok(to_repo(&v))
}
