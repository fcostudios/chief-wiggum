//! IPC commands for Git operations (CHI-311 Phase 4).
//! Thin handlers: resolve project path from DB, delegate to `git::*` modules.

use crate::bridge::CliLocation;
use crate::db::{queries, Database};
use crate::git::branches::{self, BranchInfo};
use crate::git::commit;
use crate::git::diff::{self, DiffLineKind, FileDiff};
use crate::git::discard::{self, DiscardResult};
use crate::git::log::{self, CommitEntry};
use crate::git::remote;
use crate::git::repository;
use crate::git::staging;
use crate::git::stash::{self, StashEntry};
use crate::git::status::{self, FileStatusEntry};
use crate::paths::normalize_project_path;
use crate::AppError;
use std::path::PathBuf;
use tauri::{Emitter, State};

fn get_project_root(db: &Database, project_id: &str) -> Result<PathBuf, AppError> {
    let project = queries::get_project(db, project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    Ok(normalize_project_path(&project.path))
}

fn build_commit_prompt(staged_diff: &str) -> String {
    let truncated = if staged_diff.len() > 8000 {
        format!("{}...[truncated]", &staged_diff[..8000])
    } else {
        staged_diff.to_string()
    };

    format!(
        "Write a git commit message for the following staged diff.\n\
Rules:\n\
- First line: imperative mood, under 72 chars\n\
- Optionally: blank line, then a brief body (1-3 sentences)\n\
- No code blocks, no quotes, no backticks around the message\n\
- Respond with ONLY the commit message text\n\n\
Staged diff:\n{}",
        truncated
    )
}

/// Get repository info for a project's root directory.
/// Returns None if the project path is not inside a Git repository.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_get_repo_info(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Option<repository::RepoInfo>, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    repository::get_repo_info(&project_root)
}

/// Get full working-tree status for a project's Git repository.
/// Returns staged, modified, and untracked file entries.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_get_status(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<FileStatusEntry>, AppError> {
    let repo_root = get_project_root(&db, &project_id)?;

    // If not a git repo, return empty list gracefully.
    if git2::Repository::discover(&repo_root).is_err() {
        return Ok(vec![]);
    }

    status::get_status(&repo_root)
}

/// List all branches for a project's Git repository.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_list_branches(
    db: State<'_, Database>,
    project_id: String,
    include_remote: Option<bool>,
) -> Result<Vec<BranchInfo>, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    if git2::Repository::discover(&project_root).is_err() {
        return Ok(vec![]);
    }
    branches::list_branches(&project_root, include_remote.unwrap_or(false))
}

/// Switch to an existing local branch.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, branch_name = %branch_name))]
pub fn git_switch_branch(
    db: State<'_, Database>,
    project_id: String,
    branch_name: String,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    branches::switch_branch(&project_root, &branch_name)
}

/// Create a new local branch from current HEAD.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, branch_name = %branch_name))]
pub fn git_create_branch(
    db: State<'_, Database>,
    project_id: String,
    branch_name: String,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    branches::create_branch(&project_root, &branch_name)
}

/// Delete a local branch (refuses if it is the current branch).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, branch_name = %branch_name))]
pub fn git_delete_branch(
    db: State<'_, Database>,
    project_id: String,
    branch_name: String,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    branches::delete_branch(&project_root, &branch_name)
}

/// Get the unified diff for a single file in a project's Git repository.
///
/// `staged = true` returns the staged diff (index vs HEAD).
/// `staged = false` returns the unstaged diff (worktree vs index).
/// Returns null if the file has no diff.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, file_path = %file_path, staged = %staged))]
pub fn git_get_file_diff(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
    staged: bool,
) -> Result<Option<FileDiff>, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    diff::get_file_diff(&project_root, &file_path, staged)
}

/// Stage an entire file (move to index).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, file_path = %file_path))]
pub fn git_stage_file(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    staging::stage_file(&project_root, &file_path)
}

/// Unstage an entire file (reset index to HEAD).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, file_path = %file_path))]
pub fn git_unstage_file(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    staging::unstage_file(&project_root, &file_path)
}

/// Stage a single hunk (0-based index) of a file's unstaged diff.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, file_path = %file_path, hunk_index = %hunk_index))]
pub fn git_stage_hunk(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
    hunk_index: usize,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    staging::stage_hunk(&project_root, &file_path, hunk_index)
}

/// Unstage a single hunk (0-based index) of a file's staged diff.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, file_path = %file_path, hunk_index = %hunk_index))]
pub fn git_unstage_hunk(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
    hunk_index: usize,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    staging::unstage_hunk(&project_root, &file_path, hunk_index)
}

/// Create a new commit from the current index.
/// Returns the short SHA (7 chars) of the new commit.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_create_commit(
    db: State<'_, Database>,
    project_id: String,
    message: String,
) -> Result<String, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    commit::create_commit(&project_root, &message)
}

/// Amend the last commit with a new message and current index.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_amend_commit(
    db: State<'_, Database>,
    project_id: String,
    message: String,
) -> Result<String, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    commit::amend_commit(&project_root, &message)
}

/// Get the message of the last commit (for amend pre-fill).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_get_last_commit_message(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Option<String>, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    commit::get_last_commit_message(&project_root)
}

/// List commits reachable from HEAD, with skip/limit pagination.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, skip = %skip, limit = %limit))]
pub fn git_list_commits(
    db: State<'_, Database>,
    project_id: String,
    skip: usize,
    limit: usize,
) -> Result<Vec<CommitEntry>, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    if git2::Repository::discover(&project_root).is_err() {
        return Ok(vec![]);
    }
    log::list_commits(&project_root, skip, limit)
}

/// Fetch updates from the remote and emit progress events.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(app, db), fields(project_id = %project_id))]
pub async fn git_fetch(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    project_id: String,
) -> Result<(), AppError> {
    let path = get_project_root(&db, &project_id)?;
    let app_handle = app.clone();

    tokio::task::spawn_blocking(move || {
        remote::fetch(&path, "origin", move |payload| {
            let _ = app_handle.emit("git:progress", &payload);
        })
    })
    .await
    .map_err(|e| AppError::Other(format!("git_fetch task failed: {}", e)))?
}

/// Pull updates from the remote and emit progress events.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(app, db), fields(project_id = %project_id))]
pub async fn git_pull(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    project_id: String,
) -> Result<remote::PullResult, AppError> {
    let path = get_project_root(&db, &project_id)?;
    let app_handle = app.clone();

    tokio::task::spawn_blocking(move || {
        remote::pull(&path, "origin", move |payload| {
            let _ = app_handle.emit("git:progress", &payload);
        })
    })
    .await
    .map_err(|e| AppError::Other(format!("git_pull task failed: {}", e)))?
}

/// Push local commits to remote and emit progress events.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(app, db), fields(project_id = %project_id))]
pub async fn git_push(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    project_id: String,
) -> Result<(), AppError> {
    let path = get_project_root(&db, &project_id)?;
    let app_handle = app.clone();

    tokio::task::spawn_blocking(move || {
        remote::push(&path, "origin", move |payload| {
            let _ = app_handle.emit("git:progress", &payload);
        })
    })
    .await
    .map_err(|e| AppError::Other(format!("git_push task failed: {}", e)))?
}

/// Discard all changes to a file, returning old content for soft undo.
/// Modified/deleted tracked files are restored to HEAD, and untracked files are deleted.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, file_path = %file_path))]
pub fn git_discard_file(
    db: State<'_, Database>,
    project_id: String,
    file_path: String,
) -> Result<DiscardResult, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    discard::discard_file(&project_root, &file_path)
}

/// List all stash entries for a project's repository.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_list_stashes(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<StashEntry>, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    if git2::Repository::discover(&project_root).is_err() {
        return Ok(vec![]);
    }
    stash::list_stashes(&project_root)
}

/// Push a stash with optional message.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, include_untracked = %include_untracked))]
pub fn git_push_stash(
    db: State<'_, Database>,
    project_id: String,
    message: String,
    include_untracked: bool,
) -> Result<String, AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    stash::push_stash(&project_root, &message, include_untracked)
}

/// Apply a stash by index (does not drop it).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, index = %index))]
pub fn git_apply_stash(
    db: State<'_, Database>,
    project_id: String,
    index: usize,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    stash::apply_stash(&project_root, index)
}

/// Pop a stash by index (apply + drop).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, index = %index))]
pub fn git_pop_stash(
    db: State<'_, Database>,
    project_id: String,
    index: usize,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    stash::pop_stash(&project_root, index)
}

/// Drop a stash entry by index (discard permanently).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, index = %index))]
pub fn git_drop_stash(
    db: State<'_, Database>,
    project_id: String,
    index: usize,
) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    stash::drop_stash(&project_root, index)
}

/// Abort an in-progress merge by cleaning up merge state and restoring HEAD.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_abort_merge(db: State<'_, Database>, project_id: String) -> Result<(), AppError> {
    let project_root = get_project_root(&db, &project_id)?;
    let repo = git2::Repository::open(&project_root).map_err(|e| AppError::Git(e.to_string()))?;

    repo.cleanup_state()
        .map_err(|e| AppError::Git(format!("Abort merge failed: {}", e)))?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout
        .force()
        .allow_conflicts(true)
        .conflict_style_merge(false);
    repo.checkout_head(Some(&mut checkout))
        .map_err(|e| AppError::Git(format!("Checkout after abort failed: {}", e)))?;

    Ok(())
}

/// Generate a commit message for the current staged changes using the Claude CLI.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db, cli_location), fields(project_id = %project_id))]
pub async fn git_generate_commit_message(
    db: State<'_, Database>,
    cli_location: State<'_, CliLocation>,
    project_id: String,
) -> Result<String, AppError> {
    let cli_path = cli_location
        .resolved_path
        .as_deref()
        .ok_or_else(|| AppError::Other("Claude CLI not detected".to_string()))?
        .to_string();

    let project_root = get_project_root(&db, &project_id)?;
    let status_entries = status::get_status(&project_root)?;
    let staged_paths: Vec<String> = status_entries
        .iter()
        .filter(|entry| entry.is_staged)
        .map(|entry| entry.path.clone())
        .collect();

    if staged_paths.is_empty() {
        return Err(AppError::Other(
            "No staged changes to generate message for".to_string(),
        ));
    }

    let mut full_diff = String::new();
    for path in &staged_paths {
        if let Ok(Some(file_diff)) = diff::get_file_diff(&project_root, path, true) {
            for hunk in &file_diff.hunks {
                full_diff.push_str(&format!("--- {}\n+++ {}\n{}\n", path, path, hunk.header));
                for line in &hunk.lines {
                    let prefix = match line.kind {
                        DiffLineKind::Added => '+',
                        DiffLineKind::Removed => '-',
                        DiffLineKind::Context => ' ',
                    };
                    full_diff.push_str(&format!("{}{}\n", prefix, line.content));
                }
            }
        }
    }

    if full_diff.is_empty() {
        return Err(AppError::Other("Could not read staged diff".to_string()));
    }

    let prompt = build_commit_prompt(&full_diff);
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new(&cli_path)
            .arg("-p")
            .arg(&prompt)
            .arg("--output-format")
            .arg("text")
            .arg("--no-cache")
            .output()
    })
    .await
    .map_err(|e| AppError::Other(format!("Spawn failed: {}", e)))?
    .map_err(|e| AppError::Other(format!("CLI failed to start: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.lines().next().unwrap_or("unknown");
        return Err(AppError::Other(format!("CLI error: {}", message)));
    }

    let message = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if message.is_empty() {
        return Err(AppError::Other("CLI returned empty message".to_string()));
    }

    Ok(message)
}

#[cfg(test)]
mod git_generate_tests {
    use super::build_commit_prompt;

    #[test]
    fn test_build_commit_prompt_contains_diff() {
        let diff = "diff --git a/foo.ts b/foo.ts\n+new line";
        let prompt = build_commit_prompt(diff);
        assert!(
            prompt.contains("foo.ts") || prompt.contains("diff"),
            "Prompt should include diff"
        );
    }
}
