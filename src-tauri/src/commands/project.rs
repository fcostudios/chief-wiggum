// IPC commands for project/folder management.

use crate::db::{queries, Database};
use crate::paths::normalize_project_path;
use crate::AppError;
use tauri::State;

/// Open native folder picker and return the selected path.
#[tauri::command(rename_all = "snake_case")]
pub async fn pick_project_folder(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| {
        normalize_project_path(&p.to_string())
            .to_string_lossy()
            .to_string()
    }))
}

/// Create a project from a folder path. Returns the project row.
#[tauri::command(rename_all = "snake_case")]
pub fn create_project(
    db: State<'_, Database>,
    folder_path: String,
    name: Option<String>,
) -> Result<queries::ProjectRow, AppError> {
    let normalized_folder_path = normalize_project_path(&folder_path);
    let normalized_folder_path = normalized_folder_path.to_string_lossy().to_string();
    let project_name = name.unwrap_or_else(|| {
        std::path::Path::new(&normalized_folder_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string())
    });

    let id = uuid::Uuid::new_v4().to_string();
    queries::insert_project(&db, &id, &project_name, &normalized_folder_path)?;
    queries::get_project(&db, &id)?
        .ok_or_else(|| AppError::Other(format!("Project {} not found after insert", id)))
}

/// List all projects.
#[tauri::command(rename_all = "snake_case")]
pub fn list_projects(db: State<'_, Database>) -> Result<Vec<queries::ProjectRow>, AppError> {
    let mut projects = queries::list_projects(&db)?;
    for project in &mut projects {
        project.path = normalize_project_path(&project.path)
            .to_string_lossy()
            .to_string();
    }
    Ok(projects)
}

/// Read CLAUDE.md from a project's folder path (CHI-42).
/// Returns the file content or None if not found.
#[tauri::command(rename_all = "snake_case")]
pub fn read_claude_md(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Option<String>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project {} not found", project_id)))?;
    let project_root = normalize_project_path(&project.path);
    let claude_md_path = project_root.join("CLAUDE.md");

    match std::fs::read_to_string(&claude_md_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Other(format!("Failed to read CLAUDE.md: {}", e))),
    }
}
