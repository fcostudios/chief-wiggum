//! Tokio task that reads BridgeOutput and emits Tauri events to the frontend.
//! Per CHI-46: one task per CliBridge, exits when bridge shuts down.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::process::BridgeInterface;
use super::{BridgeEvent, BridgeOutput};

/// Event payloads emitted to the frontend.

#[derive(Debug, Clone, Serialize)]
pub struct ChunkPayload {
    pub session_id: String,
    pub content: String,
    pub token_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MessageCompletePayload {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub thinking_tokens: Option<u64>,
    pub cost_cents: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliExitedPayload {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PermissionRequestPayload {
    pub session_id: String,
    pub request_id: String,
    pub tool: String,
    pub command: String,
    pub file_path: Option<String>,
    pub risk_level: String,
}

/// Spawn a tokio task that reads from a bridge and emits Tauri events.
/// Returns a JoinHandle that can be awaited or aborted.
pub fn spawn_event_loop(
    app: AppHandle,
    session_id: String,
    bridge: Arc<dyn BridgeInterface>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Event loop started for session {}", session_id);

        loop {
            match bridge.receive().await {
                Ok(Some(output)) => {
                    emit_bridge_output(&app, &session_id, output);
                }
                Ok(None) => {
                    tracing::info!(
                        "Event loop: bridge channel closed for session {}",
                        session_id
                    );
                    break;
                }
                Err(e) => {
                    tracing::error!("Event loop error for session {}: {}", session_id, e);
                    break;
                }
            }
        }

        tracing::info!("Event loop ended for session {}", session_id);
    })
}

/// Map a BridgeOutput to the appropriate Tauri event emission.
fn emit_bridge_output(app: &AppHandle, session_id: &str, output: BridgeOutput) {
    match output {
        BridgeOutput::Chunk(chunk) => {
            tracing::info!(
                "Event loop [{}]: emitting message:chunk ({} bytes)",
                session_id,
                chunk.content.len()
            );
            let payload = ChunkPayload {
                session_id: session_id.to_string(),
                content: chunk.content,
                token_count: chunk.token_count,
            };
            if let Err(e) = app.emit("message:chunk", &payload) {
                tracing::warn!("Failed to emit message:chunk: {}", e);
            }
        }
        BridgeOutput::Event(event) => match event {
            BridgeEvent::MessageComplete {
                session_id: _,
                role,
                content,
                model,
                input_tokens,
                output_tokens,
                thinking_tokens,
                cost_cents,
            } => {
                tracing::info!(
                    "Event loop [{}]: emitting message:complete (role: {}, content len: {}, model: {:?})",
                    session_id,
                    role,
                    content.len(),
                    model
                );
                let payload = MessageCompletePayload {
                    session_id: session_id.to_string(),
                    role,
                    content,
                    model,
                    input_tokens,
                    output_tokens,
                    thinking_tokens,
                    cost_cents,
                };
                if let Err(e) = app.emit("message:complete", &payload) {
                    tracing::warn!("Failed to emit message:complete: {}", e);
                }
            }
            other => {
                tracing::debug!("Bridge event (not yet mapped): {:?}", other);
            }
        },
        BridgeOutput::PermissionRequired(req) => {
            tracing::info!(
                "Event loop [{}]: emitting permission:request (tool: {}, command: {})",
                session_id,
                req.tool,
                req.command
            );
            let payload = PermissionRequestPayload {
                session_id: session_id.to_string(),
                request_id: req.request_id,
                tool: req.tool,
                command: req.command,
                file_path: req.file_path,
                risk_level: req.risk_level,
            };
            if let Err(e) = app.emit("permission:request", &payload) {
                tracing::warn!("Failed to emit permission:request: {}", e);
            }
        }
        BridgeOutput::ProcessExited { exit_code } => {
            tracing::info!(
                "Event loop [{}]: emitting cli:exited (exit_code: {:?})",
                session_id,
                exit_code
            );
            let payload = CliExitedPayload {
                session_id: session_id.to_string(),
                exit_code,
            };
            if let Err(e) = app.emit("cli:exited", &payload) {
                tracing::warn!("Failed to emit cli:exited: {}", e);
            }
        }
    }
}
