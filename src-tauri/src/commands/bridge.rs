//! IPC commands for controlling CLI processes via SessionBridgeMap.
//!
//! Each command is thin: validate input -> call SessionBridgeMap -> return result.
//! Per GUIDE-001 §2.3 and SPEC-004 §4.1.

use crate::bridge::event_loop;
use crate::bridge::manager::SessionBridgeMap;
use crate::bridge::process::{BridgeConfig, ProcessStatus};
use crate::bridge::CliLocation;
use crate::AppError;
use tauri::State;

/// Start a CLI process for a session. Idempotent — if already running, returns Ok.
#[tauri::command]
pub async fn start_session_cli(
    app: tauri::AppHandle,
    bridge_map: State<'_, SessionBridgeMap>,
    cli: State<'_, CliLocation>,
    session_id: String,
    project_path: String,
    model: String,
) -> Result<(), AppError> {
    // If already has a bridge, skip
    if bridge_map.has(&session_id).await {
        return Ok(());
    }

    let cli_path = cli.binary_path()?.to_string();

    let config = BridgeConfig {
        cli_path,
        model: Some(model),
        output_format: "stream-json".to_string(),
        working_dir: Some(project_path),
        extra_args: vec!["--verbose".to_string()],
        ..BridgeConfig::default()
    };

    bridge_map.spawn_for_session(&session_id, config).await?;

    // Start the event loop for this session
    if let Some(bridge) = bridge_map.get(&session_id).await {
        event_loop::spawn_event_loop(app.clone(), session_id, bridge);
    }

    Ok(())
}

/// Send a message to the CLI process for a session.
#[tauri::command]
pub async fn send_to_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
    message: String,
) -> Result<(), AppError> {
    let bridge = bridge_map
        .get(&session_id)
        .await
        .ok_or_else(|| AppError::Bridge(format!("No CLI process for session {}", session_id)))?;

    bridge.send(&format!("{}\n", message)).await
}

/// Stop the CLI process for a session.
#[tauri::command]
pub async fn stop_session_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<(), AppError> {
    bridge_map.remove(&session_id).await
}

/// Get the CLI process status for a session.
#[tauri::command]
pub async fn get_cli_status(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<ProcessStatus, AppError> {
    match bridge_map.get(&session_id).await {
        Some(bridge) => Ok(bridge.status().await),
        None => Ok(ProcessStatus::NotStarted),
    }
}
