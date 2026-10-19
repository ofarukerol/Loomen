// GitHub REST (Git Data API) tabanlı iki yönlü senkron — reqwest, TÜM platformlar (mobil dahil).
// git2/openssl gerektirmez. Dosya bazlı 3-yönlü birleştirme (base = son senkron commit'i):
// çakışan metinler satır bazlı otomatik birleşir, örtüşen parçada yeni taraf kazanır ve kaybeden
// tarafın tam dosyası `.loomen/cakisma-gecmisi/` altına yedeklenir (LOM-51, bkz. sync_merge.rs).
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

const UA: &str = "Loomen-App";
const API: &str = "https://api.github.com";

/// HTTP istemcisi. Kurulum başarısız olabilir (TLS kökleri okunamazsa); panik yerine
/// hata döner, çağıran komut bunu arayüze mesaj olarak iletir.
fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .map_err(|e| format!("http istemcisi kurulamadı: {e}"))
}

#[derive(Serialize)]
pub struct ApiSyncResult {
    /// Yeni senkron noktası (commit sha). Store bunu saklar, bir sonraki senkronda base olarak yollar.
    base_sha: Option<String>,
    pulled: usize,
    pushed: usize,
    /// İki tarafın değişikliği otomatik birleştirilen notlar (LOM-51).
    merged: Vec<String>,
    message: String,
}

/// Git blob SHA-1: sha1("blob {len}\0" + içerik). Uzak/base ağacındaki sha ile karşılaştırmak için.
fn git_blob_sha(content: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(format!("blob {}\0", content.len()).as_bytes());
    h.update(content);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// İki tarafta da değişmiş (ya da iki tarafta da yeni) bir dosyanın içerik birleştirmesi.
#[derive(Debug, PartialEq)]
struct MergeJob {
    path: String,
    remote_sha: String,
    /// Son senkronlanan sürümün blob sha'sı; dosya iki tarafta da yeniyse None.
    base_sha: Option<String>,
}

/// Birleştirme planı: ağdan bağımsız, test edilebilir karar kısmı.
#[derive(Debug, Default, PartialEq)]
struct MergePlan {
    /// (yerel yol, uzak blob sha): uzaktan olduğu gibi alınacaklar.
    writes: Vec<(String, String)>,
    /// Uzakta silinmiş, yerelde dokunulmamış dosyalar (çöp kutusuna taşınır).
    deletes: Vec<String>,
    /// İçerik birleştirmesi gerekenler (sync_merge ile çözülür).
    merges: Vec<MergeJob>,
    pulled: usize,
    pushed: usize,
}

/// Dosya bazlı 3-yönlü birleştirme (base = son senkron). Veri kaybetmez: iki tarafta da
/// değişen dosya `merges`e girer; bir taraf silmiş öbürü değiştirmişse değiştiren kazanır.
fn plan_merge(
    remote: &BTreeMap<String, String>,
    local_sha: &BTreeMap<String, String>,
    base: &BTreeMap<String, String>,
) -> MergePlan {
    let mut plan = MergePlan::default();
    let paths: BTreeSet<&String> = remote.keys().chain(local_sha.keys()).chain(base.keys()).collect();

    for p in paths {
        let r_sha = remote.get(p);
        let l_sha = local_sha.get(p);
        let b_sha = base.get(p);
        let (in_r, in_l, in_b) = (r_sha.is_some(), l_sha.is_some(), b_sha.is_some());

        if in_r && in_l && r_sha == l_sha {
            continue; // özdeş
        }

        // Yedek klasörü dosyaları (`.loomen/`) asla birleştirilmez: aynı yolda farklı dosya varsa
        // uzak olan -2 ekiyle ayrı yola gelir, ikisi de kalır.
        // Yalnız iki taraf da base'e göre değiştiyse (ya da base yoksa); tek taraflı değişiklik normal akar.
        let both_changed = !in_b || (r_sha != b_sha && l_sha != b_sha);
        if crate::sync_merge::is_backup_path(p) && in_r && in_l && both_changed {
            if let Some(sha) = r_sha {
                let stem = p.rsplit_once('.').map_or(p.as_str(), |(a, _)| a);
                // Aynı içerik zaten bir -N kopyasında duruyorsa yeni kopya açılmaz.
                if local_sha.iter().any(|(k, v)| v == sha && k.starts_with(stem) && crate::sync_merge::is_backup_path(k)) {
                    continue;
                }
                let target = crate::sync_merge::backup_variant_path(p, |c| {
                    remote.contains_key(c) || local_sha.contains_key(c) || plan.writes.iter().any(|(w, _)| w == c)
                });
                plan.writes.push((target, sha.clone()));
                plan.pulled += 1;
            }
            continue;
        }

        if !in_b {
            // unwrap() yok: koşullar ileride değişse bile senkron ortasında çökme olmasın.
            match (r_sha, l_sha) {
                (Some(sha), None) => {
                    plan.writes.push((p.clone(), sha.clone()));
                    plan.pulled += 1;
                }
                (None, Some(_)) => plan.pushed += 1, // yerel yeni → tree'de kalır
                (Some(sha), Some(_)) => {
                    // ikisi de farklı yeni → base yok: tüm dosya, yeni taraf kazanır
                    plan.merges.push(MergeJob { path: p.clone(), remote_sha: sha.clone(), base_sha: None });
                }
                (None, None) => {}
            }
        } else {
            let changed_r = r_sha != b_sha; // uzakta yoksa da "değişti" (silindi)
            let changed_l = l_sha != b_sha;
            if !changed_r && !changed_l {
                // değişmemiş
            } else if changed_r && !changed_l {
                match r_sha {
                    Some(sha) => plan.writes.push((p.clone(), sha.clone())),
                    None => plan.deletes.push(p.clone()), // uzak sildi, yerel dokunulmamış
                }
                plan.pulled += 1;
            } else if !changed_r && changed_l {
                plan.pushed += 1; // yerel değişti/sildi → tree yansıtır
            } else if r_sha == l_sha {
                // ikisi de aynı değişikliği yaptı (ya da ikisi de sildi)
            } else {
                match (r_sha, l_sha) {
                    (Some(sha), Some(_)) => plan.merges.push(MergeJob {
                        path: p.clone(),
                        remote_sha: sha.clone(),
                        base_sha: b_sha.cloned(),
                    }),
                    // Yerel silmiş, uzak değiştirmiş: değiştiren kazanır, not geri gelir.
                    (Some(sha), None) => {
                        plan.writes.push((p.clone(), sha.clone()));
                        plan.pulled += 1;
                    }
                    // Uzak silmiş, yerel değiştirmiş: yerel kalır (tree'de zaten var).
                    (None, Some(_)) => plan.pushed += 1,
                    (None, None) => {}
                }
            }
        }
    }
    plan
}

/// Dosyayı atomik yaz: aynı klasörde yan dosya, sonra rename (yarım dosya kalmaz).
fn atomic_write(full: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut tmp = full.as_os_str().to_owned();
    tmp.push(format!(".{}.tmp", std::process::id()));
    let tmp = std::path::PathBuf::from(tmp);
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, full).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Uzakta silinen notu kalıcı silmek yerine kasanın çöp kutusuna taşı (30 gün geri
/// alınabilir). Ad biçimi uygulamanınkiyle aynı: `.trash/<ms>__<base64url(yol)>`.
fn move_to_trash(root: &Path, rel: &str) -> Result<(), String> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = root.join(".trash");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("{ms}__{}", URL_SAFE_NO_PAD.encode(rel.as_bytes())));
    std::fs::rename(root.join(rel), dest).map_err(|e| e.to_string())
}

/// Diskteki dosyanın şu anki blob sha'sı (yoksa None).
fn disk_sha(full: &Path) -> Option<String> {
    std::fs::read(full).ok().map(|b| git_blob_sha(&b))
}

/// Yerel kasadaki tüm dosyaları oku (rel yol -> içerik). Gizli (.) klasörler atlanır (.git/.trash);
/// tek istisna `.loomen` (çakışma yedekleri): senkronlanır, ama not listesinde görünmez (LOM-51).
fn read_local(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut out = BTreeMap::new();
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') && !(dir == root && name == ".loomen") {
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

/// Dalın head commit sha'sı. `Ok(None)` = dal gerçekten yok (404, boş repo).
/// Ağ/yetki hatası `Err` döner (LOM-11): eskiden hata "dal yok" sayılıyor, uzak liste
/// boş görünüyor ve yereldeki notlar "uzakta silinmiş" diye siliniyordu.
async fn head_sha(c: &reqwest::Client, token: &str, o: &str, r: &str, br: &str) -> Result<Option<String>, String> {
    let url = format!("{API}/repos/{o}/{r}/git/ref/heads/{br}");
    match gh_get(c, token, &url).await? {
        None => Ok(None),
        Some(v) => v["object"]["sha"]
            .as_str()
            .map(|s| Some(s.to_string()))
            .ok_or_else(|| "GitHub dal bilgisi okunamadı".into()),
    }
}

/// Commit'in tree sha'sı. `Ok(None)` = commit yok (404; ör. geçmiş yeniden yazılmış).
async fn commit_tree(c: &reqwest::Client, token: &str, o: &str, r: &str, sha: &str) -> Result<Option<String>, String> {
    let url = format!("{API}/repos/{o}/{r}/git/commits/{sha}");
    match gh_get(c, token, &url).await? {
        None => Ok(None),
        Some(v) => v["tree"]["sha"]
            .as_str()
            .map(|s| Some(s.to_string()))
            .ok_or_else(|| "GitHub commit bilgisi okunamadı".into()),
    }
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
    // Eksik liste = "uzakta silinmiş" sanılan notlar → yerel silme. Tam liste yoksa DUR (LOM-11).
    let v = gh_get(c, token, &url)
        .await?
        .ok_or("GitHub dosya listesi bulunamadı")?;
    if v["truncated"].as_bool() == Some(true) {
        return Err("GitHub dosya listesi eksik geldi (depo çok büyük); senkron durduruldu".into());
    }
    let arr = v["tree"].as_array().ok_or("GitHub dosya listesi okunamadı")?;
    for e in arr {
        if e["type"].as_str() == Some("blob") {
            if let (Some(p), Some(s)) = (e["path"].as_str(), e["sha"].as_str()) {
                out.insert(p.to_string(), s.to_string());
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

/// Uzakta `path` dosyasına dokunan en son commit'in zamanı (epoch saniye); öğrenilemezse None.
async fn remote_file_time(c: &reqwest::Client, token: &str, o: &str, r: &str, br: &str, path: &str) -> Option<i64> {
    let url = reqwest::Url::parse_with_params(
        &format!("{API}/repos/{o}/{r}/commits"),
        &[("sha", br), ("path", path), ("per_page", "1")],
    )
    .ok()?;
    let v = gh_get(c, token, url.as_str()).await.ok()??;
    crate::sync_merge::parse_iso8601(v[0]["commit"]["committer"]["date"].as_str()?)
}

fn file_mtime(full: &Path) -> Option<i64> {
    std::fs::metadata(full)
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

/// Birleştirme sonucunu diske ve yerel state'e uygular; kaybeden tarafın tam dosyası
/// yedek klasörüne yazılır (o da `local` içine girer, yani gönderilir).
fn apply_resolution(
    root: &Path,
    local: &mut BTreeMap<String, Vec<u8>>,
    remote: &BTreeMap<String, String>,
    p: &str,
    res: crate::sync_merge::Resolution,
    stamp: &str,
) -> Result<(), String> {
    if let Some(b) = res.backup {
        let dest = crate::sync_merge::backup_path(stamp, p, |cand| {
            local.contains_key(cand) || remote.contains_key(cand) || root.join(cand).exists()
        });
        // Önce yedek, sonra asıl dosya: ikisi arasında kesilirse yine veri kaybı olmaz.
        atomic_write(&root.join(&dest), &b)?;
        local.insert(dest, b);
    }
    atomic_write(&root.join(p), &res.content)?;
    local.insert(p.to_string(), res.content);
    Ok(())
}

/// Tek dosyayı iki taraf için birleştirir. `local` yerine diskteki GÜNCEL içerik okunur
/// (senkron sürerken kullanıcı yazmış olabilir). true = içerik gerçekten birleştirildi.
#[allow(clippy::too_many_arguments)]
async fn resolve_conflict(
    c: &reqwest::Client,
    token: &str,
    (o, r, br): (&str, &str, &str),
    root: &Path,
    local: &mut BTreeMap<String, Vec<u8>>,
    remote: &BTreeMap<String, String>,
    p: &str,
    remote_sha: &str,
    base_sha: Option<&String>,
    stamp: &str,
) -> Result<bool, String> {
    let full = root.join(p);
    let remote_bytes = get_blob(c, token, o, r, remote_sha).await?;
    let base_bytes = match base_sha {
        Some(sha) => Some(get_blob(c, token, o, r, sha).await?),
        None => None,
    };
    // Uzak zamanı öğrenilemezse uzak "eski" sayılır: yerel kazanır, uzak sürüm yedeğe gider.
    let remote_time = remote_file_time(c, token, o, r, br, p).await.unwrap_or(0);
    // Ağ işleri bitti: yerel dosya EN SON okunur, hemen ardından birleştirilip yazılır (yarış penceresi yok).
    let Ok(local_bytes) = std::fs::read(&full) else {
        // Senkron sürerken kullanıcı dosyayı silmiş: uzak sürüm geri gelir, hiçbir şey kaybolmaz.
        atomic_write(&full, &remote_bytes)?;
        local.insert(p.to_string(), remote_bytes);
        return Ok(false);
    };
    let local_time = file_mtime(&full).unwrap_or(0);
    let res = crate::sync_merge::merge_file(p, base_bytes.as_deref(), &local_bytes, &remote_bytes, local_time, remote_time);
    let identical = res.mode == crate::sync_merge::Mode::Identical;
    if identical {
        local.insert(p.to_string(), local_bytes);
        return Ok(false);
    }
    apply_resolution(root, local, remote, p, res, stamp)?;
    Ok(true)
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
    let c = http()?;
    let (o, r, br) = (owner.as_str(), repo.as_str(), branch.as_str());

    // 1) Uzak head + tree dosyaları. Okuma hatası senkronu DURDURUR (LOM-11): eksik
    //    uzak liste, yereldeki notların "uzakta silinmiş" sayılıp silinmesine yol açardı.
    let head = head_sha(&c, &token, o, r, br).await?;
    let remote: BTreeMap<String, String> = match &head {
        Some(sha) => match commit_tree(&c, &token, o, r, sha).await? {
            Some(ts) => tree_files(&c, &token, o, r, &ts).await?,
            None => return Err("GitHub'daki son kayıt okunamadı; senkron durduruldu, notlara dokunulmadı".into()),
        },
        None => BTreeMap::new(),
    };

    // 2) Yerel dosyalar
    let root = Path::new(&path);
    let mut local = read_local(root);
    let local_sha: BTreeMap<String, String> =
        local.iter().map(|(k, v)| (k.clone(), git_blob_sha(v))).collect();

    // 3) Base tree (varsa). Base commit uzakta artık yoksa (geçmiş yeniden yazılmış) boş
    //    base ile devam edilir: silme olmaz, farklar çakışma kopyası olur. Ağ hatası DURDURUR.
    let base: BTreeMap<String, String> = match &base_sha {
        Some(sha) => match commit_tree(&c, &token, o, r, sha).await? {
            Some(ts) => tree_files(&c, &token, o, r, &ts).await?,
            None => BTreeMap::new(),
        },
        None => BTreeMap::new(),
    };

    // Güvenlik: son senkronda dosya vardı ama uzak dal artık yok/boş → yereli toplu silmek
    // yerine dur. (Depo silinip yeniden açılmış ya da yanlış depo seçilmiş olabilir.)
    if remote.is_empty() && !base.is_empty() {
        return Err("GitHub deposu boş görünüyor; yerel notlar silinmedi. Depo ayarını kontrol edin".into());
    }

    // 4) Dosya bazlı 3-yönlü birleştirme (karar kısmı ağdan bağımsız: plan_merge)
    let plan = plan_merge(&remote, &local_sha, &base);
    let mut merged: Vec<String> = Vec::new();
    let stamp = crate::sync_merge::format_stamp(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    );
    let ctx = (o, r, br);

    // 5) Pull sonuçlarını diske + yerel state'e uygula. Diske dokunmadan hemen önce dosyanın
    //    okunduğu andan beri değişmediği kontrol edilir: senkron sürerken kullanıcı notu
    //    düzenlediyse üzerine yazılmaz, iki sürüm birleştirilir (LOM-9, LOM-51).
    for (p, r_sha) in &plan.writes {
        let full = root.join(p);
        let content = get_blob(&c, &token, o, r, r_sha).await?;
        if disk_sha(&full).as_ref() != local_sha.get(p) {
            if resolve_conflict(&c, &token, ctx, root, &mut local, &remote, p, r_sha, base.get(p), &stamp).await? {
                merged.push(p.clone());
            }
            continue;
        }
        atomic_write(&full, &content)?;
        local.insert(p.clone(), content);
    }
    for job in &plan.merges {
        if resolve_conflict(&c, &token, ctx, root, &mut local, &remote, &job.path, &job.remote_sha, job.base_sha.as_ref(), &stamp).await? {
            merged.push(job.path.clone());
        }
    }
    for p in &plan.deletes {
        let full = root.join(p);
        // Okunduktan sonra değiştiyse silme: kullanıcının yeni yazdığı kaybolmasın.
        if disk_sha(&full).as_ref() != local_sha.get(p) {
            if let Ok(fresh) = std::fs::read(&full) {
                local.insert(p.clone(), fresh);
            }
            continue;
        }
        if move_to_trash(root, p).is_ok() {
            local.remove(p);
        }
    }
    let (pulled, pushed) = (plan.pulled + merged.len(), plan.pushed);

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
        merged,
        message: "ok".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(items: &[(&str, &str)]) -> BTreeMap<String, String> {
        items.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn job(path: &str, remote: &str, base: Option<&str>) -> MergeJob {
        MergeJob { path: path.into(), remote_sha: remote.into(), base_sha: base.map(String::from) }
    }

    #[test]
    fn iki_tarafta_degisen_dosya_birlestirmeye_girer_kopya_olmaz() {
        let base = m(&[("Not.md", "b")]);
        let local = m(&[("Not.md", "l"), ("Not (çakışma).md", "eski")]);
        let remote = m(&[("Not.md", "r"), ("Not (çakışma).md", "eski")]);
        let plan = plan_merge(&remote, &local, &base);
        assert_eq!(plan.merges, vec![job("Not.md", "r", Some("b"))]);
        assert!(plan.writes.is_empty() && plan.deletes.is_empty());
    }

    #[test]
    fn yedek_klasorunde_farkli_dosya_birlestirilmez_ek_alir() {
        let p = ".loomen/cakisma-gecmisi/S/N.md";
        let plan = plan_merge(&m(&[(p, "r")]), &m(&[(p, "l")]), &m(&[]));
        assert!(plan.merges.is_empty());
        assert_eq!(plan.writes, vec![(".loomen/cakisma-gecmisi/S/N-2.md".to_string(), "r".to_string())]);
    }

    #[test]
    fn yedek_klasoru_tek_tarafli_degisiklik_normal_akar() {
        let p = ".loomen/cakisma-gecmisi/S/N.md";
        // Yalnız uzak değişti: yerinde güncellenir, -2 açılmaz.
        let plan = plan_merge(&m(&[(p, "r")]), &m(&[(p, "b")]), &m(&[(p, "b")]));
        assert_eq!(plan.writes, vec![(p.to_string(), "r".to_string())]);
        // Yalnız yerel değişti: uzaktan eski sürüm geri çekilmez.
        let plan = plan_merge(&m(&[(p, "b")]), &m(&[(p, "l")]), &m(&[(p, "b")]));
        assert!(plan.writes.is_empty() && plan.merges.is_empty());
        // İkisi de değişti: gelen -2 ile ayrı yola.
        let plan = plan_merge(&m(&[(p, "r")]), &m(&[(p, "l")]), &m(&[(p, "b")]));
        assert_eq!(plan.writes, vec![(".loomen/cakisma-gecmisi/S/N-2.md".to_string(), "r".to_string())]);
        // Aynı içerik zaten -2'de duruyorsa tekrar kopya açılmaz.
        let l2 = m(&[(p, "l"), (".loomen/cakisma-gecmisi/S/N-2.md", "r")]);
        let r2 = m(&[(p, "r")]);
        let plan = plan_merge(&r2, &l2, &m(&[(p, "b")]));
        assert!(plan.writes.is_empty());
    }

    #[test]
    fn iki_tarafta_yeni_dosya_base_siz_birlestirmeye_girer() {
        let plan = plan_merge(&m(&[("N.md", "r")]), &m(&[("N.md", "l")]), &m(&[]));
        assert_eq!(plan.merges, vec![job("N.md", "r", None)]);
    }

    #[test]
    fn yerel_silme_uzak_degisiklik_not_kalir() {
        let base = m(&[("X.md", "1")]);
        let plan = plan_merge(&m(&[("X.md", "2")]), &m(&[]), &base);
        assert_eq!(plan.writes, vec![("X.md".to_string(), "2".to_string())]);
        assert!(plan.merges.is_empty() && plan.deletes.is_empty());
    }

    #[test]
    fn uzak_silme_yerel_degisiklik_not_kalir() {
        let base = m(&[("X.md", "1")]);
        let plan = plan_merge(&m(&[]), &m(&[("X.md", "yerel")]), &base);
        assert!(plan.writes.is_empty() && plan.deletes.is_empty() && plan.merges.is_empty());
        assert_eq!(plan.pushed, 1);
    }

    #[test]
    fn uzak_silme_yalniz_dokunulmamis_yerelde() {
        let base = m(&[("Sil.md", "1"), ("Kalsin.md", "2")]);
        let local = m(&[("Sil.md", "1"), ("Kalsin.md", "yerelde değişti")]);
        let remote = m(&[]);
        let plan = plan_merge(&remote, &local, &base);
        assert_eq!(plan.deletes, vec!["Sil.md".to_string()]);
        assert!(plan.merges.is_empty() && plan.writes.is_empty());
    }

    #[test]
    fn ikisi_de_sildiyse_cakisma_yok() {
        let base = m(&[("X.md", "1")]);
        let plan = plan_merge(&m(&[]), &m(&[]), &base);
        assert_eq!(plan, MergePlan::default());
    }

    #[test]
    fn yedek_klasoru_okunur_diger_gizliler_atlanir() {
        let dir = std::env::temp_dir().join(format!("loomen-lom51-read-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join(".loomen/cakisma-gecmisi/S")).unwrap();
        std::fs::create_dir_all(dir.join(".trash")).unwrap();
        std::fs::write(dir.join(".loomen/cakisma-gecmisi/S/N.md"), "y").unwrap();
        std::fs::write(dir.join(".trash/x"), "t").unwrap();
        std::fs::write(dir.join("N.md"), "n").unwrap();
        let files = read_local(&dir);
        let keys: Vec<&str> = files.keys().map(|k| k.as_str()).collect();
        assert_eq!(keys, vec![".loomen/cakisma-gecmisi/S/N.md", "N.md"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cozum_kazananı_ve_yedegi_yazar() {
        use crate::sync_merge::{merge_file, Mode};
        let dir = std::env::temp_dir().join(format!("loomen-lom51-apply-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut local: BTreeMap<String, Vec<u8>> = BTreeMap::new();
        local.insert("N.md".into(), b"a\nyerel\nc\n".to_vec());
        std::fs::write(dir.join("N.md"), b"a\nyerel\nc\n").unwrap();
        let res = merge_file("N.md", Some(b"a\nb\nc\n"), b"a\nyerel\nc\n", b"a\nuzak\nc\n", 1, 2);
        assert_eq!(res.mode, Mode::LineMerged);
        apply_resolution(&dir, &mut local, &m(&[]), "N.md", res, "2026-01-01_000000").unwrap();
        assert_eq!(std::fs::read(dir.join("N.md")).unwrap(), b"a\nuzak\nc\n");
        let y = dir.join(".loomen/cakisma-gecmisi/2026-01-01_000000/N.md");
        assert_eq!(std::fs::read(&y).unwrap(), b"a\nyerel\nc\n");
        assert!(local.contains_key(".loomen/cakisma-gecmisi/2026-01-01_000000/N.md"));
        assert_eq!(local["N.md"], b"a\nuzak\nc\n");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomik_yazma_ve_cop_kutusu() {
        let dir = std::env::temp_dir().join(format!("loomen-gh-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        atomic_write(&dir.join("Klasör/Not.md"), b"merhaba").unwrap();
        assert_eq!(std::fs::read(dir.join("Klasör/Not.md")).unwrap(), b"merhaba");
        move_to_trash(&dir, "Klasör/Not.md").unwrap();
        assert!(!dir.join("Klasör/Not.md").exists());
        let trashed: Vec<_> = std::fs::read_dir(dir.join(".trash")).unwrap().flatten().collect();
        assert_eq!(trashed.len(), 1);
        let name = trashed[0].file_name().to_string_lossy().to_string();
        let (_, enc) = name.split_once("__").unwrap();
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        assert_eq!(URL_SAFE_NO_PAD.decode(enc).unwrap(), "Klasör/Not.md".as_bytes());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
