//! IPC commands for session handover via `claude remote-control`.

use crate::bridge::CliLocation;
use crate::db::queries;
use crate::db::Database;
use crate::handover::{HandoverMap, HandoverState};
use crate::{AppError, AppResult};
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub async fn start_handover(
    session_id: String,
    db: State<'_, Database>,
    cli_location: State<'_, CliLocation>,
    handover_map: State<'_, HandoverMap>,
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

    handover_map
        .start(cli_location.binary_path()?, session_id, cli_session_id, cwd)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_handover(
    session_id: String,
    handover_map: State<'_, HandoverMap>,
) -> AppResult<()> {
    handover_map.stop(&session_id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_handover_state(
    session_id: String,
    handover_map: State<'_, HandoverMap>,
) -> AppResult<Option<HandoverState>> {
    Ok(handover_map.get_state(&session_id).await)
}
