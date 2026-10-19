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
    /// İki tarafın değişikliği otomatik birleştirilen notlar (LOM-51).
    merged: Vec<String>,
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

/// Uzak tarafta `path` dosyasına en son dokunan commit'in zamanı (saniye). Ortak atadan beri
/// bakılır (en çok 500 commit); bulunamazsa uzak başın commit zamanı.
fn remote_file_time(repo: &Repository, remote: &Commit, base: Option<Oid>, path: &str) -> i64 {
    let fallback = remote.time().seconds();
    let pp = std::path::Path::new(path);
    let Ok(mut walk) = repo.revwalk() else { return fallback };
    if walk.push(remote.id()).is_err() {
        return fallback;
    }
    if let Some(b) = base {
        let _ = walk.hide(b);
    }
    let _ = walk.set_sorting(git2::Sort::TIME);
    for oid in walk.flatten().take(500) {
        let Ok(c) = repo.find_commit(oid) else { continue };
        let cur = c.tree().ok().and_then(|t| t.get_path(pp).ok()).map(|e| e.id());
        let prev = c
            .parent(0)
            .ok()
            .and_then(|p| p.tree().ok())
            .and_then(|t| t.get_path(pp).ok())
            .map(|e| e.id());
        if cur != prev {
            return c.time().seconds();
        }
    }
    fallback
}

/// Yerel dosyanın son değişiklik zamanı (saniye); okunamazsa yerel commit zamanı.
fn local_file_time(repo: &Repository, local: &Commit, path: &str) -> i64 {
    repo.workdir()
        .and_then(|w| std::fs::metadata(w.join(path)).ok())
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or_else(|| local.time().seconds())
}

fn blob_bytes(repo: &Repository, id: Oid) -> Result<Vec<u8>, git2::Error> {
    Ok(repo.find_blob(id)?.content().to_vec())
}

fn new_blob_entry(like: &IndexEntry, id: Oid, size: usize, path: &str) -> IndexEntry {
    let mut e = stage0(IndexEntry {
        ctime: like.ctime,
        mtime: like.mtime,
        dev: like.dev,
        ino: like.ino,
        mode: like.mode,
        uid: like.uid,
        gid: like.gid,
        file_size: size as u32,
        id,
        flags: 0,
        flags_extended: 0,
        path: path.as_bytes().to_vec(),
    });
    e.flags |= (path.len().min(0xFFF)) as u16;
    e
}

/// Yereli ve uzağı bellekte birleştirip HEAD'e birleştirme commit'i yazar, çalışma klasörünü
/// günceller (LOM-51). Çakışan metin dosyası satır bazlı 3-yönlü birleşir; örtüşen parçada
/// zaman damgası yeni olan taraf kazanır, kaybedenin TAM dosyası
/// `.loomen/cakisma-gecmisi/<damga>/<yol>` altına yedeklenir. Bir taraf silmiş öbürü
/// değiştirmişse değişen içerik kalır. Dosyalara çakışma işareti ya da "(çakışma)" kopyası
/// yazılmaz. Dönen liste: iki tarafın değişikliği otomatik birleştirilen dosyalar.
fn merge_into_head(
    repo: &Repository,
    local: &Commit,
    remote: &Commit,
    sig: &Signature,
) -> Result<(Oid, Vec<String>), git2::Error> {
    let mut idx = repo.merge_commits(local, remote, None)?;
    let (lt, rt) = (local.tree()?, remote.tree()?);
    let base_oid = repo.merge_base(local.id(), remote.id()).ok();
    let mut merged: Vec<String> = Vec::new();
    let mut backups: Vec<(String, Vec<u8>)> = Vec::new();
    let stamp = crate::sync_merge::format_stamp(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    );
    // libgit2'nin kendi başardığı temiz içerik birleşmeleri (ayrık satırlar): iki tarafın da
    // sürümünden farklı sonuç = otomatik birleşti.
    let mut clean_merged: Vec<IndexEntry> = Vec::new();
    for e in idx.iter() {
        if (e.flags & 0x3000) != 0 {
            continue;
        }
        let pp = std::path::Path::new(std::str::from_utf8(&e.path).unwrap_or(""));
        if let (Ok(l), Ok(r)) = (lt.get_path(pp), rt.get_path(pp)) {
            if l.id() != e.id && r.id() != e.id {
                clean_merged.push(e);
            }
        }
    }
    let base_tree = base_oid.and_then(|b| repo.find_commit(b).ok()).and_then(|c| c.tree().ok());
    for e in clean_merged {
        let path = String::from_utf8_lossy(&e.path).to_string();
        let pp = std::path::Path::new(&path);
        if crate::sync_merge::is_backup_path(&path) {
            if let (Ok(l), Ok(r)) = (lt.get_path(pp), rt.get_path(pp)) {
                let dest = crate::sync_merge::backup_variant_path(&path, |p| {
                    let q = std::path::Path::new(p);
                    idx.get_path(q, 0).is_some() || lt.get_path(q).is_ok() || rt.get_path(q).is_ok()
                });
                idx.add(&new_blob_entry(&e, l.id(), blob_bytes(repo, l.id())?.len(), &path))?;
                idx.add(&new_blob_entry(&e, r.id(), blob_bytes(repo, r.id())?.len(), &dest))?;
            }
            continue;
        }
        // libgit2 satır birleştirmesi JSON/çizim gibi dosyalarda bozuk içerik üretebilir:
        // bunlar tüm dosya kuralıyla (yeni kazanır, eski yedeklenir) yeniden çözülür.
        if !crate::sync_merge::line_mergeable_path(&path) {
            if let (Ok(l), Ok(r)) = (lt.get_path(pp), rt.get_path(pp)) {
                let base = match base_tree.as_ref().and_then(|t| t.get_path(pp).ok()) {
                    Some(b) => Some(blob_bytes(repo, b.id())?),
                    None => None,
                };
                let res = crate::sync_merge::merge_file(
                    &path,
                    base.as_deref(),
                    &blob_bytes(repo, l.id())?,
                    &blob_bytes(repo, r.id())?,
                    local_file_time(repo, local, &path),
                    remote_file_time(repo, remote, base_oid, &path),
                );
                let id = repo.blob(&res.content)?;
                idx.add(&new_blob_entry(&e, id, res.content.len(), &path))?;
                if let Some(b) = res.backup {
                    backups.push((path.clone(), b));
                }
            }
        }
        merged.push(path);
    }
    if idx.has_conflicts() {
        let conflicts: Vec<_> = idx.conflicts()?.collect::<Result<_, _>>()?;
        for c in conflicts {
            let any = c.our.as_ref().or(c.their.as_ref()).or(c.ancestor.as_ref());
            let Some(any) = any else { continue };
            let path = String::from_utf8_lossy(&any.path).to_string();
            idx.remove_path(std::path::Path::new(&path))?;
            match (c.ancestor, c.our, c.their) {
                (anc, Some(ours), Some(theirs)) => {
                    if ours.id == theirs.id {
                        idx.add(&stage0(ours))?;
                        continue;
                    }
                    if crate::sync_merge::is_backup_path(&path) {
                        // Yedekler birleştirilmez: ikisi de kalır, gelen -2 ekiyle ayrı yola gider.
                        idx.add(&stage0(ours))?;
                        let dest = crate::sync_merge::backup_variant_path(&path, |p| {
                            let pp = std::path::Path::new(p);
                            idx.get_path(pp, 0).is_some() || lt.get_path(pp).is_ok() || rt.get_path(pp).is_ok()
                        });
                        let mut e = stage0(theirs);
                        e.path = dest.as_bytes().to_vec();
                        e.flags = (e.flags & !0xFFF) | (dest.len().min(0xFFF) as u16);
                        idx.add(&e)?;
                        continue;
                    }
                    let base = match &anc {
                        Some(a) => Some(blob_bytes(repo, a.id)?),
                        None => None,
                    };
                    let res = crate::sync_merge::merge_file(
                        &path,
                        base.as_deref(),
                        &blob_bytes(repo, ours.id)?,
                        &blob_bytes(repo, theirs.id)?,
                        local_file_time(repo, local, &path),
                        remote_file_time(repo, remote, base_oid, &path),
                    );
                    let id = repo.blob(&res.content)?;
                    idx.add(&new_blob_entry(&ours, id, res.content.len(), &path))?;
                    merged.push(path.clone());
                    if let Some(b) = res.backup {
                        backups.push((path, b));
                    }
                }
                // Bir taraf silmiş, öbürü değiştirmiş: değiştiren taraf kazanır, not kalır.
                (_, Some(only), None) | (_, None, Some(only)) => idx.add(&stage0(only))?,
                (_, None, None) => {}
            }
        }
    }
    // Kaybeden tarafın tam dosyaları yedek klasörüne (tree'ye girer: sonra senkronlanır).
    for (rel, bytes) in backups {
        let taken = |p: &str| {
            let pp = std::path::Path::new(p);
            idx.get_path(pp, 0).is_some() || lt.get_path(pp).is_ok() || rt.get_path(pp).is_ok()
        };
        let dest = crate::sync_merge::backup_path(&stamp, &rel, taken);
        let like = IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: Oid::zero(),
            flags: 0,
            flags_extended: 0,
            path: vec![],
        };
        let id = repo.blob(&bytes)?;
        idx.add(&new_blob_entry(&like, id, bytes.len(), &dest))?;
    }
    merged.sort();
    merged.dedup();
    let tree_id = idx.write_tree_to(repo)?;
    let tree = repo.find_tree(tree_id)?;
    // Son güvenlik: yerelde değişmiş ya da yeni bir dosya klasör/dosya çakışmasıyla birleşmiş
    // ağaçtan düşmesin (ör. uzakta aynı adlı dosya yerel klasörü ezmesin). Değilse
    // hiçbir şey yazılmadan durulur; çalışma klasörüne dokunulmaz.
    let base = base_oid
        .and_then(|b| repo.find_commit(b).ok())
        .and_then(|c| c.tree().ok());
    // Kontrol iki taraf için de yapılır: yerel dosya uzak klasörün altında kalmasın, uzak not
    // da yerel aynı adlı dosya yüzünden düşmesin (ikisi de sonraki gönderimde silinmiş görünür).
    let mut lost: Option<String> = None;
    for side in [local.tree()?, remote.tree()?] {
        if lost.is_some() {
            break;
        }
        side.walk(git2::TreeWalkMode::PreOrder, |dir, e| {
            if e.kind() != Some(git2::ObjectType::Blob) {
                return git2::TreeWalkResult::Ok;
            }
            let path = format!("{dir}{}", e.name().unwrap_or(""));
            let pp = std::path::Path::new(&path);
            let unchanged = base
                .as_ref()
                .and_then(|b| b.get_path(pp).ok())
                .map_or(false, |be| be.id() == e.id());
            // Yalnız klasör/dosya çakışması aranır: dosyanın yerinde artık klasör var ya da üst
            // klasörlerinden biri dosya olmuş. Yol yalnızca yoksa (öbür tarafta yeniden
            // adlandırma) ya da içerik birleşmesiyle değiştiyse bu kayıp değildir.
            let is_kind = |q: &str, k: git2::ObjectType| {
                tree.get_path(std::path::Path::new(q)).map_or(false, |m| m.kind() == Some(k))
            };
            let parent_became_file = path
                .match_indices('/')
                .any(|(i, _)| is_kind(&path[..i], git2::ObjectType::Blob));
            let df = is_kind(&path, git2::ObjectType::Tree) || parent_became_file;
            if !unchanged && df {
                lost = Some(path);
                return git2::TreeWalkResult::Abort;
            }
            git2::TreeWalkResult::Ok
        })
        .ok();
    }
    if let Some(p) = lost {
        return Err(git2::Error::from_str(&format!(
            "Senkron durdu: \"{p}\" aynı adlı bir klasör/dosya ile çakıştı, birleştirilemedi. Birini yeniden adlandırın; notlarınız olduğu gibi duruyor."
        )));
    }
    let oid = repo.commit(Some("HEAD"), sig, sig, "Loomen birleştirme", &tree, &[local, remote])?;
    let _ = repo.cleanup_state();
    repo.checkout_head(Some(CheckoutBuilder::default().force()))?;
    Ok((oid, merged))
}

fn stage0(mut e: IndexEntry) -> IndexEntry {
    e.flags &= !0x3000; // GIT_INDEX_ENTRY_STAGEMASK: çakışma aşamasını sıfırla
    e
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
    let mut merged: Vec<String> = Vec::new();
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
                // YAZILMAZ (LOM-44). Çakışmalar sync_merge kurallarıyla otomatik çözülür (LOM-51).
                let local = repo.head().map_err(me)?.peel_to_commit().map_err(me)?;
                let remote_c = repo.find_commit(fetch_commit.id()).map_err(me)?;
                merged = merge_into_head(&repo, &local, &remote_c, &sig).map_err(me)?.1;
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
        merged,
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

    fn now_secs() -> i64 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64
    }

    fn sig_at(secs: i64) -> Signature<'static> {
        Signature::new("Deneme", "deneme@example.com", &git2::Time::new(secs, 0)).unwrap()
    }

    /// Yerel dosyanın değişiklik zamanını ayarlar (birleştirmede "hangi taraf yeni" kararı).
    fn set_mtime(path: &std::path::Path, secs: i64) {
        let t = std::time::UNIX_EPOCH + std::time::Duration::from_secs(secs as u64);
        fs::File::options().write(true).open(path).unwrap().set_modified(t).unwrap();
    }

    /// Yedek klasöründeki (yol, içerik) çiftleri.
    fn backups(dir: &std::path::Path) -> Vec<(String, String)> {
        fn walk(root: &std::path::Path, d: &std::path::Path, out: &mut Vec<(String, String)>) {
            let Ok(rd) = fs::read_dir(d) else { return };
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(root, &p, out);
                } else {
                    let rel = p.strip_prefix(root).unwrap().to_string_lossy().to_string();
                    out.push((rel, fs::read_to_string(&p).unwrap_or_default()));
                }
            }
        }
        let root = dir.join(".loomen/cakisma-gecmisi");
        let mut out = vec![];
        walk(&root, &root, &mut out);
        out.sort();
        out
    }

    fn no_copies(dir: &std::path::Path) -> bool {
        !fs::read_dir(dir).unwrap().flatten().any(|e| e.file_name().to_string_lossy().contains("çakışma ("))
            && !fs::read_dir(dir).unwrap().flatten().any(|e| e.file_name().to_string_lossy().contains("(çakışma"))
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
        // Varsayılan: uzak commit "şimdi", yerel dosya da şimdi (eşitlikte yerel kazanır).
        diverge_at(repo, dir, file, base, local, remote, now_secs())
    }

    fn diverge_at(repo: &Repository, dir: &PathBuf, file: &str, base: &str, local: &str, remote: &str, remote_secs: i64) -> (Oid, Oid) {
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
        let r = repo.commit(None, &sig_at(remote_secs), &sig_at(remote_secs), "uzak", &rt, &[&bc]).unwrap();
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
    fn cakismada_uzak_yeniyse_uzak_kazanir_yerel_yedeklenir() {
        let (dir, repo) = tmp_repo("cakisma");
        let (l, r) = diverge_at(&repo, &dir, "Yapılacaklar.md", "- [ ] A\n", "- [ ] A yerel\n", "- [ ] A uzak\n", now_secs() + 1000);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        let (_, merged) = merge_into_head(&repo, &lc, &rc, &sig()).unwrap();

        let main = fs::read_to_string(dir.join("Yapılacaklar.md")).unwrap();
        assert_eq!(main, "- [ ] A uzak\n", "yeni olan (uzak) kazanmalı");
        assert_eq!(
            backups(&dir).iter().map(|(_, c)| c.as_str()).collect::<Vec<_>>(),
            vec!["- [ ] A yerel\n"],
            "kaybeden (yerel) tam dosya olarak yedeklenmeli"
        );
        assert!(backups(&dir)[0].0.ends_with("/Yapılacaklar.md"));
        assert_eq!(merged, vec!["Yapılacaklar.md".to_string()]);
        assert!(no_copies(&dir));
        assert!(!has_conflict_markers(&main));
        assert!(!repo.index().unwrap().has_conflicts(), "indeks temiz olmalı");
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.parent_count(), 2, "iki ebeveynli birleştirme commit'i");
        // Yedek commit'in ağacında: bir sonraki senkronda uzağa gider.
        let tree = head.tree().unwrap();
        assert!(tree.get_path(std::path::Path::new(".loomen/cakisma-gecmisi")).is_ok());
        assert!(first_marked_file(&repo, &repo.index().unwrap()).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cakismada_yerel_yeniyse_yerel_kazanir_uzak_yedeklenir() {
        let (dir, repo) = tmp_repo("cakisma-yerel");
        let (l, r) = diverge_at(&repo, &dir, "N.md", "x\n", "x yerel\n", "x uzak\n", 1_000_000);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("N.md")).unwrap(), "x yerel\n");
        assert_eq!(backups(&dir).into_iter().map(|(_, c)| c).collect::<Vec<_>>(), vec!["x uzak\n".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn iki_taraf_sona_ekleyince_ikisi_de_kalir_yedek_gerekmez() {
        let (dir, repo) = tmp_repo("ekleme");
        let (l, r) = diverge_at(&repo, &dir, "Gün.md", "- a\n", "- a\n- yerel\n", "- a\n- uzak\n", now_secs() + 1000);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        let (_, merged) = merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("Gün.md")).unwrap(), "- a\n- yerel\n- uzak\n");
        assert!(backups(&dir).is_empty());
        assert_eq!(merged, vec!["Gün.md".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ikili_dosyada_yeni_kazanir_eski_yedeklenir() {
        let (dir, repo) = tmp_repo("ikili");
        fs::write(dir.join("r.png"), [0u8, 1, 2]).unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("r.png"), 0).unwrap();
        e.id = repo.blob(&[0u8, 1, 9]).unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig_at(now_secs() + 1000), &sig_at(now_secs() + 1000), "uzak", &rt, &[&bc]).unwrap();
        fs::write(dir.join("r.png"), [0u8, 1, 3]).unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read(dir.join("r.png")).unwrap(), vec![0u8, 1, 9]);
        let y = fs::read_dir(dir.join(".loomen/cakisma-gecmisi")).unwrap().flatten().next().unwrap().path();
        assert_eq!(fs::read(y.join("r.png")).unwrap(), vec![0u8, 1, 3]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn uzak_sildi_yerel_degistirdi_not_kalir() {
        let (dir, repo) = tmp_repo("sil-degis");
        fs::write(dir.join("S.md"), "1\n").unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        ri.remove_path(std::path::Path::new("S.md")).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak sildi", &rt, &[&bc]).unwrap();
        fs::write(dir.join("S.md"), "1 yerel\n").unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("S.md")).unwrap(), "1 yerel\n");
        assert!(backups(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn yerel_sildi_uzak_degistirdi_not_kalir() {
        let (dir, repo) = tmp_repo("yerel-sil");
        fs::write(dir.join("S.md"), "1\n").unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("S.md"), 0).unwrap();
        e.id = repo.blob(b"1 uzak\n").unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak", &rt, &[&bc]).unwrap();
        fs::remove_file(dir.join("S.md")).unwrap();
        fs::write(dir.join("Baska.md"), "b\n").unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("S.md")).unwrap(), "1 uzak\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn json_ayrik_satirlarda_bile_tum_dosya_kurali() {
        let (dir, repo) = tmp_repo("json");
        let base = "{\n\"a\": 1,\n\"b\": 2,\n\"c\": 3,\n\"d\": 4,\n\"e\": 5\n}\n";
        let (l, r) = diverge_at(&repo, &dir, "ayar.json", base, &base.replace("\"a\": 1", "\"a\": 9"), &base.replace("\"e\": 5", "\"e\": 7"), now_secs() + 1000);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("ayar.json")).unwrap(), base.replace("\"e\": 5", "\"e\": 7"));
        assert_eq!(backups(&dir).len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn yedek_klasorunde_ayni_yolda_farkli_dosya_ikisi_de_kalir() {
        let (dir, repo) = tmp_repo("yedek-yedek");
        fs::write(dir.join("x.md"), "x\n").unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("x.md"), 0).unwrap();
        e.path = b".loomen/cakisma-gecmisi/S/N.md".to_vec();
        e.id = repo.blob(b"uzak yedek\n").unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak", &rt, &[&bc]).unwrap();
        fs::create_dir_all(dir.join(".loomen/cakisma-gecmisi/S")).unwrap();
        fs::write(dir.join(".loomen/cakisma-gecmisi/S/N.md"), "yerel yedek\n").unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        let d = dir.join(".loomen/cakisma-gecmisi/S");
        assert_eq!(fs::read_to_string(d.join("N.md")).unwrap(), "yerel yedek\n");
        assert_eq!(fs::read_to_string(d.join("N-2.md")).unwrap(), "uzak yedek\n");
        assert_eq!(backups(&dir).len(), 2, "yedeğin yedeği oluşmaz");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn yedek_klasoru_temiz_birlesen_dosya_da_birlestirilmez() {
        let (dir, repo) = tmp_repo("yedek-temiz");
        let f = ".loomen/cakisma-gecmisi/S/N.md";
        fs::create_dir_all(dir.join(".loomen/cakisma-gecmisi/S")).unwrap();
        let base = "1\n2\n3\n4\n5\n6\n";
        let (l, r) = diverge_at(&repo, &dir, f, base, "1 y\n2\n3\n4\n5\n6\n", "1\n2\n3\n4\n5\n6 u\n", now_secs() + 1000);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        let d = dir.join(".loomen/cakisma-gecmisi/S");
        assert_eq!(fs::read_to_string(d.join("N.md")).unwrap(), "1 y\n2\n3\n4\n5\n6\n");
        assert_eq!(fs::read_to_string(d.join("N-2.md")).unwrap(), "1\n2\n3\n4\n5\n6 u\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn uzak_dosya_zamani_son_dokunan_commit_olur() {
        let (dir, repo) = tmp_repo("zaman");
        let (l, r) = diverge_at(&repo, &dir, "Z.md", "a\n", "a yerel\n", "a uzak\n", 5_000);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        let base = repo.merge_base(l, r).ok();
        assert_eq!(remote_file_time(&repo, &rc, base, "Z.md"), 5_000);
        set_mtime(&dir.join("Z.md"), 123_456);
        assert_eq!(local_file_time(&repo, &lc, "Z.md"), 123_456);
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
    fn iki_dosya_birden_cakisinca_hicbir_icerik_kaybolmaz() {
        let (dir, repo) = tmp_repo("iki-dosya");
        fs::write(dir.join("B.md"), "b\n").unwrap();
        let (l0, r0) = diverge_at(&repo, &dir, "A.md", "a\n", "a yerel\n", "a uzak\n", now_secs() + 1000);
        let (lc0, rc0) = (repo.find_commit(l0).unwrap(), repo.find_commit(r0).unwrap());
        fs::write(dir.join("B.md"), "b yerel\n").unwrap();
        let l = commit_all(&repo, &[&lc0]);
        let mut ri = Index::new().unwrap();
        ri.read_tree(&rc0.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("B.md"), 0).unwrap();
        e.id = repo.blob(b"b uzak\n").unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig_at(now_secs() + 1000), &sig_at(now_secs() + 1000), "uzak2", &rt, &[&rc0]).unwrap();
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("A.md")).unwrap(), "a uzak\n");
        assert_eq!(fs::read_to_string(dir.join("B.md")).unwrap(), "b uzak\n");
        let bk: Vec<String> = backups(&dir).into_iter().map(|(_, c)| c).collect();
        assert_eq!(bk, vec!["a yerel\n".to_string(), "b yerel\n".to_string()]);
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
        assert!(res.is_err(), "klasör/dosya çakışmasında senkron durmalı");
        assert_eq!(repo.head().unwrap().target().unwrap(), head_before, "hiçbir şey commit'lenmemeli");
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
        let (_, merged) = merge_into_head(&repo, &lc, &rc, &sig()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("N.md")).unwrap(), "1 yerel\n2\n3\n4\n5\n6 uzak\n");
        assert_eq!(merged, vec!["N.md".to_string()], "otomatik birleşen dosya bildirilmeli");
        assert!(backups(&dir).is_empty() && no_copies(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn uzakta_yeniden_adlandirilan_yerelde_degisen_not_birlesir() {
        let (dir, repo) = tmp_repo("ad-degisti");
        let base = "satır 1\nsatır 2\nsatır 3\nsatır 4\nsatır 5\nsatır 6\nsatır 7\nsatır 8\n";
        fs::write(dir.join("A.md"), base).unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        // Uzak: A.md → B.md (içerik aynı).
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("A.md"), 0).unwrap();
        ri.remove_path(std::path::Path::new("A.md")).unwrap();
        e.path = b"B.md".to_vec();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak ad", &rt, &[&bc]).unwrap();
        // Yerel: A.md'nin bir satırı değişir.
        fs::write(dir.join("A.md"), base.replace("satır 1", "satır 1 yerel")).unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        merge_into_head(&repo, &lc, &rc, &sig()).expect("yeniden adlandırma senkronu durdurmamalı");
        let all: String = ["A.md", "B.md"]
            .iter()
            .filter_map(|f| fs::read_to_string(dir.join(f)).ok())
            .collect();
        assert!(all.contains("satır 1 yerel"), "yerel değişiklik korunmalı");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ters_dizin_dosya_cakismasi_uzak_notu_dusurmez() {
        let (dir, repo) = tmp_repo("df-ters");
        fs::write(dir.join("x.md"), "x\n").unwrap();
        let b = commit_all(&repo, &[]);
        let bc = repo.find_commit(b).unwrap();
        // Uzak: Klasor/Not.md ekler.
        let mut ri = Index::new().unwrap();
        ri.read_tree(&bc.tree().unwrap()).unwrap();
        let mut e = ri.get_path(std::path::Path::new("x.md"), 0).unwrap();
        e.path = b"Klasor/Not.md".to_vec();
        e.id = repo.blob(b"uzak not\n").unwrap();
        ri.add(&e).unwrap();
        let rt = repo.find_tree(ri.write_tree_to(&repo).unwrap()).unwrap();
        let r = repo.commit(None, &sig(), &sig(), "uzak", &rt, &[&bc]).unwrap();
        // Yerel: aynı adla DOSYA.
        fs::write(dir.join("Klasor"), "yerel dosya\n").unwrap();
        let l = commit_all(&repo, &[&bc]);
        let (lc, rc) = (repo.find_commit(l).unwrap(), repo.find_commit(r).unwrap());
        let head_before = repo.head().unwrap().target().unwrap();
        let res = merge_into_head(&repo, &lc, &rc, &sig());
        assert!(res.is_err(), "uzak not düşecekse senkron durmalı");
        assert_eq!(repo.head().unwrap().target().unwrap(), head_before);
        assert_eq!(fs::read_to_string(dir.join("Klasor")).unwrap(), "yerel dosya\n");
        let _ = fs::remove_dir_all(&dir);
    }

    // ---- Uçtan uca: gerçek do_sync, bare uzak + iki klon ----

    fn e2e_setup(tag: &str) -> (PathBuf, String, PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "loomen-lom51-e2e-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let bare = root.join("uzak.git");
        let mut o = RepositoryInitOptions::new();
        o.initial_head("main");
        o.bare(true);
        Repository::init_opts(&bare, &o).unwrap();
        let url = bare.to_string_lossy().to_string();
        let (a, b) = (root.join("A"), root.join("B"));
        fs::create_dir_all(&a).unwrap();
        (root, url, a, b)
    }

    fn sync(dir: &std::path::Path, url: &str) -> SyncResult {
        do_sync(dir.to_string_lossy().to_string(), url.to_string(), String::new(), "t".into(), "t@example.com".into()).unwrap()
    }

    #[test]
    fn uctan_uca_iki_cihaz_ayrik_ve_ortusen_degisiklik() {
        let (root, url, a, b) = e2e_setup("temel");
        // A: ilk senkron (uzak boş).
        fs::write(a.join("Not.md"), "1\n2\n3\n4\n5\n6\n").unwrap();
        fs::write(a.join("Gün.md"), "- a\n").unwrap();
        sync(&a, &url);
        Repository::clone(&url, &b).unwrap();
        // A değiştirir ve gönderir (ilk satır + gün notuna ekleme).
        fs::write(a.join("Not.md"), "1 A\n2\n3\n4\n5\n6\n").unwrap();
        fs::write(a.join("Gün.md"), "- a\n- A cihazı\n").unwrap();
        sync(&a, &url);
        // B: aynı satır + farklı satır + gün notuna ekleme. B'nin dosyaları daha yeni.
        fs::write(b.join("Not.md"), "1 B\n2\n3\n4\n5\n6 B\n").unwrap();
        fs::write(b.join("Gün.md"), "- a\n- B cihazı\n").unwrap();
        let future = now_secs() + 3600;
        set_mtime(&b.join("Not.md"), future);
        set_mtime(&b.join("Gün.md"), future);
        let res = sync(&b, &url);
        assert!(res.pulled && res.committed);
        assert_eq!(fs::read_to_string(b.join("Not.md")).unwrap(), "1 B\n2\n3\n4\n5\n6 B\n", "yeni olan B kazanır");
        assert_eq!(fs::read_to_string(b.join("Gün.md")).unwrap(), "- a\n- A cihazı\n- B cihazı\n");
        let mut m = res.merged.clone();
        m.sort();
        assert_eq!(m, vec!["Gün.md".to_string(), "Not.md".to_string()]);
        let bk = backups(&b);
        assert_eq!(bk.len(), 1);
        assert!(bk[0].0.ends_with("/Not.md"));
        assert_eq!(bk[0].1, "1 A\n2\n3\n4\n5\n6\n", "kaybeden A sürümü tam yedeklendi");
        assert!(no_copies(&b));
        // A tekrar senkronlar: birleşik sonuç ve yedek A'ya gelir, yeni çakışma yok.
        let res_a = sync(&a, &url);
        assert!(res_a.merged.is_empty());
        assert_eq!(fs::read_to_string(a.join("Not.md")).unwrap(), "1 B\n2\n3\n4\n5\n6 B\n");
        assert_eq!(backups(&a), bk);
        // Yedek klasörü bir sonraki turda tekrar çakışma/işaret üretmez.
        let res_b = sync(&b, &url);
        assert!(res_b.merged.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn uctan_uca_uzak_yeni_olunca_uzak_kazanir() {
        let (root, url, a, b) = e2e_setup("uzak-yeni");
        fs::write(a.join("N.md"), "x\n").unwrap();
        sync(&a, &url);
        Repository::clone(&url, &b).unwrap();
        fs::write(b.join("N.md"), "x B\n").unwrap();
        set_mtime(&b.join("N.md"), 1_000_000); // B'nin değişikliği çok eski
        fs::write(a.join("N.md"), "x A\n").unwrap();
        sync(&a, &url); // A şimdi gönderdi → uzak commit zamanı yeni
        let res = sync(&b, &url);
        assert_eq!(fs::read_to_string(b.join("N.md")).unwrap(), "x A\n");
        assert_eq!(res.merged, vec!["N.md".to_string()]);
        assert_eq!(backups(&b).into_iter().map(|(_, c)| c).collect::<Vec<_>>(), vec!["x B\n".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }
}
