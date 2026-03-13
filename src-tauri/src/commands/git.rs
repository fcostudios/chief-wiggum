//! IPC commands for Git operations (CHI-311 Phase 4).
//! Thin handlers: resolve project path from DB, delegate to `git::*` modules.

use crate::db::{queries, Database};
use crate::git::branches::{self, BranchInfo};
use crate::git::commit;
use crate::git::diff::{self, FileDiff};
use crate::git::discard::{self, DiscardResult};
use crate::git::log::{self, CommitEntry};
use crate::git::remote;
use crate::git::repository;
use crate::git::staging;
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
