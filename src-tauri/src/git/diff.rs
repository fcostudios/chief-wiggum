//! Git diff generation via git2-rs (CHI-317).
//! Parses unified patch output into typed hunk/line structures.

use crate::AppError;
use std::path::Path;

/// The kind of a diff line.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffLineKind {
    Added,
    Removed,
    Context,
}

/// A single line in a diff hunk.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    /// Line number in the old file (None for added lines).
    pub old_lineno: Option<u32>,
    /// Line number in the new file (None for removed lines).
    pub new_lineno: Option<u32>,
    /// Line content without leading +/-/space and without trailing newline.
    pub content: String,
}

/// A single diff hunk.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffHunk {
    /// Full hunk header, e.g. "@@ -1,5 +1,6 @@ fn foo()".
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

/// Diff result for a single file.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileDiff {
    /// Relative path in the repo (forward slashes).
    pub path: String,
    /// Original path before rename.
    pub old_path: Option<String>,
    pub is_binary: bool,
    pub is_new_file: bool,
    pub hunks: Vec<DiffHunk>,
}

/// Get the diff for a single file.
///
/// - `staged = true`:  shows what is staged (index vs HEAD).
/// - `staged = false`: shows what is unstaged (worktree vs index).
///
/// Returns `None` if the file has no diff (clean).
pub fn get_file_diff(
    repo_root: &Path,
    file_path: &str,
    staged: bool,
) -> Result<Option<FileDiff>, AppError> {
    let repo = git2::Repository::open(repo_root).map_err(|e| AppError::Git(e.to_string()))?;

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(file_path);

    let diff = if staged {
        // Staged diff: HEAD → index.
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
            .map_err(|e| AppError::Git(e.to_string()))?
    } else {
        // Unstaged diff: index → workdir.
        repo.diff_index_to_workdir(None, Some(&mut opts))
            .map_err(|e| AppError::Git(e.to_string()))?
    };

    if diff.deltas().len() == 0 {
        return Ok(None);
    }

    let delta = diff
        .deltas()
        .next()
        .expect("pathspec filtered to one delta");
    let path = delta
        .new_file()
        .path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| file_path.to_string());
    let old_path = delta
        .old_file()
        .path()
        .map(|p| p.to_string_lossy().to_string())
        .filter(|p| p != &path);
    let is_binary = delta.flags().contains(git2::DiffFlags::BINARY);
    let is_new_file = delta.status() == git2::Delta::Added;

    if is_binary {
        return Ok(Some(FileDiff {
            path,
            old_path,
            is_binary: true,
            is_new_file,
            hunks: vec![],
        }));
    }

    // Use a Patch per file for structured hunk/line access.
    let patch = git2::Patch::from_diff(&diff, 0).map_err(|e| AppError::Git(e.to_string()))?;

    let Some(patch) = patch else {
        return Ok(None);
    };

    let num_hunks = patch.num_hunks();
    let mut hunks = Vec::with_capacity(num_hunks);

    for hunk_idx in 0..num_hunks {
        let (hunk, _) = patch
            .hunk(hunk_idx)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let header = std::str::from_utf8(hunk.header())
            .unwrap_or("")
            .trim_end()
            .to_string();

        let num_lines = patch
            .num_lines_in_hunk(hunk_idx)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let mut lines = Vec::with_capacity(num_lines);

        for line_idx in 0..num_lines {
            let line = patch
                .line_in_hunk(hunk_idx, line_idx)
                .map_err(|e| AppError::Git(e.to_string()))?;

            let kind = match line.origin() {
                '+' => DiffLineKind::Added,
                '-' => DiffLineKind::Removed,
                ' ' => DiffLineKind::Context,
                _ => continue, // Skip EOF markers and metadata markers.
            };

            let content = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end_matches('\n')
                .trim_end_matches('\r')
                .to_string();

            lines.push(DiffLine {
                kind,
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
                content,
            });
        }

        hunks.push(DiffHunk {
            header,
            old_start: hunk.old_start(),
            old_lines: hunk.old_lines(),
            new_start: hunk.new_start(),
            new_lines: hunk.new_lines(),
            lines,
        });
    }

    Ok(Some(FileDiff {
        path,
        old_path,
        is_binary: false,
        is_new_file,
        hunks,
    }))
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
            .expect("write initial file");
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
    fn test_unstaged_diff_for_modified_file() {
        let dir = init_repo_with_commit();
        std::fs::write(
            dir.path().join("README.md"),
            "line 1\nline 2 modified\nline 3\n",
        )
        .expect("modify file");

        let result = get_file_diff(dir.path(), "README.md", false).expect("get unstaged diff");
        assert!(result.is_some());
        let diff = result.expect("diff should exist");
        assert!(!diff.is_binary);
        assert!(!diff.is_new_file);
        assert!(!diff.hunks.is_empty());
        // Should have at least one removed and one added line.
        let all_lines: Vec<_> = diff.hunks.iter().flat_map(|h| h.lines.iter()).collect();
        assert!(all_lines.iter().any(|l| l.kind == DiffLineKind::Removed));
        assert!(all_lines.iter().any(|l| l.kind == DiffLineKind::Added));
    }

    #[test]
    fn test_staged_diff_for_staged_file() {
        let dir = init_repo_with_commit();
        std::fs::write(
            dir.path().join("README.md"),
            "line 1\nline 2 staged\nline 3\n",
        )
        .expect("modify file");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");

        let result = get_file_diff(dir.path(), "README.md", true).expect("get staged diff");
        assert!(result.is_some());
        let diff = result.expect("diff should exist");
        assert!(!diff.hunks.is_empty());
    }

    #[test]
    fn test_no_diff_for_unmodified_file() {
        let dir = init_repo_with_commit();
        let result = get_file_diff(dir.path(), "README.md", false).expect("get diff");
        assert!(result.is_none());
    }

    #[test]
    fn test_diff_for_new_staged_file() {
        let dir = init_repo_with_commit();
        std::fs::write(dir.path().join("new.ts"), "export const x = 1;\n").expect("write new file");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");

        let result = get_file_diff(dir.path(), "new.ts", true).expect("get staged diff");
        assert!(result.is_some());
        let diff = result.expect("diff should exist");
        assert!(diff.is_new_file);
        let all_lines: Vec<_> = diff.hunks.iter().flat_map(|h| h.lines.iter()).collect();
        assert!(all_lines.iter().all(|l| l.kind == DiffLineKind::Added));
    }

    #[test]
    fn test_hunk_header_format() {
        let dir = init_repo_with_commit();
        std::fs::write(
            dir.path().join("README.md"),
            "line 1\nline 2 changed\nline 3\n",
        )
        .expect("modify file");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");

        let diff = get_file_diff(dir.path(), "README.md", true)
            .expect("get staged diff")
            .expect("diff should exist");
        assert!(!diff.hunks.is_empty());
        let header = &diff.hunks[0].header;
        assert!(
            header.starts_with("@@"),
            "header should start with @@, got: {header}"
        );
    }

    #[test]
    fn test_line_numbers_populated() {
        let dir = init_repo_with_commit();
        std::fs::write(
            dir.path().join("README.md"),
            "line 1\nNEW LINE\nline 2\nline 3\n",
        )
        .expect("modify file");
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .expect("git add");

        let diff = get_file_diff(dir.path(), "README.md", true)
            .expect("get staged diff")
            .expect("diff should exist");
        let all_lines: Vec<_> = diff.hunks.iter().flat_map(|h| h.lines.iter()).collect();
        // Context lines should have both old and new line numbers.
        for line in all_lines.iter().filter(|l| l.kind == DiffLineKind::Context) {
            assert!(line.old_lineno.is_some(), "context line missing old_lineno");
            assert!(line.new_lineno.is_some(), "context line missing new_lineno");
        }
    }
}
