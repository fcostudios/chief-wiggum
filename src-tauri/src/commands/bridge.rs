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

/// Send a message by spawning a CLI process with `-p "prompt"`.
///
/// Each message spawns a new process. Follow-up messages use `--continue`
/// to resume the conversation. The Claude Code CLI does not accept prompts
/// via stdin in `--output-format stream-json` mode — it requires `-p`.
#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn send_to_cli(
    app: tauri::AppHandle,
    bridge_map: State<'_, SessionBridgeMap>,
    cli: State<'_, CliLocation>,
    session_id: String,
    project_path: String,
    model: String,
    message: String,
    is_follow_up: bool,
) -> Result<(), AppError> {
    // Stop any existing bridge for this session (previous message's process)
    if bridge_map.has(&session_id).await {
        bridge_map.remove(&session_id).await?;
    }

    let cli_path = cli.binary_path()?.to_string();

    let mut extra_args = vec![
        "--verbose".to_string(),
        "-p".to_string(),
        message,
    ];

    // Continue the conversation for follow-up messages
    if is_follow_up {
        extra_args.push("--continue".to_string());
    }

    let config = BridgeConfig {
        cli_path,
        model: Some(model),
        output_format: "stream-json".to_string(),
        working_dir: Some(project_path),
        extra_args,
        ..BridgeConfig::default()
    };

    bridge_map.spawn_for_session(&session_id, config).await?;

    // Start the event loop for this session
    if let Some(bridge) = bridge_map.get(&session_id).await {
        event_loop::spawn_event_loop(app.clone(), session_id, bridge);
    }

    Ok(())
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
