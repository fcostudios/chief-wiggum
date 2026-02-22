//! Tokio task that reads BridgeOutput and emits Tauri events to the frontend.
//! Per CHI-46: one task per CliBridge, exits when bridge shuts down.

use std::collections::HashSet;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

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

#[derive(Debug, Clone, Serialize)]
pub struct CliInitPayload {
    pub session_id: String,
    pub cli_session_id: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolUsePayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolResultPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ThinkingPayload {
    pub session_id: String,
    pub content: String,
    pub is_streaming: bool,
}

/// Spawn a tokio task that reads from a bridge and emits Tauri events.
/// Returns a JoinHandle that can be awaited or aborted.
///
/// `mcp_cache` is populated from the CLI's system:init event with normalized
/// MCP server prefixes (e.g., "mcp__plugin_context7_context7"). These are
/// used by `send_to_cli` on subsequent messages to authorize MCP tools via
/// individual `--allowedTools` entries (workaround for broken `mcp__*` wildcard).
pub fn spawn_event_loop(
    app: AppHandle,
    session_id: String,
    bridge: Arc<dyn BridgeInterface>,
    mcp_cache: Arc<RwLock<HashSet<String>>>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Event loop started for session {}", session_id);

        loop {
            match bridge.receive().await {
                Ok(Some(output)) => {
                    emit_bridge_output(&app, &session_id, output, &mcp_cache).await;
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

/// Normalize an MCP server name to the `mcp__<prefix>` format used by --allowedTools.
/// Replaces `:`, `.`, `/`, and space with `_`. Hyphens are preserved.
///
/// Examples:
/// - "plugin:context7:context7" → "mcp__plugin_context7_context7"
/// - "claude.ai/Linear" → "mcp__claude_ai_Linear"
/// - "plugin:claude-mem:mcp-search" → "mcp__plugin_claude-mem_mcp-search"
fn normalize_mcp_server_name(server_name: &str) -> String {
    let normalized = server_name.replace([':', '.', '/', ' '], "_");
    format!("mcp__{}", normalized)
}

/// Extract the MCP server prefix from a full tool name.
/// e.g., "mcp__plugin_context7_context7__query-docs" → "mcp__plugin_context7_context7"
fn extract_mcp_prefix(tool_name: &str) -> Option<String> {
    let rest = tool_name.strip_prefix("mcp__")?;
    // Find first `__` in the remainder — that separates server name from tool name
    let sep_pos = rest.find("__")?;
    Some(format!("mcp__{}", &rest[..sep_pos]))
}

/// Map a BridgeOutput to the appropriate Tauri event emission.
async fn emit_bridge_output(
    app: &AppHandle,
    session_id: &str,
    output: BridgeOutput,
    mcp_cache: &Arc<RwLock<HashSet<String>>>,
) {
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
            BridgeEvent::SystemInit {
                cli_session_id,
                model,
                mcp_servers,
                tools,
            } => {
                tracing::info!(
                    "Event loop [{}]: emitting cli:init (cli_session_id: {}, mcp_servers: {}, tools: {})",
                    session_id,
                    cli_session_id,
                    mcp_servers.len(),
                    tools.len()
                );

                // Cache MCP server prefixes for --allowedTools on subsequent messages.
                // Per Claude Code docs: `mcp__servername` matches all tools from that server.
                // The `mcp__*` wildcard is broken (GitHub #13077), so we pass individual prefixes.
                if !mcp_servers.is_empty() {
                    let prefixes: Vec<String> = mcp_servers
                        .iter()
                        .map(|name| normalize_mcp_server_name(name))
                        .collect();
                    tracing::info!(
                        "Event loop [{}]: caching {} MCP server prefixes: {:?}",
                        session_id,
                        prefixes.len(),
                        prefixes
                    );
                    let mut cache = mcp_cache.write().await;
                    for prefix in prefixes {
                        cache.insert(prefix);
                    }
                }

                // Fallback: if mcp_servers was empty but tools contains MCP tools,
                // extract unique server prefixes from tool names directly.
                if mcp_servers.is_empty() && tools.iter().any(|t| t.starts_with("mcp__")) {
                    let mut cache = mcp_cache.write().await;
                    for tool in &tools {
                        if let Some(prefix) = extract_mcp_prefix(tool) {
                            cache.insert(prefix);
                        }
                    }
                }

                let payload = CliInitPayload {
                    session_id: session_id.to_string(),
                    cli_session_id,
                    model,
                };
                if let Err(e) = app.emit("cli:init", &payload) {
                    tracing::warn!("Failed to emit cli:init: {}", e);
                }
            }
            BridgeEvent::ToolUse {
                session_id: _,
                tool_use_id,
                tool_name,
                tool_input,
            } => {
                let input_str = serde_json::to_string_pretty(&tool_input)
                    .unwrap_or_else(|_| tool_input.to_string());
                tracing::info!(
                    "Event loop [{}]: emitting tool:use (tool: {}, id: {})",
                    session_id,
                    tool_name,
                    tool_use_id
                );
                let payload = ToolUsePayload {
                    session_id: session_id.to_string(),
                    tool_use_id,
                    tool_name,
                    tool_input: input_str,
                };
                if let Err(e) = app.emit("tool:use", &payload) {
                    tracing::warn!("Failed to emit tool:use: {}", e);
                }
            }
            BridgeEvent::ToolResult {
                session_id: _,
                tool_use_id,
                content,
                is_error,
            } => {
                tracing::info!(
                    "Event loop [{}]: emitting tool:result (is_error: {})",
                    session_id,
                    is_error
                );
                let payload = ToolResultPayload {
                    session_id: session_id.to_string(),
                    tool_use_id,
                    content,
                    is_error,
                };
                if let Err(e) = app.emit("tool:result", &payload) {
                    tracing::warn!("Failed to emit tool:result: {}", e);
                }
            }
            BridgeEvent::Thinking {
                session_id: _,
                content,
                is_streaming,
            } => {
                tracing::debug!(
                    "Event loop [{}]: emitting message:thinking ({} bytes)",
                    session_id,
                    content.len()
                );
                let payload = ThinkingPayload {
                    session_id: session_id.to_string(),
                    content,
                    is_streaming,
                };
                if let Err(e) = app.emit("message:thinking", &payload) {
                    tracing::warn!("Failed to emit message:thinking: {}", e);
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
