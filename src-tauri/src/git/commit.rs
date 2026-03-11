//! Git commit creation and amend operations (CHI-320).

use crate::AppError;
use std::path::Path;

/// Create a new commit from the current index with the given message.
pub fn create_commit(repo_root: &Path, message: &str) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::Validation(
            "Commit message cannot be empty".to_string(),
        ));
    }

    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    let sig = repo.signature().map_err(|e| {
        AppError::Git(format!(
            "Cannot create signature: {}. Set git user.name and user.email.",
            e
        ))
    })?;

    let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
    index
        .read(false)
        .map_err(|e| AppError::Git(e.to_string()))?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| AppError::Git(e.to_string()))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| AppError::Git(e.to_string()))?;

    let parents: Vec<git2::Commit<'_>> = if let Ok(head) = repo.head() {
        vec![head
            .peel_to_commit()
            .map_err(|e| AppError::Git(e.to_string()))?]
    } else {
        vec![]
    };
    let parent_refs: Vec<&git2::Commit<'_>> = parents.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
        .map_err(|e| AppError::Git(format!("Commit failed: {}", e)))?;

    Ok(format!("{:.7}", oid))
}

/// Amend the last commit with a new message and/or the current index state.
pub fn amend_commit(repo_root: &Path, message: &str) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::Validation(
            "Commit message cannot be empty".to_string(),
        ));
    }

    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    let head_commit = repo
        .head()
        .map_err(|_| AppError::Git("No commits to amend".to_string()))?
        .peel_to_commit()
        .map_err(|e| AppError::Git(e.to_string()))?;

    let sig = repo
        .signature()
        .map_err(|e| AppError::Git(format!("Cannot create signature: {}", e)))?;

    let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
    index
        .read(false)
        .map_err(|e| AppError::Git(e.to_string()))?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| AppError::Git(e.to_string()))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| AppError::Git(e.to_string()))?;

    let oid = head_commit
        .amend(
            Some("HEAD"),
            Some(&sig),
            Some(&sig),
            None,
            Some(message),
            Some(&tree),
        )
        .map_err(|e| AppError::Git(format!("Amend failed: {}", e)))?;

    Ok(format!("{:.7}", oid))
}

/// Get the message of the last commit (for amend pre-fill).
/// Returns None if there are no commits.
pub fn get_last_commit_message(repo_root: &Path) -> Result<Option<String>, AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let head_ref = repo.head();
    match head_ref {
        Ok(head) => {
            let commit = head
                .peel_to_commit()
                .map_err(|e| AppError::Git(e.to_string()))?;
            Ok(commit.message().map(|s| s.trim_end().to_string()))
        }
        Err(_) => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::staging;
    use std::process::Command;
    use tempfile::TempDir;

    fn init_empty_repo() -> TempDir {
        let dir = TempDir::new().expect("temp dir");
        Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .expect("git init");
        Command::new("git")
            .args(["config", "user.email", "t@t.com"])
            .current_dir(dir.path())
            .output()
            .expect("set email");
        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(dir.path())
            .output()
            .expect("set name");
        dir
    }

    fn init_repo_with_commit() -> TempDir {
        let dir = init_empty_repo();
        std::fs::write(dir.path().join("README.md"), "hello\n").expect("write readme");
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
    fn test_create_initial_commit() {
        let dir = init_empty_repo();
        std::fs::write(dir.path().join("README.md"), "hello\n").expect("write readme");
        staging::stage_file(dir.path(), "README.md").expect("stage");
        let sha = create_commit(dir.path(), "Initial commit").expect("create commit");
        assert_eq!(sha.len(), 7);
    }

    #[test]
    fn test_create_commit_returns_short_sha() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("new.txt"), "new\n").expect("write file");
        staging::stage_file(dir.path(), "new.txt").expect("stage");
        let sha = create_commit(dir.path(), "Add new file").expect("create commit");
        assert_eq!(sha.len(), 7, "SHA should be 7 characters");
    }

    #[test]
    fn test_create_commit_empty_message_fails() {
        let dir = init_repo_with_commit();
        let result = create_commit(dir.path(), "");
        assert!(result.is_err());
        assert!(result.expect_err("error").to_string().contains("empty"));
    }

    #[test]
    fn test_create_commit_whitespace_message_fails() {
        let dir = init_repo_with_commit();
        let result = create_commit(dir.path(), "   ");
        assert!(result.is_err());
    }

    #[test]
    fn test_amend_commit() {
        let dir = init_repo_with_commit();
        let sha = amend_commit(dir.path(), "Amended message").expect("amend");
        assert_eq!(sha.len(), 7);
        let msg = get_last_commit_message(dir.path()).expect("message");
        assert_eq!(msg.as_deref(), Some("Amended message"));
    }

    #[test]
    fn test_get_last_commit_message_existing_repo() {
        let dir = init_repo_with_commit();
        let msg = get_last_commit_message(dir.path()).expect("message");
        assert_eq!(msg.as_deref(), Some("init"));
    }

    #[test]
    fn test_get_last_commit_message_empty_repo() {
        let dir = init_empty_repo();
        let msg = get_last_commit_message(dir.path()).expect("message");
        assert!(msg.is_none());
    }

    #[test]
    fn test_amend_on_empty_repo_fails() {
        let dir = init_empty_repo();
        let result = amend_commit(dir.path(), "Amend with no commits");
        assert!(result.is_err());
    }
}
