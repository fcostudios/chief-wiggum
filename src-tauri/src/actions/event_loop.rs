//! Tokio task that reads ActionBridgeOutput and emits Tauri events.
//! Per CHI-140: one task per action bridge.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::bridge::{ActionBridge, ActionBridgeOutput};
use super::manager::ActionBridgeMap;

/// Payload for `action:output` events.
#[derive(Debug, Clone, Serialize)]
pub struct ActionOutputPayload {
    pub action_id: String,
    pub line: String,
    pub is_error: bool,
}

/// Payload for `action:completed` and `action:failed` events.
#[derive(Debug, Clone, Serialize)]
pub struct ActionExitPayload {
    pub action_id: String,
    pub exit_code: Option<i32>,
}

/// Spawn a tokio task to emit Tauri events from an action bridge.
pub fn spawn_action_event_loop(
    app: AppHandle,
    action_id: String,
    bridge: Arc<ActionBridge>,
    action_map: ActionBridgeMap,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match bridge.receive().await {
                Ok(Some(ActionBridgeOutput::Output(output))) => {
                    let payload = ActionOutputPayload {
                        action_id: action_id.clone(),
                        line: output.line,
                        is_error: output.is_error,
                    };
                    if let Err(e) = app.emit("action:output", &payload) {
                        tracing::warn!(
                            action_id = %action_id,
                            error = %e,
                            "Failed to emit action:output"
                        );
                    }
                }
                Ok(Some(ActionBridgeOutput::Exited { exit_code })) => {
                    let payload = ActionExitPayload {
                        action_id: action_id.clone(),
                        exit_code,
                    };
                    let event_name = match exit_code {
                        Some(0) | None => "action:completed",
                        _ => "action:failed",
                    };
                    if let Err(e) = app.emit(event_name, &payload) {
                        tracing::warn!(
                            action_id = %action_id,
                            error = %e,
                            event = %event_name,
                            "Failed to emit action exit event"
                        );
                    }

                    let _ = action_map.stop_action(&action_id).await;
                    break;
                }
                Ok(None) => {
                    let _ = action_map.stop_action(&action_id).await;
                    break;
                }
                Err(e) => {
                    tracing::error!(
                        action_id = %action_id,
                        error = %e,
                        "Error reading action output"
                    );
                    let _ = action_map.stop_action(&action_id).await;
                    break;
                }
            }
        }

        tracing::debug!(action_id = %action_id, "Action event loop exited");
    })
}
