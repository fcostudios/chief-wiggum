//! Git remote operations for fetch, pull, and push (CHI-322).
//! These functions are blocking and should run inside `spawn_blocking`.

use crate::AppError;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitProgressPayload {
    pub operation: String,
    pub current: u32,
    pub total: u32,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PullResult {
    pub commits_pulled: u32,
    pub had_conflicts: bool,
    pub message: String,
}

fn make_credentials_callback(
) -> impl FnMut(&str, Option<&str>, git2::CredentialType) -> Result<git2::Cred, git2::Error> {
    move |url, username_from_url, allowed_types| {
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            return git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
        }

        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(config) = git2::Config::open_default() {
                if let Ok(cred) = git2::Cred::credential_helper(&config, url, username_from_url) {
                    return Ok(cred);
                }
            }
        }

        if allowed_types.contains(git2::CredentialType::DEFAULT) {
            return git2::Cred::default();
        }

        Err(git2::Error::from_str(
            "No suitable credentials available. Configure SSH keys or git credential helper.",
        ))
    }
}

pub fn fetch<F>(repo_root: &Path, remote_name: &str, mut progress_cb: F) -> Result<(), AppError>
where
    F: FnMut(GitProgressPayload),
{
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|_| AppError::Git(format!("Remote '{}' not found", remote_name)))?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(make_credentials_callback());
    callbacks.transfer_progress(move |stats| {
        progress_cb(GitProgressPayload {
            operation: "fetch".to_string(),
            current: stats.received_objects() as u32,
            total: stats.total_objects() as u32,
            message: format!(
                "Receiving objects: {}/{}",
                stats.received_objects(),
                stats.total_objects()
            ),
        });
        true
    });

    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    remote
        .fetch(&[] as &[&str], Some(&mut fetch_options), None)
        .map_err(|e| AppError::Git(format!("Fetch failed: {}", e)))?;

    Ok(())
}

pub fn pull<F>(repo_root: &Path, remote_name: &str, progress_cb: F) -> Result<PullResult, AppError>
where
    F: FnMut(GitProgressPayload),
{
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    fetch(repo_root, remote_name, progress_cb)?;

    let head = repo
        .head()
        .map_err(|_| AppError::Git("No HEAD — cannot pull".to_string()))?;
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Git("HEAD is not a branch".to_string()))?
        .to_string();

    let tracking_ref_name = format!("refs/remotes/{}/{}", remote_name, branch_name);
    let fetch_head = repo
        .find_reference(&tracking_ref_name)
        .map_err(|_| AppError::Git(format!("No tracking branch at {}", tracking_ref_name)))?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(|e| AppError::Git(e.to_string()))?;

    let (analysis, _) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| AppError::Git(e.to_string()))?;
    if analysis.is_up_to_date() {
        return Ok(PullResult {
            commits_pulled: 0,
            had_conflicts: false,
            message: "Already up to date.".to_string(),
        });
    }

    if !analysis.is_fast_forward() {
        return Err(AppError::Git(
            "Cannot fast-forward — branch has diverged. Please merge or rebase manually."
                .to_string(),
        ));
    }

    let local_oid = head
        .target()
        .ok_or_else(|| AppError::Git("HEAD has no target".to_string()))?;
    let remote_oid = fetch_commit.id();
    let commits_pulled = repo
        .graph_ahead_behind(remote_oid, local_oid)
        .map(|(ahead, _)| ahead as u32)
        .unwrap_or(0);

    let local_ref_name = format!("refs/heads/{}", branch_name);
    let mut local_ref = repo
        .find_reference(&local_ref_name)
        .map_err(|e| AppError::Git(e.to_string()))?;
    local_ref
        .set_target(remote_oid, &format!("pull: fast-forward {}", remote_name))
        .map_err(|e| AppError::Git(e.to_string()))?;
    repo.set_head(&local_ref_name)
        .map_err(|e| AppError::Git(e.to_string()))?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().safe()))
        .map_err(|e| AppError::Git(format!("Checkout after pull failed: {}", e)))?;

    Ok(PullResult {
        commits_pulled,
        had_conflicts: false,
        message: format!(
            "Pulled {} commit(s) from {}/{}",
            commits_pulled, remote_name, branch_name
        ),
    })
}

pub fn push<F>(repo_root: &Path, remote_name: &str, mut progress_cb: F) -> Result<(), AppError>
where
    F: FnMut(GitProgressPayload),
{
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let head = repo
        .head()
        .map_err(|_| AppError::Git("No HEAD — cannot push".to_string()))?;
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Git("HEAD is not a branch".to_string()))?
        .to_string();

    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|_| AppError::Git(format!("Remote '{}' not found", remote_name)))?;
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(make_credentials_callback());
    callbacks.push_transfer_progress(move |current, total, _bytes| {
        progress_cb(GitProgressPayload {
            operation: "push".to_string(),
            current: current as u32,
            total: total as u32,
            message: format!("Writing objects: {}/{}", current, total),
        });
    });

    let mut push_options = git2::PushOptions::new();
    push_options.remote_callbacks(callbacks);
    remote
        .push(&[refspec.as_str()], Some(&mut push_options))
        .map_err(|e| {
            let message = e.message().to_string();
            if message.contains("non-fast-forward") || message.contains("rejected") {
                AppError::Git(format!("Push rejected — pull first and merge: {}", message))
            } else {
                AppError::Git(format!("Push failed: {}", message))
            }
        })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::TempDir;

    fn run_git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("run git command");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_remote_with_seed_commit() -> (TempDir, TempDir) {
        let bare = TempDir::new().expect("create bare temp dir");
        run_git(bare.path(), &["init", "--bare"]);

        let seed = TempDir::new().expect("create seed temp dir");
        run_git(seed.path(), &["init", "-b", "main"]);
        run_git(seed.path(), &["config", "user.email", "test@example.com"]);
        run_git(seed.path(), &["config", "user.name", "Test User"]);
        std::fs::write(seed.path().join("README.md"), "seed\n").expect("write seed");
        run_git(seed.path(), &["add", "."]);
        run_git(seed.path(), &["commit", "-m", "seed"]);
        run_git(
            seed.path(),
            &[
                "remote",
                "add",
                "origin",
                bare.path().to_str().expect("bare path"),
            ],
        );
        run_git(seed.path(), &["push", "-u", "origin", "main"]);

        (bare, seed)
    }

    fn clone_repo(remote: &Path) -> TempDir {
        let clone = TempDir::new().expect("create clone temp dir");
        run_git(
            clone.path(),
            &[
                "clone",
                "--local",
                remote.to_str().expect("remote path"),
                ".",
            ],
        );
        run_git(clone.path(), &["config", "user.email", "test@example.com"]);
        run_git(clone.path(), &["config", "user.name", "Test User"]);
        clone
    }

    fn create_and_push_commit(repo: &Path, filename: &str, message: &str) {
        std::fs::write(repo.join(filename), message).expect("write commit file");
        run_git(repo, &["add", "."]);
        run_git(repo, &["commit", "-m", message]);
        run_git(repo, &["push", "origin", "main"]);
    }

    #[test]
    fn fetch_from_local_remote_succeeds() {
        let (remote, _seed) = init_remote_with_seed_commit();
        let local = clone_repo(remote.path());
        let publisher = clone_repo(remote.path());

        create_and_push_commit(publisher.path(), "remote.txt", "remote update");
        let result = fetch(local.path(), "origin", |_| {});
        assert!(result.is_ok(), "fetch should succeed: {:?}", result.err());
    }

    #[test]
    fn pull_reports_up_to_date_when_no_changes() {
        let (remote, _seed) = init_remote_with_seed_commit();
        let local = clone_repo(remote.path());
        let result = pull(local.path(), "origin", |_| {}).expect("pull should succeed");
        assert_eq!(result.commits_pulled, 0);
        assert!(result.message.contains("up to date"));
    }

    #[test]
    fn pull_fast_forwards_new_remote_commit() {
        let (remote, _seed) = init_remote_with_seed_commit();
        let local = clone_repo(remote.path());
        let publisher = clone_repo(remote.path());

        create_and_push_commit(publisher.path(), "new.txt", "remote commit");
        let result = pull(local.path(), "origin", |_| {}).expect("pull should succeed");
        assert_eq!(result.commits_pulled, 1);
    }

    #[test]
    fn push_to_local_remote_succeeds() {
        let (remote, _seed) = init_remote_with_seed_commit();
        let local = clone_repo(remote.path());
        std::fs::write(local.path().join("local.txt"), "local change").expect("write local");
        run_git(local.path(), &["add", "."]);
        run_git(local.path(), &["commit", "-m", "local commit"]);

        let result = push(local.path(), "origin", |_| {});
        assert!(result.is_ok(), "push should succeed: {:?}", result.err());
    }

    #[test]
    fn fetch_missing_remote_returns_error() {
        let dir = TempDir::new().expect("create temp dir");
        run_git(dir.path(), &["init", "-b", "main"]);
        let result = fetch(dir.path(), "nonexistent", |_| {});
        assert!(result.is_err());
        assert!(result
            .expect_err("expected missing remote error")
            .to_string()
            .contains("not found"));
    }

    #[test]
    fn credentials_callback_handles_default_credentials() {
        let mut callback = make_credentials_callback();
        let _ = callback(
            "https://example.com/repo.git",
            None,
            git2::CredentialType::DEFAULT,
        );
    }
}
