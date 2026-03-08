//! IPC commands for JSONL import diagnostics.

use crate::db::Database;
use crate::import::consistency::{
    check_session_consistency as run_consistency_check, ConsistencyReport,
};
use crate::AppError;
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
