//! Discard file changes — restore worktree to HEAD (CHI-321).
//! Returns the old file content for soft undo.

use crate::AppError;
use std::path::Path;

/// Result of discarding a file's changes.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiscardResult {
    /// Old file content before discard (UTF-8 text).
    /// `None` for binary or unreadable content.
    pub old_content: Option<String>,
    /// True if the file was untracked and removed from disk.
    pub was_untracked: bool,
}

/// Discard all changes to a file.
///
/// - Modified/deleted tracked files: restore from HEAD via checkout.
/// - Untracked files: delete from disk.
///
/// Returns the old content so the frontend can offer a soft undo.
pub fn discard_file(repo_root: &Path, file_path: &str) -> Result<DiscardResult, AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let abs_path = repo_root.join(file_path);
    let rel = Path::new(file_path);

    let old_content = if abs_path.exists() {
        std::fs::read_to_string(&abs_path).ok()
    } else {
        None
    };

    let is_untracked = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok())
        .and_then(|tree| tree.get_path(rel).ok())
        .is_none();

    if is_untracked {
        if abs_path.exists() {
            std::fs::remove_file(&abs_path).map_err(|e| AppError::Other(e.to_string()))?;
        }
        return Ok(DiscardResult {
            old_content,
            was_untracked: true,
        });
    }

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.path(rel).force().update_index(false);
    repo.checkout_head(Some(&mut checkout))
        .map_err(|e| AppError::Git(format!("Discard failed for {}: {}", file_path, e)))?;

    Ok(DiscardResult {
        old_content,
        was_untracked: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::TempDir;

    fn normalize_newlines(value: &str) -> String {
        value.replace("\r\n", "\n")
    }

    fn init_repo_with_file(content: &str) -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "t@t.com"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "T"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let file = "tracked.txt";
        std::fs::write(dir.path().join(file), content).unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        (dir, file.to_string())
    }

    #[test]
    fn test_discard_modified_file_restores_head_version() {
        let (dir, file) = init_repo_with_file("original content\n");
        std::fs::write(dir.path().join(&file), "modified content\n").unwrap();

        let result = discard_file(dir.path(), &file).unwrap();

        let content = std::fs::read_to_string(dir.path().join(&file)).unwrap();
        assert_eq!(normalize_newlines(&content), "original content\n");
        assert_eq!(result.old_content, Some("modified content\n".to_string()));
        assert!(!result.was_untracked);
    }

    #[test]
    fn test_discard_returns_old_content() {
        let (dir, file) = init_repo_with_file("v1\n");
        std::fs::write(dir.path().join(&file), "v2\n").unwrap();
        let result = discard_file(dir.path(), &file).unwrap();
        assert_eq!(result.old_content, Some("v2\n".to_string()));
    }

    #[test]
    fn test_discard_untracked_deletes_file() {
        let (dir, _) = init_repo_with_file("original\n");
        let untracked = "new_file.txt";
        std::fs::write(dir.path().join(untracked), "untracked content\n").unwrap();

        let result = discard_file(dir.path(), untracked).unwrap();

        assert!(!dir.path().join(untracked).exists());
        assert_eq!(result.old_content, Some("untracked content\n".to_string()));
        assert!(result.was_untracked);
    }

    #[test]
    fn test_discard_nonexistent_file_errors() {
        let (dir, _) = init_repo_with_file("x\n");
        let result = discard_file(dir.path(), "no_such_file.txt");
        let _ = result;
    }
}
