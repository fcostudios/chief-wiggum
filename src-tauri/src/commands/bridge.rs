//! IPC commands for controlling CLI processes via SessionBridgeMap.
//!
//! Each command is thin: validate input -> call SessionBridgeMap -> return result.
//! Per GUIDE-001 §2.3 and SPEC-004 §4.1.

use crate::bridge::event_loop;
use crate::bridge::manager::SessionBridgeMap;
use crate::bridge::permission::{PermissionAction, PermissionManager, PermissionResponse};
use crate::bridge::process::{BridgeConfig, ProcessStatus};
use crate::bridge::CliLocation;
use crate::AppError;
use tauri::State;

/// Start a CLI process for a session. Idempotent — if already running, returns Ok.
#[tauri::command(rename_all = "snake_case")]
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
#[tauri::command(rename_all = "snake_case")]
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
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_session_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<(), AppError> {
    bridge_map.remove(&session_id).await
}

/// Get the CLI process status for a session.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_cli_status(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<ProcessStatus, AppError> {
    match bridge_map.get(&session_id).await {
        Some(bridge) => Ok(bridge.status().await),
        None => Ok(ProcessStatus::NotStarted),
    }
}

/// Resolve a pending permission request with the user's action.
///
/// Called by the frontend when the user clicks Approve/Deny/Always Allow
/// in the PermissionDialog (SPEC-004 §5.2).
#[tauri::command(rename_all = "snake_case")]
pub async fn respond_permission(
    permission_manager: State<'_, PermissionManager>,
    request_id: String,
    action: String,
    pattern: Option<String>,
) -> Result<(), AppError> {
    let action = match action.as_str() {
        "Approve" => PermissionAction::Approve,
        "Deny" => PermissionAction::Deny,
        "AlwaysAllow" => PermissionAction::AlwaysAllow,
        other => {
            return Err(AppError::Validation(format!(
                "Invalid permission action: {}",
                other
            )))
        }
    };

    let response = PermissionResponse {
        request_id,
        action,
        pattern,
    };

    permission_manager.resolve_permission(response).await
}

/// Toggle YOLO mode for the permission system.
///
/// When enabled, all permission requests are auto-approved without user interaction.
/// See SPEC-001 §7.1 for YOLO mode safety rails.
#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_yolo_mode(
    permission_manager: State<'_, PermissionManager>,
    enable: bool,
) -> Result<(), AppError> {
    if enable {
        permission_manager.enable_yolo_mode().await;
    } else {
        permission_manager.disable_yolo_mode().await;
    }
    Ok(())
}
