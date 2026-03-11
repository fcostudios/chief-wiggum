//! Git commit log with pagination (CHI-324).

use crate::AppError;
use std::path::Path;

/// Single commit entry for Git panel history.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommitEntry {
    pub sha: String,
    pub short_sha: String,
    pub summary: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    /// Unix seconds.
    pub timestamp: i64,
}

/// List commits reachable from HEAD in reverse chronological order.
pub fn list_commits(
    repo_root: &Path,
    skip: usize,
    limit: usize,
) -> Result<Vec<CommitEntry>, AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    if limit == 0 {
        return Ok(vec![]);
    }

    let head_oid = match repo.head().ok().and_then(|head| head.target()) {
        Some(oid) => oid,
        None => return Ok(vec![]),
    };

    let mut revwalk = repo.revwalk().map_err(|e| AppError::Git(e.to_string()))?;
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| AppError::Git(e.to_string()))?;
    revwalk
        .push(head_oid)
        .map_err(|e| AppError::Git(e.to_string()))?;

    let mut entries = Vec::with_capacity(limit);
    for oid_result in revwalk.skip(skip).take(limit) {
        let oid = oid_result.map_err(|e| AppError::Git(e.to_string()))?;
        let commit = repo.find_commit(oid).map_err(|e| AppError::Git(e.to_string()))?;

        let sha = oid.to_string();
        let short_sha: String = sha.chars().take(7).collect();
        let summary = commit.summary().unwrap_or("").to_string();
        let message = commit.message().unwrap_or("").to_string();
        let author = commit.author().name().unwrap_or("Unknown").to_string();
        let author_email = commit.author().email().unwrap_or("").to_string();
        let timestamp = commit.author().when().seconds();

        entries.push(CommitEntry {
            sha,
            short_sha,
            summary,
            message,
            author,
            author_email,
            timestamp,
        });
    }

    Ok(entries)
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

    fn init_repo_with_commits(count: usize) -> TempDir {
        let dir = TempDir::new().expect("temp dir");
        run_git(dir.path(), &["init", "-b", "main"]);
        run_git(dir.path(), &["config", "user.email", "test@example.com"]);
        run_git(dir.path(), &["config", "user.name", "Test User"]);

        for i in 0..count {
            std::fs::write(
                dir.path().join(format!("file-{}.txt", i)),
                format!("content {}", i),
            )
            .expect("write file");
            run_git(dir.path(), &["add", "."]);
            run_git(dir.path(), &["commit", "-m", &format!("commit {}", i)]);
        }

        dir
    }

    #[test]
    fn list_commits_returns_limited_results() {
        let dir = init_repo_with_commits(5);
        let commits = list_commits(dir.path(), 0, 3).expect("list commits");
        assert_eq!(commits.len(), 3);
    }

    #[test]
    fn list_commits_honors_skip() {
        let dir = init_repo_with_commits(4);
        let all = list_commits(dir.path(), 0, 4).expect("list all");
        let skipped = list_commits(dir.path(), 2, 4).expect("list skipped");
        assert_eq!(skipped.len(), 2);
        assert_eq!(skipped[0].sha, all[2].sha);
    }

    #[test]
    fn list_commits_returns_empty_on_unborn_head() {
        let dir = TempDir::new().expect("temp dir");
        run_git(dir.path(), &["init", "-b", "main"]);
        run_git(dir.path(), &["config", "user.email", "test@example.com"]);
        run_git(dir.path(), &["config", "user.name", "Test User"]);

        let commits = list_commits(dir.path(), 0, 10).expect("list commits");
        assert!(commits.is_empty());
    }

    #[test]
    fn list_commits_short_sha_is_seven_chars() {
        let dir = init_repo_with_commits(1);
        let commits = list_commits(dir.path(), 0, 1).expect("list commits");
        assert_eq!(commits[0].short_sha.len(), 7);
    }
}
