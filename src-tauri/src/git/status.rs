//! Git status operations via git2-rs (CHI-314).

use crate::AppError;
use std::path::Path;

/// How a file is categorized in the working tree.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatusKind {
    Staged,
    Modified,
    Untracked,
    Deleted,
    Renamed,
    Conflicted,
}

/// A single file's Git status entry.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileStatusEntry {
    /// Relative path from repo root (forward slashes).
    pub path: String,
    /// Primary status category.
    pub status: FileStatusKind,
    /// True if changes are in the index (staged area).
    pub is_staged: bool,
    /// Original path before rename, if applicable.
    pub old_path: Option<String>,
}

/// Get the full working tree status grouped by category.
pub fn get_status(repo_root: &Path) -> Result<Vec<FileStatusEntry>, AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .exclude_submodules(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| AppError::Git(e.to_string()))?;

    let mut entries = Vec::new();

    for entry in statuses.iter() {
        let flags = entry.status();
        let path = entry.path().unwrap_or("").to_string();

        // Index (staged) changes
        if flags.contains(git2::Status::INDEX_NEW)
            || flags.contains(git2::Status::INDEX_MODIFIED)
            || flags.contains(git2::Status::INDEX_TYPECHANGE)
        {
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Staged,
                is_staged: true,
                old_path: None,
            });
        } else if flags.contains(git2::Status::INDEX_DELETED) {
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Deleted,
                is_staged: true,
                old_path: None,
            });
        } else if flags.contains(git2::Status::INDEX_RENAMED) {
            let old = entry
                .head_to_index()
                .and_then(|d| d.old_file().path())
                .map(|p| p.to_string_lossy().to_string());
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Renamed,
                is_staged: true,
                old_path: old,
            });
        }

        // Worktree (unstaged) changes — only if not already captured as staged
        if flags.contains(git2::Status::WT_MODIFIED) || flags.contains(git2::Status::WT_TYPECHANGE)
        {
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Modified,
                is_staged: false,
                old_path: None,
            });
        } else if flags.contains(git2::Status::WT_DELETED) {
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Deleted,
                is_staged: false,
                old_path: None,
            });
        } else if flags.contains(git2::Status::WT_NEW) {
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Untracked,
                is_staged: false,
                old_path: None,
            });
        } else if flags.contains(git2::Status::CONFLICTED) {
            entries.push(FileStatusEntry {
                path: path.clone(),
                status: FileStatusKind::Conflicted,
                is_staged: false,
                old_path: None,
            });
        }
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::TempDir;

    fn init_repo_with_commit() -> TempDir {
        let dir = TempDir::new().expect("create temp dir");
        Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .expect("init repo");
        Command::new("git")
            .args(["config", "user.email", "t@t.com"])
            .current_dir(dir.path())
            .output()
            .expect("set email");
        Command::new("git")
            .args(["config", "user.name", "T"])
            .current_dir(dir.path())
            .output()
            .expect("set name");
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
        dir
    }

    #[test]
    fn test_status_clean_repo() {
        let dir = init_repo_with_commit();
        let entries = get_status(dir.path()).expect("get status");
        assert!(
            entries.is_empty(),
            "clean repo should have no status entries"
        );
    }

    #[test]
    fn test_status_detects_modified() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("README.md"), "modified").expect("modify file");
        let entries = get_status(dir.path()).expect("get status");
        assert!(!entries.is_empty());
        let modified: Vec<_> = entries
            .iter()
            .filter(|e| e.status == FileStatusKind::Modified)
            .collect();
        assert!(!modified.is_empty());
        assert!(!modified[0].is_staged);
    }

    #[test]
    fn test_status_detects_untracked() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("new.txt"), "new").expect("write untracked file");
        let entries = get_status(dir.path()).expect("get status");
        let untracked: Vec<_> = entries
            .iter()
            .filter(|e| e.status == FileStatusKind::Untracked)
            .collect();
        assert!(!untracked.is_empty());
        assert_eq!(untracked[0].path, "new.txt");
    }

    #[test]
    fn test_status_detects_staged() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("README.md"), "staged change").expect("modify file");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");
        let entries = get_status(dir.path()).expect("get status");
        let staged: Vec<_> = entries.iter().filter(|e| e.is_staged).collect();
        assert!(!staged.is_empty());
        assert_eq!(staged[0].status, FileStatusKind::Staged);
    }

    #[test]
    fn test_status_detects_staged_deletion() {
        let dir = init_repo_with_commit();
        Command::new("git")
            .args(["rm", "README.md"])
            .current_dir(dir.path())
            .output()
            .expect("git rm");
        let entries = get_status(dir.path()).expect("get status");
        let deleted_staged: Vec<_> = entries
            .iter()
            .filter(|e| e.status == FileStatusKind::Deleted && e.is_staged)
            .collect();
        assert!(!deleted_staged.is_empty());
    }
}
