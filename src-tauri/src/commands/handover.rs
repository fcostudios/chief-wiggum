//! IPC commands for session handover via `claude remote-control`.

use crate::bridge::CliLocation;
use crate::db::queries;
use crate::db::Database;
use crate::handover::reconcile::ReconcileResult;
use crate::handover::{HandoverMap, HandoverState};
use crate::{AppError, AppResult};
use tauri::{AppHandle, Emitter, State};

#[tauri::command(rename_all = "snake_case")]
pub async fn start_handover(
    session_id: String,
    db: State<'_, Database>,
    cli_location: State<'_, CliLocation>,
    handover_map: State<'_, HandoverMap>,
    app: AppHandle,
) -> AppResult<HandoverState> {
    if let Some(existing) = handover_map.get_state(&session_id).await {
        return Ok(existing);
    }

    let session = queries::get_session(&db, &session_id)?
        .ok_or_else(|| AppError::Validation(format!("Session not found: {}", session_id)))?;
    let cli_session_id = session.cli_session_id.clone().ok_or_else(|| {
        AppError::Validation(format!(
            "Session {} has no CLI session id; start the CLI first",
            session_id
        ))
    })?;
    let project = queries::get_project_for_session(&db, &session_id)?;
    let cwd = project.as_ref().map(|row| row.path.as_str());
    let jsonl_path = if let Some(path) = session.jsonl_path.as_deref() {
        Some(std::path::PathBuf::from(path))
    } else if let Some(project) = project.as_ref() {
        let path = crate::handover::compute_jsonl_path(&project.path, &cli_session_id);
        let path_str = path.to_string_lossy().to_string();
        queries::update_session_jsonl_path(&db, &session_id, &path_str)?;
        Some(path)
    } else {
        None
    };
    let existing_uuids = queries::get_message_jsonl_uuids(&db, &session_id)?;

    handover_map
        .start(
            cli_location.binary_path()?,
            session_id,
            cli_session_id,
            cwd,
            app,
            jsonl_path,
            existing_uuids,
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_handover(
    session_id: String,
    db: State<'_, Database>,
    handover_map: State<'_, HandoverMap>,
    app: AppHandle,
) -> AppResult<ReconcileResult> {
    handover_map.stop(&session_id).await?;
    let result = crate::handover::reconcile::reconcile_session(&db, &session_id)?;
    app.emit("session:reconciled", &result)
        .map_err(|e| AppError::Other(format!("Failed to emit session:reconciled: {}", e)))?;
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_handover_state(
    session_id: String,
    handover_map: State<'_, HandoverMap>,
) -> AppResult<Option<HandoverState>> {
    Ok(handover_map.get_state(&session_id).await)
}
