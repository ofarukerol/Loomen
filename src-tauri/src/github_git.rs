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
const MARKER_MSG: &str = "Bir notta eski bir senkrondan kalan çakışma işaretleri (<<<<<<< ve >>>>>>> satırları) var. Senkron, notlar bozulmasın diye durdu. Notu açıp bu satırları ve fazla kopyaları silin; kaydedince senkron kendiliğinden devam eder";

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
    // Uzaktaki (son gönderilen/alınan) haliyle aynı dosya taranmaz: her senkronda bütün kasa
    // okunmasın. HEAD ile kıyaslanmaz — eski sürüm işaretli dosyaları yerelde commit'lemiş
    // olabilir, onlar da yakalanmalı. Uzak dal yoksa hepsi taranır.
    let base = repo
        .find_reference("refs/remotes/origin/main")
        .ok()
        .and_then(|r| r.peel_to_tree().ok());
    for e in index.iter() {
        let path = String::from_utf8_lossy(&e.path).to_string();
        if let Some(t) = &base {
            if t.get_path(std::path::Path::new(&path)).map(|te| te.id()) == Ok(e.id) {
                continue;
            }
        }
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
        // Çakışma kopyasının adı hiçbir mevcut yolla (çözülmemiş çakışmalar ve iki tarafın
        // ağacı dahil) çakışmasın: yoksa başka bir dosyanın uzak içeriği sessizce düşerdi.
        let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
        for c in &conflicts {
            for e in [&c.ancestor, &c.our, &c.their].into_iter().flatten() {
                used.insert(String::from_utf8_lossy(&e.path).to_string());
            }
        }
        let (lt, rt) = (local.tree()?, remote.tree()?);
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
                            let pp = std::path::Path::new(p);
                            used.contains(p)
                                || idx.get_path(pp, 0).is_some()
                                || lt.get_path(pp).is_ok()
                                || rt.get_path(pp).is_ok()
                        });
                        used.insert(copy.clone());
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
    // Son güvenlik: yerelde değişmiş ya da yeni olan her dosya birleşmiş ağaçta dosya olarak
    // durmalı (ör. klasör ile aynı adlı dosya çakışması yerel notu düşürmesin). Değilse
    // hiçbir şey yazılmadan durulur; çalışma klasörüne dokunulmaz.
    let base = repo
        .merge_base(local.id(), remote.id())
        .ok()
        .and_then(|b| repo.find_commit(b).ok())
        .and_then(|c| c.tree().ok());
    let mut lost: Option<String> = None;
    local.tree()?.walk(git2::TreeWalkMode::PreOrder, |dir, e| {
        if e.kind() != Some(git2::ObjectType::Blob) {
            return git2::TreeWalkResult::Ok;
        }
        let path = format!("{dir}{}", e.name().unwrap_or(""));
        let pp = std::path::Path::new(&path);
        let unchanged = base
            .as_ref()
            .and_then(|b| b.get_path(pp).ok())
            .map_or(false, |be| be.id() == e.id());
        // İçerik birleştirmesiyle değişmiş olabilir (iki taraf farklı satırlar); yeter ki
        // dosya birleşmiş ağaçta dosya olarak dursun.
        let kept = tree.get_path(pp).map_or(false, |m| m.kind() == Some(git2::ObjectType::Blob));
        if !unchanged && !kept {
            lost = Some(path);
            return git2::TreeWalkResult::Abort;
        }
        git2::TreeWalkResult::Ok
    })
    .ok();
    if let Some(p) = lost {
        return Err(git2::Error::from_str(&format!(
            "Senkron durdu: \"{p}\" yerel değişikliği uzaktaki bir değişiklikle (ör. aynı adlı klasör/dosya) birleştirilemedi. Notlarınız olduğu gibi duruyor."
        )));
    }
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

/// Çalışma klasörünü sahneler (LOM-44 korumalarıyla). Eski sürümün yarım bıraktığı
/// birleştirme ya da dosyaya yazılmış çakışma işaretleri varken HİÇBİR şey commit'lenmez:
/// yoksa işaretli dosya kaydedilip her turda yeniden birleştirilir ve büyür.
fn stage_all(repo: &Repository) -> Result<Index, String> {
    let me = |e: git2::Error| e.to_string();
    let mut index = repo.index().map_err(me)?;
    if index.has_conflicts() {
        // Eski sürümün yarım bıraktığı birleştirme: indeks HEAD'e döndürülür, çalışma
        // klasörüne dokunulmaz. İşaret kalmış dosya varsa aşağıdaki tarama senkronu durdurur.
        match repo.head().ok().and_then(|h| h.peel_to_tree().ok()) {
            Some(t) => index.read_tree(&t).map_err(me)?,
            None => return Err(UNRESOLVED_MSG.into()),
        }
        let _ = repo.cleanup_state();
    }
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(me)?;
    if let Some(p) = first_marked_file(repo, &index) {
        // Sahnelemeyi diske yazmadan çık: indeks dosyası eski halinde kalır.
        return Err(format!("{MARKER_MSG} ({p})"));
    }
    index.write().map_err(me)?;
    Ok(index)
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

    let mut index = stage_all(&repo)?;
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

    #[test]
    fn cakisma_kopyasi_adi_baska_cakismanin_ustune_yazilmaz() {
        let (dir, repo) = tmp_repo("ad");
        fs::write(dir.join("A (çakışma).md"), "eski kopya\n").unwrap();
        let (l0, r0) = diverge(&repo, &dir, "A.md", "a\n", "a yerel\n", "a uzak\n");
        // Aynı commit'lerde "A (çakışma).md" de iki tarafta farklı değişsin.
        let (lc0, rc0) = (repo.find_commit(l0).unwrap(), repo.find_commit(r0).unwrap());
        fs::write(dir.join("A (çakışma).md"), "kopya yerel\n").unwrap();
        let l = commit_all(&repo, &[&lc0]);
        let mut ri = Index::new().unwrap();
        ri.read_tree(&rc0.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("A (çakışma).md"), 0).unwrap();
        e.id = repo.blob(b"kopya uzak\n").unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak2", &rt, &[&rc0]).unwrap();
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        let mut found: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| fs::read_to_string(e.path()).unwrap_or_default())
            .collect();
        found.sort();
        for want in ["a yerel\n", "a uzak\n", "kopya yerel\n", "kopya uzak\n"] {
            assert!(found.iter().any(|c| c == want), "kayıp içerik: {want:?}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dizin_dosya_cakismasi_klasoru_bozmaz() {
        let (dir, repo) = tmp_repo("df");
        fs::write(dir.join("x.md"), "x\n").unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        // Uzak: "Klasör" adında DOSYA ekler.
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("x.md"), 0).unwrap();
        e.path = b"Klasor".to_vec();
        e.id = repo.blob(b"uzak dosya\n").unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak", &rt, &[&bc]).unwrap();
        // Yerel: aynı adla KLASÖR ve içinde not.
        fs::create_dir_all(dir.join("Klasor")).unwrap();
        fs::write(dir.join("Klasor/Not.md"), "yerel not\n").unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        let head_before = repo.head().unwrap().target().unwrap();
        let res = merge_into_head(&repo, &lc, &rc, &sig());
        // Ya iki taraf da korunarak birleşir ya da hata döner ve hiçbir şeye dokunulmaz.
        assert_eq!(fs::read_to_string(dir.join("Klasor/Not.md")).unwrap(), "yerel not\n");
        if res.is_err() {
            assert_eq!(repo.head().unwrap().target().unwrap(), head_before);
        } else {
            let head = repo.head().unwrap().peel_to_tree().unwrap();
            assert!(head.get_path(std::path::Path::new("Klasor/Not.md")).is_ok());
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn eski_yarim_birlesme_kurtarilir_isaretli_dosya_durdurur() {
        let (dir, repo) = tmp_repo("kurtar");
        // Eski sürümün durumu: işaretli dosya commit'lenmiş, indeks çakışmalı.
        fs::write(dir.join("Y.md"), "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> FETCH_HEAD\n").unwrap();
        commit_all(&repo, &[]);
        let mut idx = repo.index().unwrap();
        let mut e = idx.get_path(std::path::Path::new("Y.md"), 0).unwrap();
        idx.remove_path(std::path::Path::new("Y.md")).unwrap();
        e.flags = (e.flags & !0x3000) | (2 << 12); // "bizim" aşaması
        idx.add(&e).unwrap();
        idx.write().unwrap();
        assert!(repo.index().unwrap().has_conflicts());
        let err = stage_all(&repo).err().expect("işaretli dosyada durmalı");
        assert!(err.contains("Y.md"), "{err}");
        // Kullanıcı notu düzeltince senkron devam eder.
        fs::write(dir.join("Y.md"), "a\n").unwrap();
        assert!(stage_all(&repo).is_ok());
        assert!(!repo.index().unwrap().has_conflicts());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ayni_dosyada_farkli_satirlar_temiz_birlesir() {
        let (dir, repo) = tmp_repo("satir");
        let base = "1\n2\n3\n4\n5\n6\n";
        let (l, r) = diverge(&repo, &dir, "N.md", base, "1 yerel\n2\n3\n4\n5\n6\n", "1\n2\n3\n4\n5\n6 uzak\n");
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("N.md")).unwrap(), "1 yerel\n2\n3\n4\n5\n6 uzak\n");
        assert!(!dir.join("N (çakışma).md").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
