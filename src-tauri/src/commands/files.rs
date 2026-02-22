//! IPC commands for file explorer (CHI-115).
//! Thin handlers: resolve project path from DB, delegate to `files::scanner`.

use crate::db::{queries, Database};
use crate::files::{scanner, FileContent, FileNode, FileSearchResult};
use crate::AppError;
use tauri::State;

/// List files/directories under a project path.
#[tauri::command(rename_all = "snake_case")]
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
