//! Git staging operations (CHI-319).
//! Stage/unstage entire files and individual hunks via git2-rs.

use crate::git::diff;
use crate::AppError;
use std::path::Path;

/// Stage an entire file (add to index).
/// For new/modified files: adds path to index.
/// For deleted files: removes path from index.
pub fn stage_file(repo_root: &Path, file_path: &str) -> Result<(), AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
    let path = std::path::Path::new(file_path);

    let abs_path = repo_root.join(path);
    if abs_path.exists() {
        index
            .add_path(path)
            .map_err(|e| AppError::Git(e.to_string()))?;
    } else {
        index
            .remove_path(path)
            .map_err(|e| AppError::Git(e.to_string()))?;
    }
    index.write().map_err(|e| AppError::Git(e.to_string()))?;

    Ok(())
}

/// Unstage an entire file (reset index to HEAD state).
/// For files not yet tracked (new file staged): removes from index.
pub fn unstage_file(repo_root: &Path, file_path: &str) -> Result<(), AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    let path = std::path::Path::new(file_path);

    match repo.head() {
        Ok(head) => {
            let commit = head
                .peel_to_commit()
                .map_err(|e| AppError::Git(e.to_string()))?;
            let obj = commit.as_object();
            repo.reset_default(Some(obj), std::iter::once(path))
                .map_err(|e| AppError::Git(e.to_string()))?;
        }
        Err(_) => {
            let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
            index
                .remove_path(path)
                .map_err(|e| AppError::Git(e.to_string()))?;
            index.write().map_err(|e| AppError::Git(e.to_string()))?;
        }
    }

    Ok(())
}

/// Build a minimal valid unified diff patch string for a single hunk.
/// Used to apply a partial patch via `git2::Repository::apply`.
fn build_single_hunk_patch(file_path: &str, hunk: &diff::DiffHunk, reverse: bool) -> String {
    let mut patch = String::new();
    let (old_path, new_path) = if reverse {
        (format!("b/{}", file_path), format!("a/{}", file_path))
    } else {
        (format!("a/{}", file_path), format!("b/{}", file_path))
    };

    patch.push_str(&format!("diff --git a/{0} b/{0}\n", file_path));
    patch.push_str(&format!("--- {}\n", old_path));
    patch.push_str(&format!("+++ {}\n", new_path));

    let (hunk_old_start, hunk_old_lines, hunk_new_start, hunk_new_lines) = if reverse {
        (hunk.new_start, hunk.new_lines, hunk.old_start, hunk.old_lines)
    } else {
        (hunk.old_start, hunk.old_lines, hunk.new_start, hunk.new_lines)
    };

    patch.push_str(&format!(
        "@@ -{},{} +{},{} @@\n",
        hunk_old_start, hunk_old_lines, hunk_new_start, hunk_new_lines
    ));

    for line in &hunk.lines {
        let (prefix, content) = match line.kind {
            diff::DiffLineKind::Added => {
                if reverse {
                    ('-', &line.content)
                } else {
                    ('+', &line.content)
                }
            }
            diff::DiffLineKind::Removed => {
                if reverse {
                    ('+', &line.content)
                } else {
                    ('-', &line.content)
                }
            }
            diff::DiffLineKind::Context => (' ', &line.content),
        };
        patch.push(prefix);
        patch.push_str(content);
        patch.push('\n');
    }

    patch
}

/// Stage a single hunk (index 0-based) of a file's unstaged diff.
pub fn stage_hunk(repo_root: &Path, file_path: &str, hunk_index: usize) -> Result<(), AppError> {
    let file_diff = diff::get_file_diff(repo_root, file_path, false)?
        .ok_or_else(|| AppError::Git(format!("No unstaged diff for '{}'", file_path)))?;

    let hunk = file_diff
        .hunks
        .get(hunk_index)
        .ok_or_else(|| AppError::Git(format!("Hunk index {} out of range", hunk_index)))?;

    let patch_text = build_single_hunk_patch(file_path, hunk, false);
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    let diff = git2::Diff::from_buffer(patch_text.as_bytes())
        .map_err(|e| AppError::Git(format!("Failed to parse patch: {}", e)))?;

    repo.apply(&diff, git2::ApplyLocation::Index, None)
        .map_err(|e| AppError::Git(format!("Failed to apply hunk: {}", e)))?;

    Ok(())
}

/// Unstage a single hunk (index 0-based) of a file's staged diff.
pub fn unstage_hunk(repo_root: &Path, file_path: &str, hunk_index: usize) -> Result<(), AppError> {
    let file_diff = diff::get_file_diff(repo_root, file_path, true)?
        .ok_or_else(|| AppError::Git(format!("No staged diff for '{}'", file_path)))?;

    let hunk = file_diff
        .hunks
        .get(hunk_index)
        .ok_or_else(|| AppError::Git(format!("Hunk index {} out of range", hunk_index)))?;

    let patch_text = build_single_hunk_patch(file_path, hunk, true);
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;
    let diff = git2::Diff::from_buffer(patch_text.as_bytes())
        .map_err(|e| AppError::Git(format!("Failed to parse patch: {}", e)))?;

    repo.apply(&diff, git2::ApplyLocation::Index, None)
        .map_err(|e| AppError::Git(format!("Failed to apply reverse hunk: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::status;
    use std::process::Command;
    use tempfile::TempDir;

    fn init_repo_with_commit() -> TempDir {
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
            .args(["config", "user.name", "T"])
            .current_dir(dir.path())
            .output()
            .expect("set name");
        std::fs::write(dir.path().join("README.md"), "line 1\nline 2\nline 3\n")
            .expect("write file");
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

    fn is_staged(dir: &TempDir, path: &str) -> bool {
        let entries = status::get_status(dir.path()).expect("status");
        entries.iter().any(|e| e.path == path && e.is_staged)
    }

    fn is_modified_unstaged(dir: &TempDir, path: &str) -> bool {
        let entries = status::get_status(dir.path()).expect("status");
        entries.iter().any(|e| e.path == path && !e.is_staged)
    }

    #[test]
    fn test_stage_modified_file() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("README.md"), "changed\n").expect("write");
        assert!(!is_staged(&dir, "README.md"));

        stage_file(dir.path(), "README.md").expect("stage file");
        assert!(is_staged(&dir, "README.md"));
    }

    #[test]
    fn test_unstage_file() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("README.md"), "changed\n").expect("write");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");
        assert!(is_staged(&dir, "README.md"));

        unstage_file(dir.path(), "README.md").expect("unstage file");
        assert!(!is_staged(&dir, "README.md"));
        assert!(is_modified_unstaged(&dir, "README.md"));
    }

    #[test]
    fn test_stage_new_file() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("new.txt"), "hello\n").expect("write");
        stage_file(dir.path(), "new.txt").expect("stage");
        assert!(is_staged(&dir, "new.txt"));
    }

    #[test]
    fn test_stage_deleted_file() {
        let dir = init_repo_with_commit();
        std::fs::remove_file(dir.path().join("README.md")).expect("remove file");
        stage_file(dir.path(), "README.md").expect("stage");
        let entries = status::get_status(dir.path()).expect("status");
        let entry = entries
            .iter()
            .find(|e| e.path == "README.md")
            .expect("deleted entry");
        assert!(entry.is_staged);
        assert_eq!(entry.status, crate::git::status::FileStatusKind::Deleted);
    }

    #[test]
    fn test_stage_hunk_applies_partial_change() {
        let dir = init_repo_with_commit();

        let original = (1..=10)
            .map(|i| format!("line {i}"))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        std::fs::write(dir.path().join("README.md"), &original).expect("write original");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "add lines"])
            .current_dir(dir.path())
            .output()
            .expect("git commit");

        let modified = "CHANGED line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nCHANGED line 10\n";
        std::fs::write(dir.path().join("README.md"), modified).expect("write modified");

        let file_diff = diff::get_file_diff(dir.path(), "README.md", false)
            .expect("get diff")
            .expect("diff exists");
        assert!(!file_diff.hunks.is_empty(), "expected at least one hunk");

        stage_hunk(dir.path(), "README.md", 0).expect("stage hunk");
        assert!(is_staged(&dir, "README.md"));
    }
}
