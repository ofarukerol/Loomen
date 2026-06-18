// GitHub senkronizasyonu: OAuth Device Flow + repo yönetimi (reqwest) + iki yönlü git senkron (git2).
use git2::{
    build::CheckoutBuilder, Cred, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks,
    Repository, RepositoryInitOptions, Signature,
};
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
        "auto_init": true,
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

// ---------- İki yönlü git senkron (git2) ----------

#[derive(Serialize)]
pub struct SyncResult {
    committed: bool,
    pulled: bool,
    message: String,
}

fn do_sync(
    path: String,
    remote_url: String,
    token: String,
    name: String,
    email: String,
) -> Result<SyncResult, String> {
    let me = |e: git2::Error| e.to_string();
    let branch = "main";

    // Repo aç ya da main dalıyla başlat.
    let repo = match Repository::open(&path) {
        Ok(r) => r,
        Err(_) => {
            let mut o = RepositoryInitOptions::new();
            o.initial_head(branch);
            Repository::init_opts(&path, &o).map_err(me)?
        }
    };

    // origin uzak deposunu garanti et.
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", &remote_url).map_err(me)?;
    } else {
        repo.remote("origin", &remote_url).map_err(me)?;
    }

    let sig = Signature::now(&name, &email).map_err(me)?;

    // Tüm değişiklikleri sahnele + (değişiklik varsa) commit'le.
    let mut index = repo.index().map_err(me)?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(me)?;
    index.write().map_err(me)?;
    let tree_id = index.write_tree().map_err(me)?;
    let tree = repo.find_tree(tree_id).map_err(me)?;

    let head_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let need_commit = match &head_commit {
        Some(c) => c.tree_id() != tree_id,
        None => true,
    };
    let mut committed = false;
    if need_commit {
        let parents: Vec<&git2::Commit> = head_commit.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, "Loomen senkron", &tree, &parents)
            .map_err(me)?;
        committed = true;
    }

    // credentials yardımcısı (token ile HTTPS).
    let make_cb = |tok: String| {
        let mut cb = RemoteCallbacks::new();
        cb.credentials(move |_u, _us, _a| Cred::userpass_plaintext("x-access-token", &tok));
        cb
    };

    // Fetch (uzak boşsa hata olabilir → yoksay).
    {
        let mut remote = repo.find_remote("origin").map_err(me)?;
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(make_cb(token.clone()));
        let _ = remote.fetch(&[branch], Some(&mut fo), None);
    }

    // FETCH_HEAD varsa birleştir (ff veya merge commit).
    let mut pulled = false;
    if let Ok(fetch_ref) = repo.find_reference("FETCH_HEAD") {
        if let Ok(fetch_commit) = repo.reference_to_annotated_commit(&fetch_ref) {
            let (analysis, _) = repo.merge_analysis(&[&fetch_commit]).map_err(me)?;
            if analysis.is_up_to_date() {
                // güncel
            } else if analysis.is_fast_forward() {
                let refname = format!("refs/heads/{branch}");
                match repo.find_reference(&refname) {
                    Ok(mut r) => {
                        r.set_target(fetch_commit.id(), "ff").map_err(me)?;
                    }
                    Err(_) => {
                        repo.reference(&refname, fetch_commit.id(), true, "ff")
                            .map_err(me)?;
                    }
                }
                repo.set_head(&refname).map_err(me)?;
                repo.checkout_head(Some(CheckoutBuilder::default().force()))
                    .map_err(me)?;
                pulled = true;
            } else {
                // gerçek birleştirme
                repo.merge(&[&fetch_commit], None, None).map_err(me)?;
                let mut idx = repo.index().map_err(me)?;
                if idx.has_conflicts() {
                    let _ = repo.cleanup_state();
                    return Err(
                        "Çakışma: yerel ve uzak değişiklikler çakıştı. Notları elle düzenleyip tekrar deneyin.".into(),
                    );
                }
                let tid = idx.write_tree().map_err(me)?;
                let merged = repo.find_tree(tid).map_err(me)?;
                let local = repo.head().map_err(me)?.peel_to_commit().map_err(me)?;
                let remote_c = repo.find_commit(fetch_commit.id()).map_err(me)?;
                repo.commit(Some("HEAD"), &sig, &sig, "Loomen birleştirme", &merged, &[&local, &remote_c])
                    .map_err(me)?;
                let _ = repo.cleanup_state();
                repo.checkout_head(Some(CheckoutBuilder::default().force()))
                    .map_err(me)?;
                pulled = true;
            }
        }
    }

    // Push (yerel dal adını uzak main'e eşle).
    {
        let mut remote = repo.find_remote("origin").map_err(me)?;
        let local_branch = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()))
            .unwrap_or_else(|| branch.to_string());
        let refspec = format!("refs/heads/{local_branch}:refs/heads/{branch}");
        let mut po = PushOptions::new();
        po.remote_callbacks(make_cb(token.clone()));
        remote
            .push(&[refspec.as_str()], Some(&mut po))
            .map_err(|e| format!("Push hatası: {e}"))?;
    }

    Ok(SyncResult {
        committed,
        pulled,
        message: "ok".into(),
    })
}

#[tauri::command]
pub async fn git_sync(
    path: String,
    remote_url: String,
    token: String,
    name: String,
    email: String,
) -> Result<SyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || do_sync(path, remote_url, token, name, email))
        .await
        .map_err(|e| e.to_string())?
}
