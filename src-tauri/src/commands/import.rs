//! IPC commands for JSONL import diagnostics.

use crate::db::queries::list_all_cli_session_ids;
use crate::db::Database;
use crate::import::consistency::{
    check_session_consistency as run_consistency_check, ConsistencyReport,
};
use crate::import::discover::{mark_already_imported, scan_projects_dir, DiscoveredSession};
use crate::import::engine::{import_session_file, ImportOutcome, ImportResult};
use crate::AppError;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub fn check_session_consistency(
    db: State<'_, Database>,
    session_id: String,
    jsonl_path: String,
) -> Result<ConsistencyReport, AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Session ID cannot be empty".to_string(),
        ));
    }
    if jsonl_path.trim().is_empty() {
        return Err(AppError::Validation(
            "JSONL path cannot be empty".to_string(),
        ));
    }

    let path = PathBuf::from(&jsonl_path);
    run_consistency_check(&db, &session_id, &path)
}

/// Scan `~/.claude/projects/` and return importable JSONL session files.
#[tauri::command(rename_all = "snake_case")]
pub fn discover_importable_sessions(
    db: State<'_, Database>,
) -> Result<Vec<DiscoveredSession>, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Could not determine home directory".to_string()))?;
    let projects_dir = home.join(".claude").join("projects");
    let mut discovered = scan_projects_dir(&projects_dir)?;
    let known_ids: HashSet<String> = list_all_cli_session_ids(&db)?.into_iter().collect();
    mark_already_imported(&mut discovered, &known_ids);
    Ok(discovered)
}

/// Import a single JSONL file into the selected project.
#[tauri::command(rename_all = "snake_case")]
pub fn import_jsonl_file(
    db: State<'_, Database>,
    file_path: String,
    project_id: String,
) -> Result<ImportResult, AppError> {
    if file_path.trim().is_empty() {
        return Err(AppError::Validation(
            "file_path cannot be empty".to_string(),
        ));
    }
    if project_id.trim().is_empty() {
        return Err(AppError::Validation(
            "project_id cannot be empty".to_string(),
        ));
    }
    let path = PathBuf::from(file_path);
    import_session_file(&db, &path, &project_id)
}

/// Import many JSONL files in a batch.
/// Per-file failures are included as warning entries while the batch continues.
#[tauri::command(rename_all = "snake_case")]
pub fn import_jsonl_batch(
    db: State<'_, Database>,
    file_paths: Vec<String>,
    project_id: String,
) -> Result<Vec<ImportResult>, AppError> {
    if project_id.trim().is_empty() {
        return Err(AppError::Validation(
            "project_id cannot be empty".to_string(),
        ));
    }

    let mut results = Vec::with_capacity(file_paths.len());
    for file_path in &file_paths {
        let path = PathBuf::from(file_path);
        match import_session_file(&db, &path, &project_id) {
            Ok(result) => results.push(result),
            Err(err) => results.push(ImportResult {
                session_id: String::new(),
                cli_session_id: None,
                outcome: ImportOutcome::Skipped,
                messages_imported: 0,
                messages_skipped: 0,
                warnings: vec![format!("Error importing {}: {}", file_path, err)],
            }),
        }
    }
    Ok(results)
}
