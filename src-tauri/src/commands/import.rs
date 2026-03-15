//! IPC commands for JSONL import diagnostics.

use crate::db::queries::list_all_cli_session_ids;
use crate::db::Database;
use crate::import::consistency::{
    check_session_consistency as run_consistency_check, ConsistencyReport,
};
use crate::import::discover::{mark_already_imported, scan_projects_dir, DiscoveredSession};
use crate::import::engine::{import_session_file, ImportOutcome, ImportResult};
use crate::import::review::{inspect_selected_files, ImportReviewItem};
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

#[tauri::command(rename_all = "snake_case")]
pub fn inspect_importable_files(
    file_paths: Vec<String>,
) -> Result<Vec<ImportReviewItem>, AppError> {
    if file_paths.is_empty() {
        return Err(AppError::Validation(
            "file_paths cannot be empty".to_string(),
        ));
    }
    if file_paths.iter().any(|path| path.trim().is_empty()) {
        return Err(AppError::Validation(
            "file_paths cannot contain empty values".to_string(),
        ));
    }
    Ok(inspect_selected_files(&file_paths))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_temp_jsonl(root: &TempDir, name: &str, content: &str) -> String {
        let path = root.path().join(name);
        fs::write(&path, content).expect("write temp jsonl");
        path.to_string_lossy().to_string()
    }

    #[test]
    fn inspect_importable_files_rejects_empty_lists() {
        let error = inspect_importable_files(Vec::new()).expect_err("empty file list should fail");
        assert!(matches!(error, AppError::Validation(_)));
    }

    #[test]
    fn inspect_importable_files_marks_invalid_and_valid_rows() {
        let root = TempDir::new().expect("temp dir");
        let valid = write_temp_jsonl(
            &root,
            "valid.jsonl",
            "{\"type\":\"system\",\"subtype\":\"init\",\"sessionId\":\"valid-1\"}\n",
        );
        let invalid = write_temp_jsonl(&root, "invalid.jsonl", "{ nope }\n");

        let items =
            inspect_importable_files(vec![valid, invalid]).expect("inspection should succeed");

        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|item| item.is_valid_jsonl));
        assert!(items.iter().any(|item| !item.is_valid_jsonl));
        assert!(items.iter().all(|item| item.source == "picked"));
    }
}
