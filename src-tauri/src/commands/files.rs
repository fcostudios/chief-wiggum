//! IPC commands for file explorer (CHI-115).
//! Thin handlers: resolve project path from DB, delegate to `files::scanner`.

use crate::db::{queries, Database};
use crate::files::watcher::FileWatcherManager;
use crate::files::{scanner, FileContent, FileNode, FileSearchResult};
use crate::AppError;
use std::collections::HashMap;
use tauri::State;

/// Git file status (porcelain v1 format).
#[derive(Debug, Clone, serde::Serialize)]
pub struct GitFileStatus {
    pub status: String, // "modified", "untracked", "staged", "deleted", "renamed", "conflict"
}

/// List files/directories under a project path.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, relative_path = ?relative_path, max_depth = ?max_depth))]
pub fn list_project_files(
    db: State<'_, Database>,
    project_id: String,
    relative_path: Option<String>,
    max_depth: Option<usize>,
) -> Result<Vec<FileNode>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::list_files(project_root, relative_path.as_deref(), max_depth)
}

/// Read file content with optional line range.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, relative_path = %relative_path, start_line = ?start_line, end_line = ?end_line))]
pub fn read_project_file(
    db: State<'_, Database>,
    project_id: String,
    relative_path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<FileContent, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::read_file(project_root, &relative_path, start_line, end_line)
}

/// Search for files by name within a project.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, query_len = query.len(), max_results = ?max_results))]
pub fn search_project_files(
    db: State<'_, Database>,
    project_id: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<FileSearchResult>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::search_files(project_root, &query, max_results)
}

/// Estimate token count for a file (~chars/4).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, relative_path = %relative_path))]
pub fn get_file_token_estimate(
    db: State<'_, Database>,
    project_id: String,
    relative_path: String,
) -> Result<usize, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::estimate_tokens(project_root, &relative_path)
}

/// Get git status for all files in a project directory.
/// Runs `git status --porcelain=v1` and parses the output.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn get_git_file_statuses(
    db: State<'_, Database>,
    project_id: String,
) -> Result<HashMap<String, GitFileStatus>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);

    let output = std::process::Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(project_root)
        .output()
        .map_err(|e| AppError::Other(format!("Failed to run git status: {}", e)))?;

    if !output.status.success() {
        // Not a git repo or git not available — return empty map
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut statuses = HashMap::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let index_status = line.as_bytes()[0];
        let worktree_status = line.as_bytes()[1];
        let path = line[3..].to_string();

        // Handle renames: "R  old -> new"
        let file_path = if let Some(arrow_pos) = path.find(" -> ") {
            path[arrow_pos + 4..].to_string()
        } else {
            path
        }
        .replace('\\', "/");

        let status = match (index_status, worktree_status) {
            (b'?', b'?') => "untracked",
            (b'A', _) => "staged",
            (b'M', b' ') | (b'M', b'M') => "staged",
            (_, b'M') => "modified",
            (b'D', _) | (_, b'D') => "deleted",
            (b'R', _) => "renamed",
            (b'U', _) | (_, b'U') => "conflict",
            _ => "modified",
        };

        statuses.insert(
            file_path,
            GitFileStatus {
                status: status.to_string(),
            },
        );
    }

    Ok(statuses)
}

/// Open a project file in the system default app/editor.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, relative_path = %relative_path))]
pub fn open_project_file_in_system(
    db: State<'_, Database>,
    project_id: String,
    relative_path: String,
) -> Result<(), AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::open_file_in_system(project_root, &relative_path)
}

/// Start filesystem watcher for the given project.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(app, db, watcher_manager), fields(project_id = %project_id))]
pub fn start_project_file_watcher(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    watcher_manager: State<'_, FileWatcherManager>,
    project_id: String,
) -> Result<(), AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    watcher_manager.start_watching(app, project_id, std::path::PathBuf::from(project.path))
}

/// Stop filesystem watcher for the given project.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(watcher_manager), fields(project_id = %project_id))]
pub fn stop_project_file_watcher(
    watcher_manager: State<'_, FileWatcherManager>,
    project_id: String,
) -> Result<(), AppError> {
    watcher_manager.stop_watching(&project_id)
}
