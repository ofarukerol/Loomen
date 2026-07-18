// GitHub REST (Git Data API) tabanlı iki yönlü senkron — reqwest, TÜM platformlar (mobil dahil).
// git2/openssl gerektirmez. Dosya bazlı 3-yönlü birleştirme (base = son senkron commit'i):
// çakışmada veri KAYBEDİLMEZ — yerel korunur, uzak kopya "<ad> (çakışma).<uzantı>" olarak yazılır.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, HashSet};
use std::path::Path;

const UA: &str = "Loomen-App";
const API: &str = "https://api.github.com";

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .expect("reqwest client")
}

#[derive(Serialize)]
pub struct ApiSyncResult {
    /// Yeni senkron noktası (commit sha). Store bunu saklar, bir sonraki senkronda base olarak yollar.
    base_sha: Option<String>,
    pulled: usize,
    pushed: usize,
    conflicts: Vec<String>,
    message: String,
}

/// Git blob SHA-1: sha1("blob {len}\0" + içerik). Uzak/base ağacındaki sha ile karşılaştırmak için.
fn git_blob_sha(content: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(format!("blob {}\0", content.len()).as_bytes());
    h.update(content);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Çakışan uzak dosya için ayrı ad: "Not.md" -> "Not (çakışma).md".
fn conflict_path(p: &str) -> String {
    let slash = p.rfind('/').map_or(0, |i| i + 1);
    match p[slash..].rfind('.') {
        Some(rel) => {
            let dot = slash + rel;
            format!("{} (çakışma){}", &p[..dot], &p[dot..])
        }
        None => format!("{p} (çakışma)"),
    }
}

/// Yerel kasadaki tüm dosyaları oku (rel yol -> içerik). Gizli (.) klasörler atlanır (.git/.trash).
fn read_local(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut out = BTreeMap::new();
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let p = e.path();
            if p.is_dir() {
                walk(root, &p, out);
            } else if let Ok(bytes) = std::fs::read(&p) {
                if let Ok(rel) = p.strip_prefix(root) {
                    out.insert(rel.to_string_lossy().replace('\\', "/"), bytes);
                }
            }
        }
    }
    walk(root, root, &mut out);
    out
}

// ---------- GitHub Git Data API yardımcıları ----------

async fn gh_get(c: &reqwest::Client, token: &str, url: &str) -> Result<Option<Value>, String> {
    let res = c
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status().as_u16() == 404 {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(format!("GitHub GET {} → {}", url, res.status()));
    }
    Ok(Some(res.json().await.map_err(|e| e.to_string())?))
}

async fn gh_send(
    c: &reqwest::Client,
    token: &str,
    method: reqwest::Method,
    url: &str,
    body: Value,
) -> Result<Value, String> {
    let res = c
        .request(method, url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = v["message"].as_str().unwrap_or("GitHub API hatası");
        return Err(format!("{msg} ({status})"));
    }
    Ok(v)
}

/// Dalın head commit sha'sı (yoksa None = boş repo / dal yok).
async fn head_sha(c: &reqwest::Client, token: &str, o: &str, r: &str, br: &str) -> Option<String> {
    let url = format!("{API}/repos/{o}/{r}/git/ref/heads/{br}");
    gh_get(c, token, &url)
        .await
        .ok()
        .flatten()
        .and_then(|v| v["object"]["sha"].as_str().map(String::from))
}

/// Commit'in tree sha'sı.
async fn commit_tree(c: &reqwest::Client, token: &str, o: &str, r: &str, sha: &str) -> Option<String> {
    let url = format!("{API}/repos/{o}/{r}/git/commits/{sha}");
    gh_get(c, token, &url)
        .await
        .ok()
        .flatten()
        .and_then(|v| v["tree"]["sha"].as_str().map(String::from))
}

/// Tree'yi özyinelemeli oku → (rel yol -> blob sha). Yalnız blob'lar.
async fn tree_files(
    c: &reqwest::Client,
    token: &str,
    o: &str,
    r: &str,
    tree_sha: &str,
) -> Result<BTreeMap<String, String>, String> {
    let url = format!("{API}/repos/{o}/{r}/git/trees/{tree_sha}?recursive=1");
    let mut out = BTreeMap::new();
    if let Some(v) = gh_get(c, token, &url).await? {
        if let Some(arr) = v["tree"].as_array() {
            for e in arr {
                if e["type"].as_str() == Some("blob") {
                    if let (Some(p), Some(s)) = (e["path"].as_str(), e["sha"].as_str()) {
                        out.insert(p.to_string(), s.to_string());
                    }
                }
            }
        }
    }
    Ok(out)
}

async fn get_blob(c: &reqwest::Client, token: &str, o: &str, r: &str, sha: &str) -> Result<Vec<u8>, String> {
    let url = format!("{API}/repos/{o}/{r}/git/blobs/{sha}");
    let v = gh_get(c, token, &url).await?.ok_or("blob bulunamadı")?;
    let b64: String = v["content"].as_str().unwrap_or_default().split_whitespace().collect();
    STANDARD.decode(b64).map_err(|e| e.to_string())
}

async fn create_blob(c: &reqwest::Client, token: &str, o: &str, r: &str, content: &[u8]) -> Result<String, String> {
    let url = format!("{API}/repos/{o}/{r}/git/blobs");
    let body = json!({ "content": STANDARD.encode(content), "encoding": "base64" });
    let v = gh_send(c, token, reqwest::Method::POST, &url, body).await?;
    v["sha"].as_str().map(String::from).ok_or_else(|| "blob sha yok".into())
}

async fn create_tree(c: &reqwest::Client, token: &str, o: &str, r: &str, entries: Vec<Value>) -> Result<String, String> {
    let url = format!("{API}/repos/{o}/{r}/git/trees");
    let v = gh_send(c, token, reqwest::Method::POST, &url, json!({ "tree": entries })).await?;
    v["sha"].as_str().map(String::from).ok_or_else(|| "tree sha yok".into())
}

async fn create_commit(
    c: &reqwest::Client,
    token: &str,
    o: &str,
    r: &str,
    message: &str,
    tree: &str,
    parents: &[String],
) -> Result<String, String> {
    let url = format!("{API}/repos/{o}/{r}/git/commits");
    let body = json!({ "message": message, "tree": tree, "parents": parents });
    let v = gh_send(c, token, reqwest::Method::POST, &url, body).await?;
    v["sha"].as_str().map(String::from).ok_or_else(|| "commit sha yok".into())
}

async fn set_ref(c: &reqwest::Client, token: &str, o: &str, r: &str, br: &str, sha: &str, exists: bool) -> Result<(), String> {
    if exists {
        let url = format!("{API}/repos/{o}/{r}/git/refs/heads/{br}");
        gh_send(c, token, reqwest::Method::PATCH, &url, json!({ "sha": sha, "force": false })).await?;
    } else {
        let url = format!("{API}/repos/{o}/{r}/git/refs");
        gh_send(c, token, reqwest::Method::POST, &url, json!({ "ref": format!("refs/heads/{br}"), "sha": sha })).await?;
    }
    Ok(())
}

// ---------- Ana senkron ----------

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_api_sync(
    path: String,
    owner: String,
    repo: String,
    branch: String,
    token: String,
    base_sha: Option<String>,
) -> Result<ApiSyncResult, String> {
    let c = http();
    let (o, r, br) = (owner.as_str(), repo.as_str(), branch.as_str());

    // 1) Uzak head + tree dosyaları
    let head = head_sha(&c, &token, o, r, br).await;
    let remote: BTreeMap<String, String> = match &head {
        Some(sha) => match commit_tree(&c, &token, o, r, sha).await {
            Some(ts) => tree_files(&c, &token, o, r, &ts).await?,
            None => BTreeMap::new(),
        },
        None => BTreeMap::new(),
    };

    // 2) Yerel dosyalar
    let root = Path::new(&path);
    let mut local = read_local(root);
    let local_sha: BTreeMap<String, String> =
        local.iter().map(|(k, v)| (k.clone(), git_blob_sha(v))).collect();

    // 3) Base tree (varsa)
    let base: BTreeMap<String, String> = match &base_sha {
        Some(sha) => match commit_tree(&c, &token, o, r, sha).await {
            Some(ts) => tree_files(&c, &token, o, r, &ts).await.unwrap_or_default(),
            None => BTreeMap::new(),
        },
        None => BTreeMap::new(),
    };

    // 4) Dosya bazlı 3-yönlü birleştirme
    let mut paths: HashSet<String> = HashSet::new();
    paths.extend(remote.keys().cloned());
    paths.extend(local.keys().cloned());
    paths.extend(base.keys().cloned());

    let mut pulled = 0usize;
    let mut pushed = 0usize;
    let mut conflicts: Vec<String> = vec![];
    let mut to_write: Vec<(String, Vec<u8>)> = vec![];
    let mut to_delete: Vec<String> = vec![];

    for p in &paths {
        let in_r = remote.contains_key(p);
        let in_l = local.contains_key(p);
        let in_b = base.contains_key(p);
        let r_sha = remote.get(p);
        let l_sha = local_sha.get(p);
        let b_sha = base.get(p);

        if in_r && in_l && r_sha == l_sha {
            continue; // özdeş
        }

        if !in_b {
            if in_r && !in_l {
                to_write.push((p.clone(), get_blob(&c, &token, o, r, r_sha.unwrap()).await?));
                pulled += 1;
            } else if !in_r && in_l {
                pushed += 1; // yerel yeni → tree'de kalır
            } else if in_r && in_l {
                // ikisi de farklı yeni → çakışma: yerel kalsın, uzak kopya yaz
                to_write.push((conflict_path(p), get_blob(&c, &token, o, r, r_sha.unwrap()).await?));
                conflicts.push(p.clone());
            }
        } else {
            let changed_r = if in_r { r_sha != b_sha } else { true };
            let changed_l = if in_l { l_sha != b_sha } else { true };
            if !changed_r && !changed_l {
                // değişmemiş
            } else if changed_r && !changed_l {
                if in_r {
                    to_write.push((p.clone(), get_blob(&c, &token, o, r, r_sha.unwrap()).await?));
                } else {
                    to_delete.push(p.clone()); // uzak sildi, yerel dokunulmamış
                }
                pulled += 1;
            } else if !changed_r && changed_l {
                pushed += 1; // yerel değişti/sildi → tree yansıtır
            } else if in_r && in_l && r_sha == l_sha {
                // ikisi de aynı değişikliği yaptı
            } else {
                // gerçek çakışma → yerel korunur, uzak kopya (varsa)
                if in_r {
                    to_write.push((conflict_path(p), get_blob(&c, &token, o, r, r_sha.unwrap()).await?));
                }
                conflicts.push(p.clone());
            }
        }
    }

    // 5) Pull sonuçlarını diske + yerel state'e uygula
    for (p, content) in &to_write {
        let full = root.join(p);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&full, content).map_err(|e| e.to_string())?;
        local.insert(p.clone(), content.clone());
    }
    for p in &to_delete {
        std::fs::remove_file(root.join(p)).ok();
        local.remove(p);
    }

    // 6) Birleşmiş yerel state'ten yeni tree + commit + ref
    let mut entries: Vec<Value> = vec![];
    let mut changed_for_push = false;
    for (p, content) in &local {
        let bsha = git_blob_sha(content);
        let sha = if remote.get(p) == Some(&bsha) {
            bsha // uzakta zaten var → blob oluşturma
        } else {
            changed_for_push = true;
            create_blob(&c, &token, o, r, content).await?
        };
        entries.push(json!({ "path": p, "mode": "100644", "type": "blob", "sha": sha }));
    }
    for p in remote.keys() {
        if !local.contains_key(p) {
            changed_for_push = true; // uzakta olup yerelde olmayan → silinmiş
        }
    }

    let new_base = if !changed_for_push {
        head.clone()
    } else {
        let tree_sha = create_tree(&c, &token, o, r, entries).await?;
        let parents: Vec<String> = head.iter().cloned().collect();
        let commit = create_commit(&c, &token, o, r, "Loomen senkron", &tree_sha, &parents).await?;
        set_ref(&c, &token, o, r, br, &commit, head.is_some()).await?;
        Some(commit)
    };

    Ok(ApiSyncResult {
        base_sha: new_base,
        pulled,
        pushed,
        conflicts,
        message: "ok".into(),
    })
}
