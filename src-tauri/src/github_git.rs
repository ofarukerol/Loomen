// GitHub iki yönlü git senkronu — git2/libgit2 (openssl). YALNIZ masaüstü.
// (Mobilde openssl-sys cross-compile olmaz; mobil için reqwest tabanlı github_api kullanılır.)
use git2::{
    build::CheckoutBuilder, Commit, Cred, FetchOptions, Index, IndexAddOption, IndexEntry, Oid,
    PushOptions, RemoteCallbacks, Repository, RepositoryInitOptions, Signature,
};
use serde::Serialize;

#[derive(Serialize)]
pub struct SyncResult {
    committed: bool,
    pulled: bool,
    message: String,
}

const UNRESOLVED_MSG: &str =
    "Kasada yarım kalmış bir birleştirme var. Senkron, notlar bozulmasın diye durdu.";
const MARKER_MSG: &str =
    "Bir notta git çakışma işaretleri (<<<<<<< / >>>>>>>) var. Senkron, notlar bozulmasın diye durdu";

/// Satır başında git çakışma işareti var mı? (Yalnız git'in ürettiği biçim: 7 işaret + boşluk.)
fn has_conflict_markers(text: &str) -> bool {
    let mut open = false;
    for line in text.lines() {
        if line.starts_with("<<<<<<< ") {
            open = true;
        } else if open && line.starts_with(">>>>>>> ") {
            return true;
        }
    }
    false
}

/// Sahnelenmiş metin dosyalarından çakışma işareti taşıyan ilki (yol), yoksa None.
fn first_marked_file(repo: &Repository, index: &Index) -> Option<String> {
    for e in index.iter() {
        let path = String::from_utf8_lossy(&e.path).to_string();
        let lower = path.to_lowercase();
        if !(lower.ends_with(".md") || lower.ends_with(".json") || lower.ends_with(".jsonl")
            || lower.ends_with(".excalidraw"))
        {
            continue;
        }
        if let Ok(blob) = repo.find_blob(e.id) {
            if let Ok(text) = std::str::from_utf8(blob.content()) {
                if has_conflict_markers(text) {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// Yereli ve uzağı bellekte birleştirip HEAD'e birleştirme commit'i yazar, çalışma klasörünü
/// günceller. Çakışan dosyada yerel içerik yerinde kalır, uzak içerik "<ad> (çakışma).<uzantı>"
/// olarak eklenir (mobil senkronla aynı kural, LOM-9). Bir taraf silmiş öbürü değiştirmişse
/// değişen içerik korunur. Dosyalara hiçbir zaman çakışma işareti yazılmaz.
fn merge_into_head(
    repo: &Repository,
    local: &Commit,
    remote: &Commit,
    sig: &Signature,
) -> Result<Oid, git2::Error> {
    let mut idx = repo.merge_commits(local, remote, None)?;
    if idx.has_conflicts() {
        let conflicts: Vec<_> = idx.conflicts()?.collect::<Result<_, _>>()?;
        for c in conflicts {
            let any = c.our.as_ref().or(c.their.as_ref()).or(c.ancestor.as_ref());
            let Some(any) = any else { continue };
            let path = String::from_utf8_lossy(&any.path).to_string();
            idx.remove_path(std::path::Path::new(&path))?;
            match (c.our, c.their) {
                (Some(ours), Some(theirs)) => {
                    idx.add(&stage0(ours))?;
                    if theirs.id != ours_id(&idx, &path) {
                        let copy = crate::github_api::conflict_path(&path, |p| {
                            idx.get_path(std::path::Path::new(p), 0).is_some()
                        });
                        let mut e = stage0(theirs);
                        e.path = copy.into_bytes();
                        idx.add(&e)?;
                    }
                }
                (Some(only), None) | (None, Some(only)) => idx.add(&stage0(only))?,
                (None, None) => {}
            }
        }
    }
    let tree_id = idx.write_tree_to(repo)?;
    let tree = repo.find_tree(tree_id)?;
    let oid = repo.commit(Some("HEAD"), sig, sig, "Loomen birleştirme", &tree, &[local, remote])?;
    let _ = repo.cleanup_state();
    repo.checkout_head(Some(CheckoutBuilder::default().force()))?;
    Ok(oid)
}

fn stage0(mut e: IndexEntry) -> IndexEntry {
    e.flags &= !0x3000; // GIT_INDEX_ENTRY_STAGEMASK: çakışma aşamasını sıfırla
    e
}

fn ours_id(idx: &Index, path: &str) -> Oid {
    idx.get_path(std::path::Path::new(path), 0).map(|e| e.id).unwrap_or_else(Oid::zero)
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

    // Eski sürümün yarım bıraktığı birleştirme ya da dosyaya yazılmış çakışma işaretleri
    // varken HİÇBİR şey commit'lenmez (LOM-44): yoksa işaretli dosya kaydedilip her turda
    // yeniden birleştirilir ve büyür.
    let mut index = repo.index().map_err(me)?;
    if index.has_conflicts() {
        return Err(UNRESOLVED_MSG.into());
    }
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(me)?;
    if let Some(p) = first_marked_file(&repo, &index) {
        // Sahnelemeyi diske yazmadan çık: indeks dosyası eski halinde kalır.
        return Err(format!("{MARKER_MSG} ({p})"));
    }
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
                // Gerçek birleştirme bellekte yapılır; çalışma klasörüne çakışma işareti
                // YAZILMAZ (LOM-44). Çakışan dosyada yerel kalır, uzak "(çakışma)" kopyası olur.
                let local = repo.head().map_err(me)?.peel_to_commit().map_err(me)?;
                let remote_c = repo.find_commit(fetch_commit.id()).map_err(me)?;
                merge_into_head(&repo, &local, &remote_c, &sig).map_err(me)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_repo(tag: &str) -> (PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!(
            "loomen-lom44-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let mut o = RepositoryInitOptions::new();
        o.initial_head("main");
        let repo = Repository::init_opts(&dir, &o).unwrap();
        (dir, repo)
    }

    fn sig() -> Signature<'static> {
        Signature::now("Deneme", "deneme@example.com").unwrap()
    }

    /// Çalışma klasörünü olduğu gibi commit'ler (do_sync'in ilk adımıyla aynı).
    fn commit_all(repo: &Repository, parents: &[&Commit]) -> Oid {
        let mut idx = repo.index().unwrap();
        idx.add_all(["*"].iter(), IndexAddOption::DEFAULT, None).unwrap();
        idx.write().unwrap();
        let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
        repo.commit(Some("HEAD"), &sig(), &sig(), "c", &tree, parents).unwrap()
    }

    /// base → (yerel, uzak) iki dalı kurar: uzak commit'i HEAD'e bağlamadan üretir.
    fn diverge(repo: &Repository, dir: &PathBuf, file: &str, base: &str, local: &str, remote: &str) -> (Oid, Oid) {
        fs::write(dir.join(file), base).unwrap();
        let b = commit_all(repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        // Uzak: base üstüne ayrı commit (HEAD'i kaydırmadan).
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let blob = repo.blob(remote.as_bytes()).unwrap();
        let mut e = ri.get_path(std::path::Path::new(file), 0).unwrap();
        e.id = blob;
        e.file_size = remote.len() as u32;
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak", &rt, &[&bc]).unwrap();
        // Yerel: çalışma klasöründe değiştir, commit'le.
        fs::write(dir.join(file), local).unwrap();
        let l = commit_all(repo, &[&bc]);
        (l, r)
    }

    #[test]
    fn isaret_tanima() {
        assert!(has_conflict_markers("a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> FETCH_HEAD\n"));
        assert!(!has_conflict_markers("başlık\n=======\nmetin"));
        assert!(!has_conflict_markers(">>>>>>> yalnız kapanış"));
        assert!(!has_conflict_markers("<<<<<<<< sekiz işaret\n>>>>>>>> sekiz"));
    }

    #[test]
    fn cakismada_dosyaya_isaret_yazilmaz_iki_taraf_korunur() {
        let (dir, repo) = tmp_repo("cakisma");
        let (l, r) = diverge(&repo, &dir, "Yapılacaklar.md", "- [ ] A\n", "- [ ] A yerel\n", "- [ ] A uzak\n");
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();

        let main = fs::read_to_string(dir.join("Yapılacaklar.md")).unwrap();
        let copy = fs::read_to_string(dir.join("Yapılacaklar (çakışma).md")).unwrap();
        assert_eq!(main, "- [ ] A yerel\n", "yerel içerik yerinde kalmalı");
        assert_eq!(copy, "- [ ] A uzak\n", "uzak içerik çakışma kopyasında olmalı");
        assert!(!has_conflict_markers(&main) && !has_conflict_markers(&copy));
        assert!(!repo.index().unwrap().has_conflicts(), "indeks temiz olmalı");
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.parent_count(), 2, "iki ebeveynli birleştirme commit'i");
        assert!(first_marked_file(&repo, &repo.index().unwrap()).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ikinci_turda_dosya_buyumez() {
        let (dir, repo) = tmp_repo("tur");
        let (l, r) = diverge(&repo, &dir, "Not.md", "x\n", "x yerel\n", "x uzak\n");
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        let before = fs::read_to_string(dir.join("Not.md")).unwrap();
        // Sonraki turda aynı uzak commit yeniden gelir: artık güncel, birleştirme yok.
        let rc_ann = repo.find_annotated_commit(r).unwrap();
        let (analysis, _) = repo.merge_analysis(&[&rc_ann]).unwrap();
        assert!(analysis.is_up_to_date());
        // Çalışma klasörü yeniden commit'lense bile içerik değişmez.
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        commit_all(&repo, &[&head]);
        assert_eq!(fs::read_to_string(dir.join("Not.md")).unwrap(), before);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn farkli_dosyalar_temiz_birlesir() {
        let (dir, repo) = tmp_repo("farkli");
        fs::write(dir.join("B.md"), "b\n").unwrap();
        let (l, r) = diverge(&repo, &dir, "A.md", "a\n", "a\n", "a uzak\n");
        // Yerel tarafta başka bir dosya değişsin.
        fs::write(dir.join("B.md"), "b yerel\n").unwrap();
        let lc0 = repo.find_commit(l).unwrap();
        let l2 = commit_all(&repo, &[&lc0]);
        let (lc, rc) = (repo.find_commit(l2).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("A.md")).unwrap(), "a uzak\n");
        assert_eq!(fs::read_to_string(dir.join("B.md")).unwrap(), "b yerel\n");
        assert!(!dir.join("A (çakışma).md").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn isaretli_dosya_bulunur() {
        let (dir, repo) = tmp_repo("isaret");
        fs::write(dir.join("Bozuk.md"), "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> FETCH_HEAD\n").unwrap();
        fs::write(dir.join("Temiz.md"), "temiz\n").unwrap();
        let mut idx = repo.index().unwrap();
        idx.add_all(["*"].iter(), IndexAddOption::DEFAULT, None).unwrap();
        assert_eq!(first_marked_file(&repo, &idx).as_deref(), Some("Bozuk.md"));
        let _ = fs::remove_dir_all(&dir);
    }
}
