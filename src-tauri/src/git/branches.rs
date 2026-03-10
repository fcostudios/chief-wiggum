//! Git branch operations via git2-rs (CHI-313).

use crate::AppError;
use std::path::Path;

/// Information about a single Git branch.
#[derive(Debug, Clone, serde::Serialize)]
pub struct BranchInfo {
    /// Branch name (short, no refs/ prefix).
    pub name: String,
    /// Whether this is the currently checked-out branch.
    pub is_current: bool,
    /// Whether this is a remote-tracking branch.
    pub is_remote: bool,
    /// Upstream remote branch name, if set.
    pub upstream: Option<String>,
}

/// List all local (and optionally remote) branches.
pub fn list_branches(repo_root: &Path, include_remote: bool) -> Result<Vec<BranchInfo>, AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut branches = Vec::new();
    for branch_result in repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| AppError::Git(e.to_string()))?
    {
        let (branch, branch_type) = branch_result.map_err(|e| AppError::Git(e.to_string()))?;
        let name = branch
            .name()
            .map_err(|e| AppError::Git(e.to_string()))?
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let is_current = head_name.as_deref() == Some(&name);
        let is_remote = branch_type == git2::BranchType::Remote;
        let upstream = branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

        branches.push(BranchInfo {
            name,
            is_current,
            is_remote,
            upstream,
        });
    }

    if include_remote {
        for branch_result in repo
            .branches(Some(git2::BranchType::Remote))
            .map_err(|e| AppError::Git(e.to_string()))?
        {
            let (branch, _) = branch_result.map_err(|e| AppError::Git(e.to_string()))?;
            let name = branch
                .name()
                .map_err(|e| AppError::Git(e.to_string()))?
                .unwrap_or("")
                .to_string();
            if name.is_empty() || name.ends_with("/HEAD") {
                continue;
            }
            branches.push(BranchInfo {
                name,
                is_current: false,
                is_remote: true,
                upstream: None,
            });
        }
    }

    Ok(branches)
}

/// Switch the working tree to an existing branch by name.
pub fn switch_branch(repo_root: &Path, branch_name: &str) -> Result<(), AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    // Find the branch.
    let branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .map_err(|_| AppError::Git(format!("Branch '{}' not found", branch_name)))?;

    let obj = branch
        .get()
        .peel(git2::ObjectType::Commit)
        .map_err(|e| AppError::Git(e.to_string()))?;

    repo.checkout_tree(&obj, None)
        .map_err(|e| AppError::Git(format!("Checkout failed: {}", e)))?;

    repo.set_head(&format!("refs/heads/{}", branch_name))
        .map_err(|e| AppError::Git(e.to_string()))?;

    Ok(())
}

/// Create a new branch from the current HEAD.
pub fn create_branch(repo_root: &Path, branch_name: &str) -> Result<(), AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let head = repo
        .head()
        .map_err(|e| AppError::Git(format!("Cannot create branch: HEAD not set ({})", e)))?;
    let commit = head
        .peel_to_commit()
        .map_err(|e| AppError::Git(e.to_string()))?;

    repo.branch(branch_name, &commit, false)
        .map_err(|e| AppError::Git(format!("Failed to create branch '{}': {}", branch_name, e)))?;

    Ok(())
}

/// Delete a local branch by name. Refuses to delete the current branch.
pub fn delete_branch(repo_root: &Path, branch_name: &str) -> Result<(), AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    if head_name.as_deref() == Some(branch_name) {
        return Err(AppError::InvalidOperation(format!(
            "Cannot delete the currently checked-out branch '{}'",
            branch_name
        )));
    }

    let mut branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .map_err(|_| AppError::Git(format!("Branch '{}' not found", branch_name)))?;

    branch
        .delete()
        .map_err(|e| AppError::Git(format!("Failed to delete branch '{}': {}", branch_name, e)))?;

    Ok(())
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
    fn test_list_branches_returns_main() {
        let dir = init_repo_with_commit();
        let branches = list_branches(dir.path(), false).expect("list branches");
        assert!(!branches.is_empty());
        let main = branches
            .iter()
            .find(|b| b.name == "main")
            .expect("main should exist");
        assert!(main.is_current);
        assert!(!main.is_remote);
    }

    #[test]
    fn test_create_branch_then_list() {
        let dir = init_repo_with_commit();
        create_branch(dir.path(), "feature/new").expect("create branch");
        let branches = list_branches(dir.path(), false).expect("list branches");
        let new_branch = branches.iter().find(|b| b.name == "feature/new");
        assert!(new_branch.is_some());
        // Not the current branch.
        assert!(!new_branch.expect("branch exists").is_current);
    }

    #[test]
    fn test_switch_branch() {
        let dir = init_repo_with_commit();
        create_branch(dir.path(), "develop").expect("create branch");
        switch_branch(dir.path(), "develop").expect("switch branch");
        let branches = list_branches(dir.path(), false).expect("list branches");
        let develop = branches
            .iter()
            .find(|b| b.name == "develop")
            .expect("develop should exist");
        assert!(develop.is_current);
        let main = branches
            .iter()
            .find(|b| b.name == "main")
            .expect("main should exist");
        assert!(!main.is_current);
    }

    #[test]
    fn test_delete_branch() {
        let dir = init_repo_with_commit();
        create_branch(dir.path(), "to-delete").expect("create branch");
        delete_branch(dir.path(), "to-delete").expect("delete branch");
        let branches = list_branches(dir.path(), false).expect("list branches");
        assert!(branches.iter().all(|b| b.name != "to-delete"));
    }

    #[test]
    fn test_delete_current_branch_fails() {
        let dir = init_repo_with_commit();
        let result = delete_branch(dir.path(), "main");
        assert!(result.is_err());
        assert!(result
            .expect_err("should fail")
            .to_string()
            .contains("currently checked-out"));
    }

    #[test]
    fn test_switch_to_nonexistent_branch_fails() {
        let dir = init_repo_with_commit();
        let result = switch_branch(dir.path(), "does-not-exist");
        assert!(result.is_err());
    }
}
