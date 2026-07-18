// GitHub iki yönlü git senkronu — git2/libgit2 (openssl). YALNIZ masaüstü.
// (Mobilde openssl-sys cross-compile olmaz; mobil için reqwest tabanlı github_api kullanılır.)
use git2::{
    build::CheckoutBuilder, Cred, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks,
    Repository, RepositoryInitOptions, Signature,
};
use serde::Serialize;

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
