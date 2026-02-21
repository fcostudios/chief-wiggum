// IPC commands for project/folder management.

use crate::db::{queries, Database};
use crate::AppError;
use tauri::State;

/// Open native folder picker and return the selected path.
#[tauri::command]
pub async fn pick_project_folder(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

/// Create a project from a folder path. Returns the project row.
#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    folder_path: String,
    name: Option<String>,
) -> Result<queries::ProjectRow, AppError> {
    let project_name = name.unwrap_or_else(|| {
        std::path::Path::new(&folder_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string())
    });

    let id = uuid::Uuid::new_v4().to_string();
    queries::insert_project(&db, &id, &project_name, &folder_path)?;
    queries::get_project(&db, &id)?
        .ok_or_else(|| AppError::Other(format!("Project {} not found after insert", id)))
}

/// List all projects.
#[tauri::command]
pub fn list_projects(db: State<'_, Database>) -> Result<Vec<queries::ProjectRow>, AppError> {
    queries::list_projects(&db)
}
