//! IPC commands for Git operations (CHI-311 Phase 4).
//! Thin handlers: resolve project path from DB, delegate to `git::*` modules.

use crate::db::{queries, Database};
use crate::git::repository;
use crate::AppError;
use tauri::State;

/// Get repository info for a project's root directory.
/// Returns None if the project path is not inside a Git repository.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id))]
pub fn git_get_repo_info(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Option<repository::RepoInfo>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    repository::get_repo_info(project_root)
}
