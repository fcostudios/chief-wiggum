//! IPC commands for Project Actions.
//! Per GUIDE-001 §2.3: thin validate -> call -> format.

use std::path::PathBuf;

use crate::actions::bridge::ActionBridgeConfig;
use crate::actions::event_loop;
use crate::actions::manager::{ActionBridgeMap, RunningActionInfo};
use crate::actions::scanner;
use crate::actions::ActionDefinition;
use crate::AppError;

/// Discover all runnable actions in a project directory.
#[tauri::command(rename_all = "snake_case")]
pub async fn discover_actions(project_path: String) -> Result<Vec<ActionDefinition>, AppError> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }

    let actions = tokio::task::spawn_blocking(move || scanner::discover_actions(&path))
        .await
        .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(actions)
}

/// Start an action process.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
    command: String,
    working_dir: String,
) -> Result<(), AppError> {
    if command.trim().is_empty() {
        return Err(AppError::Validation(
            "Action command cannot be empty".to_string(),
        ));
    }

    let config = ActionBridgeConfig {
        command,
        working_dir,
        ..Default::default()
    };

    let bridge = action_map.spawn_action(&action_id, config).await?;
    event_loop::spawn_action_event_loop(app, action_id, bridge, action_map.inner().clone());

    Ok(())
}

/// Stop a running action.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_action(
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
) -> Result<(), AppError> {
    action_map.stop_action(&action_id).await
}

/// Restart an action (stop + start).
#[tauri::command(rename_all = "snake_case")]
pub async fn restart_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
    command: String,
    working_dir: String,
) -> Result<(), AppError> {
    let _ = action_map.stop_action(&action_id).await;
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let config = ActionBridgeConfig {
        command,
        working_dir,
        ..Default::default()
    };

    let bridge = action_map.spawn_action(&action_id, config).await?;
    event_loop::spawn_action_event_loop(app, action_id, bridge, action_map.inner().clone());

    Ok(())
}

/// List all running actions.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_running_actions(
    action_map: tauri::State<'_, ActionBridgeMap>,
) -> Result<Vec<RunningActionInfo>, AppError> {
    Ok(action_map.list_running().await)
}
