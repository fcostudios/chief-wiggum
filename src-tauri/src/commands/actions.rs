//! IPC commands for Project Actions.
//! Per GUIDE-001 §2.3: thin validate -> call -> format.

use std::path::PathBuf;

use crate::actions::scanner;
use crate::actions::ActionDefinition;
use crate::AppError;

/// Discover all runnable actions in a project directory.
#[tauri::command(rename_all = "snake_case")]
pub async fn discover_actions(project_path: String) -> Result<Vec<ActionDefinition>, AppError> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }

    let actions = tokio::task::spawn_blocking(move || scanner::discover_actions(&path))
        .await
        .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(actions)
}
