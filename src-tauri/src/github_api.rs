// GitHub REST (Git Data API) tabanlı iki yönlü senkron — reqwest, TÜM platformlar (mobil dahil).
// git2/openssl gerektirmez. Dosya bazlı 3-yönlü birleştirme (base = son senkron commit'i):
// çakışmada veri KAYBEDİLMEZ — yerel korunur, uzak kopya "<ad> (çakışma).<uzantı>" olarak yazılır.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, BTreeSet, HashSet};
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

/// Çakışan uzak dosya için ayrı ad: "Not.md" -> "Not (çakışma).md"; bu ad alınmışsa
/// "Not (çakışma 2).md", "Not (çakışma 3).md"... (LOM-9). `taken` bir adın kullanımda olup
/// olmadığını söyler (yerel, uzak, bu senkronda planlanan ya da diskte var olan dosya).
/// Eskiden ad sabitti: önceki senkrondan kalan kopya ya da aynı adlı gerçek bir not
/// sessizce eziliyordu.
fn conflict_path(p: &str, taken: impl Fn(&str) -> bool) -> String {
    let slash = p.rfind('/').map_or(0, |i| i + 1);
    let (stem, ext) = match p[slash..].rfind('.') {
        Some(rel) if rel > 0 => (&p[..slash + rel], &p[slash + rel..]),
        _ => (p, ""),
    };
    for i in 1.. {
        let cand = if i == 1 {
            format!("{stem} (çakışma){ext}")
        } else {
            format!("{stem} (çakışma {i}){ext}")
        };
        if !taken(&cand) {
            return cand;
        }
    }
    unreachable!()
}

/// Birleştirme planı: ağdan bağımsız, test edilebilir karar kısmı.
#[derive(Debug, Default, PartialEq)]
struct MergePlan {
    /// (hedef yerel yol, uzak blob sha). Hedef = aynı yol (çekme) ya da çakışma kopyası.
    writes: Vec<(String, String)>,
    /// Uzakta silinmiş, yerelde dokunulmamış dosyalar (çöp kutusuna taşınır).
    deletes: Vec<String>,
    conflicts: Vec<String>,
    pulled: usize,
    pushed: usize,
}

/// Dosya bazlı 3-yönlü birleştirme (base = son senkron). Veri kaybetmez: çakışmada yerel
/// kalır, uzak sürüm benzersiz adlı kopya olur.
fn plan_merge(
    remote: &BTreeMap<String, String>,
    local_sha: &BTreeMap<String, String>,
    base: &BTreeMap<String, String>,
) -> MergePlan {
    let mut plan = MergePlan::default();
    // Sıralı gez: kopya adları her çalıştırmada aynı çıksın.
    let paths: BTreeSet<&String> = remote.keys().chain(local_sha.keys()).chain(base.keys()).collect();
    let mut planned: HashSet<String> = HashSet::new();
    let mut conflict_copy = |p: &str, r_sha: &str, plan: &mut MergePlan| {
        let target = conflict_path(p, |c| {
            remote.contains_key(c) || local_sha.contains_key(c) || planned.contains(c)
        });
        planned.insert(target.clone());
        plan.writes.push((target, r_sha.to_string()));
    };

    for p in paths {
        let r_sha = remote.get(p);
        let l_sha = local_sha.get(p);
        let b_sha = base.get(p);
        let (in_r, in_l, in_b) = (r_sha.is_some(), l_sha.is_some(), b_sha.is_some());

        if in_r && in_l && r_sha == l_sha {
            continue; // özdeş
        }

        if !in_b {
            if in_r && !in_l {
                plan.writes.push((p.clone(), r_sha.unwrap().clone()));
                plan.pulled += 1;
            } else if !in_r && in_l {
                plan.pushed += 1; // yerel yeni → tree'de kalır
            } else if in_r && in_l {
                // ikisi de farklı yeni → çakışma: yerel kalsın, uzak kopya yaz
                conflict_copy(p, r_sha.unwrap(), &mut plan);
                plan.conflicts.push(p.clone());
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
                // gerçek çakışma → yerel korunur, uzak kopya (varsa)
                if let Some(sha) = r_sha {
                    conflict_copy(p, sha, &mut plan);
                }
                plan.conflicts.push(p.clone());
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
    let mut conflicts = plan.conflicts.clone();

    // 5) Pull sonuçlarını diske + yerel state'e uygula. Diske dokunmadan hemen önce dosyanın
    //    okunduğu andan beri değişmediği kontrol edilir: senkron sürerken kullanıcı notu
    //    düzenlediyse üzerine yazılmaz, uzak sürüm kopya olur (LOM-9).
    for (p, r_sha) in &plan.writes {
        let content = get_blob(&c, &token, o, r, r_sha).await?;
        let mut target = p.clone();
        let full = root.join(&target);
        let expected = local_sha.get(p);
        if disk_sha(&full).as_ref() != expected {
            target = conflict_path(p, |cand| {
                local.contains_key(cand) || remote.contains_key(cand) || root.join(cand).exists()
            });
            if !conflicts.contains(p) {
                conflicts.push(p.clone());
            }
        }
        atomic_write(&root.join(&target), &content)?;
        local.insert(target, content);
    }
    for p in &plan.deletes {
        let full = root.join(p);
        // Okunduktan sonra değiştiyse silme: kullanıcının yeni yazdığı kaybolmasın.
        if disk_sha(&full).as_ref() != local_sha.get(p) {
            conflicts.push(p.clone());
            continue;
        }
        if move_to_trash(root, p).is_ok() {
            local.remove(p);
        }
    }
    let (pulled, pushed) = (plan.pulled, plan.pushed);

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

#[cfg(test)]
mod tests {
    use super::*;

    fn m(items: &[(&str, &str)]) -> BTreeMap<String, String> {
        items.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn cakisma_adi_bossa_sade() {
        assert_eq!(conflict_path("Klasör/Not.md", |_| false), "Klasör/Not (çakışma).md");
        assert_eq!(conflict_path("Not", |_| false), "Not (çakışma)");
        assert_eq!(conflict_path(".gizli/x", |_| false), ".gizli/x (çakışma)");
    }

    #[test]
    fn cakisma_adi_var_olani_ezmez() {
        let var = ["Not (çakışma).md", "Not (çakışma 2).md"];
        assert_eq!(conflict_path("Not.md", |c| var.contains(&c)), "Not (çakışma 3).md");
    }

    #[test]
    fn onceki_cakisma_kopyasi_ezilmez() {
        // LOM-9: önceki senkrondan kalan kopya yerelde duruyor; yeni çakışma onu ezmemeli.
        let base = m(&[("Not.md", "b")]);
        let local = m(&[("Not.md", "l"), ("Not (çakışma).md", "eski")]);
        let remote = m(&[("Not.md", "r"), ("Not (çakışma).md", "eski")]);
        let plan = plan_merge(&remote, &local, &base);
        assert_eq!(plan.writes, vec![("Not (çakışma 2).md".to_string(), "r".to_string())]);
        assert_eq!(plan.conflicts, vec!["Not.md".to_string()]);
        assert!(plan.deletes.is_empty());
    }

    #[test]
    fn ayni_senkronda_iki_cakisma_ayni_adi_almaz() {
        // "A.md" çakışıyor; uzakta ayrıca gerçek bir "A (çakışma).md" notu var ve yeni.
        let base = m(&[("A.md", "b")]);
        let local = m(&[("A.md", "l")]);
        let remote = m(&[("A.md", "r"), ("A (çakışma).md", "gercek")]);
        let plan = plan_merge(&remote, &local, &base);
        let targets: Vec<&str> = plan.writes.iter().map(|(t, _)| t.as_str()).collect();
        assert!(targets.contains(&"A (çakışma).md")); // uzaktaki gerçek not çekilir
        assert!(targets.contains(&"A (çakışma 2).md")); // uzak sürümün kopyası ayrı ad alır
        assert_eq!(targets.len(), 2);
    }

    #[test]
    fn uzak_silme_yalniz_dokunulmamis_yerelde() {
        let base = m(&[("Sil.md", "1"), ("Kalsin.md", "2")]);
        let local = m(&[("Sil.md", "1"), ("Kalsin.md", "yerelde değişti")]);
        let remote = m(&[]);
        let plan = plan_merge(&remote, &local, &base);
        assert_eq!(plan.deletes, vec!["Sil.md".to_string()]);
        assert_eq!(plan.conflicts, vec!["Kalsin.md".to_string()]);
    }

    #[test]
    fn ikisi_de_sildiyse_cakisma_yok() {
        let base = m(&[("X.md", "1")]);
        let plan = plan_merge(&m(&[]), &m(&[]), &base);
        assert_eq!(plan, MergePlan::default());
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
