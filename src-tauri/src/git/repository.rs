//! Git repository discovery and basic repo info.

use crate::AppError;
use std::path::{Path, PathBuf};

/// Basic info about a discovered Git repository.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RepoInfo {
    /// Absolute path of the repository root (where .git lives).
    pub root: String,
    /// Current HEAD branch name, or None if detached/empty repo.
    pub head_branch: Option<String>,
    /// Whether the repository has any uncommitted changes.
    pub is_dirty: bool,
    /// Commits ahead of the tracking upstream branch.
    pub ahead: u32,
    /// Commits behind the tracking upstream branch.
    pub behind: u32,
}

/// Discover the Git repository root starting from `start_path`.
/// Walks up the directory tree until a `.git` directory is found.
/// Returns `None` if not inside a Git repository.
pub fn discover_repository(start_path: &Path) -> Option<PathBuf> {
    git2::Repository::discover(start_path)
        .ok()
        .and_then(|repo| repo.workdir().map(|p| p.to_path_buf()))
}

fn compute_ahead_behind(repo: &git2::Repository) -> (u32, u32) {
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return (0, 0),
    };

    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return (0, 0),
    };

    let branch_name = match head.shorthand() {
        Some(name) => name,
        None => return (0, 0),
    };

    let upstream_oid = match repo
        .find_branch(branch_name, git2::BranchType::Local)
        .ok()
        .and_then(|branch| branch.upstream().ok())
        .and_then(|branch| branch.get().target())
    {
        Some(oid) => oid,
        None => return (0, 0),
    };

    repo.graph_ahead_behind(local_oid, upstream_oid)
        .map(|(ahead, behind)| (ahead as u32, behind as u32))
        .unwrap_or((0, 0))
}

/// Get basic repo info for the repository containing `start_path`.
/// Returns `None` if not inside a Git repo.
pub fn get_repo_info(start_path: &Path) -> Result<Option<RepoInfo>, AppError> {
    let repo = match git2::Repository::discover(start_path) {
        Ok(r) => r,
        Err(e) if e.code() == git2::ErrorCode::NotFound => return Ok(None),
        Err(e) => return Err(AppError::Git(e.to_string())),
    };

    let workdir = match repo.workdir() {
        Some(d) => d.to_string_lossy().to_string(),
        None => return Ok(None), // bare repo — not supported
    };

    let head_branch = match repo.head() {
        Ok(head) => head.shorthand().map(|s| s.to_string()),
        Err(_) => None, // empty repo or detached HEAD
    };

    let is_dirty = {
        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(false);
        opts.exclude_submodules(true);
        repo.statuses(Some(&mut opts))
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    };
    let (ahead, behind) = compute_ahead_behind(&repo);

    Ok(Some(RepoInfo {
        root: workdir,
        head_branch,
        is_dirty,
        ahead,
        behind,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::TempDir;

    fn init_test_repo() -> TempDir {
        let dir = TempDir::new().expect("create temp dir");
        Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .expect("init repo");
        Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(dir.path())
            .output()
            .expect("set email");
        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(dir.path())
            .output()
            .expect("set name");
        dir
    }

    #[test]
    fn test_discover_finds_repo_root() {
        let dir = init_test_repo();
        let sub = dir.path().join("subdir");
        std::fs::create_dir(&sub).expect("create subdir");

        let found = discover_repository(&sub);
        assert!(found.is_some());
        // The workdir should be the repo root, not the subdir
        let root = found.expect("repo root should be found");
        assert!(root.join(".git").exists());
    }

    #[test]
    fn test_discover_returns_none_outside_repo() {
        let dir = TempDir::new().expect("create temp dir"); // no git init
        let found = discover_repository(dir.path());
        assert!(found.is_none());
    }

    #[test]
    fn test_get_repo_info_empty_repo() {
        let dir = init_test_repo();
        let info = get_repo_info(dir.path())
            .expect("get repo info")
            .expect("repo should exist");
        assert!(!info.root.is_empty());
        // Empty repo has no HEAD branch yet
        assert!(!info.is_dirty);
    }

    #[test]
    fn test_get_repo_info_with_branch() {
        let dir = init_test_repo();
        // Make an initial commit so HEAD resolves
        std::fs::write(dir.path().join("README.md"), "hello").expect("write readme");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir.path())
            .output()
            .expect("git commit");

        let info = get_repo_info(dir.path())
            .expect("get repo info")
            .expect("repo should exist");
        assert_eq!(info.head_branch.as_deref(), Some("main"));
        assert!(!info.is_dirty);
        assert_eq!(info.ahead, 0);
        assert_eq!(info.behind, 0);
    }

    #[test]
    fn test_get_repo_info_dirty() {
        let dir = init_test_repo();
        std::fs::write(dir.path().join("README.md"), "hello").expect("write readme");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir.path())
            .output()
            .expect("git commit");

        // Create an untracked file → dirty
        std::fs::write(dir.path().join("new_file.txt"), "change").expect("write new file");

        let info = get_repo_info(dir.path())
            .expect("get repo info")
            .expect("repo should exist");
        assert!(info.is_dirty);
    }

    #[test]
    fn test_get_repo_info_ahead_behind_no_remote() {
        let dir = init_test_repo();
        std::fs::write(dir.path().join("README.md"), "hello").expect("write readme");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir.path())
            .output()
            .expect("git commit");

        let info = get_repo_info(dir.path())
            .expect("get repo info")
            .expect("repo should exist");
        assert_eq!(info.ahead, 0, "no remote should report ahead=0");
        assert_eq!(info.behind, 0, "no remote should report behind=0");
    }

    #[test]
    fn test_get_repo_info_none_outside_repo() {
        let dir = TempDir::new().expect("create temp dir");
        let info = get_repo_info(dir.path()).expect("outside repo should be Ok(None)");
        assert!(info.is_none());
    }
}
