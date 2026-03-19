//! Tokio task that reads ActionBridgeOutput and emits Tauri events.
//! Per CHI-140: one task per action bridge.

use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::bridge::{ActionBridge, ActionBridgeOutput};
use super::manager::ActionBridgeMap;
use super::{bridge::ActionStatus, ActionCategory};
use crate::db::{queries, Database};

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

/// Payload for `action:status_changed` events.
#[derive(Debug, Clone, Serialize)]
pub struct ActionStatusChangedPayload {
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub status: ActionStatus,
    pub elapsed_ms: u64,
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
                    action_map
                        .update_output_line(&action_id, &output.line, output.is_error)
                        .await;

                    if let Some(snapshot) = action_map.snapshot(&action_id).await {
                        let status_payload = ActionStatusChangedPayload {
                            action_id: action_id.clone(),
                            project_id: snapshot.project_id,
                            project_name: snapshot.project_name,
                            status: ActionStatus::Running,
                            elapsed_ms: snapshot.started_at.elapsed().as_millis() as u64,
                        };
                        if let Err(e) = app.emit("action:status_changed", &status_payload) {
                            tracing::warn!(
                                action_id = %action_id,
                                error = %e,
                                "Failed to emit action:status_changed"
                            );
                        }
                    }

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
                    let bridge_status = bridge.status().await;
                    let snapshot = action_map.snapshot(&action_id).await;
                    let ended_at =
                        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

                    if bridge_status != ActionStatus::Stopped {
                        if let Some(snapshot) = snapshot.clone() {
                            let output_preview = if snapshot.output_tail.is_empty() {
                                None
                            } else {
                                Some(snapshot.output_tail.join("\n"))
                            };
                            let duration_ms = snapshot.started_at.elapsed().as_millis() as i64;

                            let db_state = app.state::<Database>();
                            let write_started = Instant::now();
                            let history_result = queries::insert_action_history(
                                db_state.inner(),
                                &queries::ActionHistoryInsert {
                                    action_id: snapshot.action_id.clone(),
                                    project_id: snapshot.project_id.clone(),
                                    project_name: snapshot.project_name.clone(),
                                    action_name: snapshot.action_name.clone(),
                                    command: snapshot.command.clone(),
                                    category: action_category_as_str(&snapshot.category)
                                        .to_string(),
                                    started_at: snapshot.started_at_iso.clone(),
                                    ended_at: Some(ended_at.clone()),
                                    exit_code,
                                    duration_ms: Some(duration_ms),
                                    output_preview,
                                },
                            );

                            match history_result {
                                Ok(()) => {
                                    let elapsed = write_started.elapsed().as_millis() as u64;
                                    if elapsed > 100 {
                                        tracing::warn!(
                                            action_id = %action_id,
                                            elapsed_ms = elapsed,
                                            "Action history insert took longer than 100ms"
                                        );
                                    }
                                }
                                Err(e) => {
                                    tracing::error!(
                                        action_id = %action_id,
                                        error = %e,
                                        "Failed to write action history"
                                    );
                                }
                            }
                        }
                    }

                    let (project_id, project_name, elapsed_ms) = if let Some(snapshot) = snapshot {
                        (
                            snapshot.project_id,
                            snapshot.project_name,
                            snapshot.started_at.elapsed().as_millis() as u64,
                        )
                    } else {
                        ("unknown".to_string(), "Unknown Project".to_string(), 0)
                    };

                    let status = if bridge_status == ActionStatus::Stopped {
                        ActionStatus::Stopped
                    } else {
                        match exit_code {
                            Some(0) | None => ActionStatus::Completed,
                            _ => ActionStatus::Failed,
                        }
                    };
                    let status_payload = ActionStatusChangedPayload {
                        action_id: action_id.clone(),
                        project_id,
                        project_name,
                        status,
                        elapsed_ms,
                    };
                    if let Err(e) = app.emit("action:status_changed", &status_payload) {
                        tracing::warn!(
                            action_id = %action_id,
                            error = %e,
                            "Failed to emit action:status_changed"
                        );
                    }

                    if bridge_status != ActionStatus::Stopped {
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
                    }

                    action_map.remove_runtime(&action_id).await;
                    break;
                }
                Ok(None) => {
                    action_map.remove_runtime(&action_id).await;
                    break;
                }
                Err(e) => {
                    tracing::error!(
                        action_id = %action_id,
                        error = %e,
                        "Error reading action output"
                    );
                    action_map.remove_runtime(&action_id).await;
                    break;
                }
            }
        }

        tracing::debug!(action_id = %action_id, "Action event loop exited");
    })
}

fn action_category_as_str(category: &ActionCategory) -> &'static str {
    match category {
        ActionCategory::Dev => "dev",
        ActionCategory::Build => "build",
        ActionCategory::Test => "test",
        ActionCategory::Lint => "lint",
        ActionCategory::Deploy => "deploy",
        ActionCategory::Custom => "custom",
    }
}
