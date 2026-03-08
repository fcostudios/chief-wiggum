//! Tokio task that reads BridgeOutput and emits Tauri events to the frontend.
//! Per CHI-46: one task per CliBridge, exits when bridge shuts down.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

use super::manager::{BufferedEvent, SessionRuntime};
use super::permission::{PermissionAction, PermissionManager};
use super::process::BridgeInterface;
use super::{BridgeEvent, BridgeOutput, QuestionRequestPayload};

/// Event payloads emitted to the frontend.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkPayload {
    pub session_id: String,
    pub content: String,
    pub token_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageCompletePayload {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub thinking_tokens: Option<u64>,
    pub cost_cents: Option<f64>,
    pub is_error: bool,
    pub stop_reason: Option<String>,
    pub uuid: Option<String>,
    pub parent_uuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostUpdatePayload {
    pub session_id: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliExitedPayload {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequestPayload {
    pub session_id: String,
    pub request_id: String,
    pub tool: String,
    pub command: String,
    pub file_path: Option<String>,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliInitPayload {
    pub session_id: String,
    pub cli_session_id: String,
    pub model: String,
    pub tools: Vec<String>,
    pub mcp_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUsePayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutputPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    runtimes: Arc<RwLock<HashMap<String, SessionRuntime>>>,
    sdk_commands: Arc<RwLock<Vec<crate::slash::SlashCommand>>>,
    permission_manager: Option<PermissionManager>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Event loop started for session {}", session_id);

        loop {
            match bridge.receive().await {
                Ok(Some(output)) => {
                    emit_bridge_output(
                        &app,
                        &session_id,
                        output,
                        &mcp_cache,
                        &runtimes,
                        &sdk_commands,
                        &bridge,
                        &permission_manager,
                    )
                    .await;
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
pub(crate) fn normalize_mcp_server_name(server_name: &str) -> String {
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
/// Also buffers each event into the session's `SessionRuntime` for HMR replay.
#[allow(clippy::too_many_arguments)]
async fn emit_bridge_output(
    app: &AppHandle,
    session_id: &str,
    output: BridgeOutput,
    mcp_cache: &Arc<RwLock<HashSet<String>>>,
    runtimes: &Arc<RwLock<HashMap<String, SessionRuntime>>>,
    sdk_commands: &Arc<RwLock<Vec<crate::slash::SlashCommand>>>,
    bridge: &Arc<dyn BridgeInterface>,
    permission_manager: &Option<PermissionManager>,
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
            // Buffer for HMR reconnection
            {
                let mut rts = runtimes.write().await;
                if let Some(rt) = rts.get_mut(session_id) {
                    rt.buffer_event(BufferedEvent::Chunk(payload.clone()));
                }
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
                is_error,
                stop_reason,
                uuid,
                parent_uuid,
            } => {
                tracing::info!(
                    "Event loop [{}]: emitting message:complete (role: {}, content len: {}, model: {:?}, is_error: {})",
                    session_id,
                    role,
                    content.len(),
                    model,
                    is_error
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
                    is_error,
                    stop_reason,
                    uuid,
                    parent_uuid,
                };
                if let Err(e) = app.emit("message:complete", &payload) {
                    tracing::warn!("Failed to emit message:complete: {}", e);
                }
                // Buffer for HMR reconnection
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.buffer_event(BufferedEvent::MessageComplete(payload.clone()));
                    }
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

                // Convert SDK tools into slash commands for frontend discovery (CHI-108).
                {
                    let sdk_cmds = crate::slash::from_sdk_tools(&tools, &mcp_servers);
                    if !sdk_cmds.is_empty() {
                        tracing::info!(
                            "Event loop [{}]: discovered {} SDK commands from system:init",
                            session_id,
                            sdk_cmds.len()
                        );
                    }
                    let mut store = sdk_commands.write().await;
                    *store = sdk_cmds;
                }

                let payload = CliInitPayload {
                    session_id: session_id.to_string(),
                    cli_session_id,
                    model,
                    tools,
                    mcp_servers,
                };
                if let Err(e) = app.emit("cli:init", &payload) {
                    tracing::warn!("Failed to emit cli:init: {}", e);
                }
                // Buffer for HMR reconnection + update runtime state
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.process_status = "running".to_string();
                        rt.cli_session_id = Some(payload.cli_session_id.clone());
                        rt.model = Some(payload.model.clone());
                        rt.buffer_event(BufferedEvent::CliInit(payload.clone()));
                    }
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
                // Buffer for HMR reconnection
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.buffer_event(BufferedEvent::ToolUse(payload.clone()));
                    }
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
                // Emit tool:output first so the frontend terminal widget has content
                // before the tool:result block arrives.
                let output_payload = ToolOutputPayload {
                    session_id: session_id.to_string(),
                    tool_use_id: tool_use_id.clone(),
                    content: content.clone(),
                    is_error,
                };
                if let Err(e) = app.emit("tool:output", &output_payload) {
                    tracing::warn!("Failed to emit tool:output: {}", e);
                }
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.buffer_event(BufferedEvent::ToolOutput(output_payload.clone()));
                    }
                }
                let payload = ToolResultPayload {
                    session_id: session_id.to_string(),
                    tool_use_id,
                    content,
                    is_error,
                };
                if let Err(e) = app.emit("tool:result", &payload) {
                    tracing::warn!("Failed to emit tool:result: {}", e);
                }
                // Buffer for HMR reconnection
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.buffer_event(BufferedEvent::ToolResult(payload.clone()));
                    }
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
                // Buffer for HMR reconnection
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.buffer_event(BufferedEvent::Thinking(payload.clone()));
                    }
                }
            }
            BridgeEvent::UsageUpdate {
                session_id: _,
                model,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_write_tokens,
            } => {
                tracing::info!(
                    "Event loop [{}]: emitting cost:update (cache_read: {}, cache_write: {})",
                    session_id,
                    cache_read_tokens,
                    cache_write_tokens,
                );
                let payload = CostUpdatePayload {
                    session_id: session_id.to_string(),
                    model: model.clone(),
                    input_tokens,
                    output_tokens,
                    cache_read_tokens,
                    cache_write_tokens,
                };
                if let Err(e) = app.emit("cost:update", &payload) {
                    tracing::warn!("Failed to emit cost:update: {}", e);
                }

                let db = app.state::<crate::db::Database>();
                if let Err(e) = crate::db::queries::insert_cost_event(
                    &db,
                    session_id,
                    None,
                    &model,
                    input_tokens as i64,
                    output_tokens as i64,
                    cache_read_tokens as i64,
                    cache_write_tokens as i64,
                    0,
                    Some("usage_update"),
                ) {
                    tracing::warn!("Failed to persist cost event: {}", e);
                }
                if let Err(e) = crate::db::queries::update_session_cost(
                    &db,
                    session_id,
                    input_tokens as i64,
                    output_tokens as i64,
                    0,
                    0,
                    cache_read_tokens as i64,
                    cache_write_tokens as i64,
                ) {
                    tracing::warn!("Failed to accumulate usage tokens to session: {}", e);
                }
            }
            other => {
                tracing::debug!("Bridge event (not yet mapped): {:?}", other);
            }
        },
        BridgeOutput::PermissionRequired(req) => {
            // SDK mode: route through PermissionManager and write control_response back to CLI.
            if let Some(pm) = permission_manager.as_ref() {
                let request_id = req.request_id.clone();
                let tool = req.tool.clone();
                let command = req.command.clone();

                // Defensive guard: AskUserQuestion should be intercepted as QuestionRequired and
                // must never be auto-approved (including YOLO mode).
                let is_question_tool = req.tool == "AskUserQuestion";
                if is_question_tool {
                    tracing::warn!(
                        "Event loop [{}]: AskUserQuestion reached PermissionRequired path; refusing auto-approve",
                        session_id
                    );
                }

                // Skip UI dialog when the permission manager can auto-resolve.
                let action = if !is_question_tool
                    && (pm.is_yolo_mode().await || pm.is_auto_allowed(&req).await)
                {
                    tracing::info!(
                        "Event loop [{}]: auto-resolving SDK permission (tool: {}, command: {})",
                        session_id,
                        tool,
                        command
                    );
                    PermissionAction::Approve
                } else {
                    tracing::info!(
                        "Event loop [{}]: emitting permission:request (tool: {}, command: {})",
                        session_id,
                        tool,
                        command
                    );
                    let payload = PermissionRequestPayload {
                        session_id: session_id.to_string(),
                        request_id: req.request_id.clone(),
                        tool: req.tool.clone(),
                        command: req.command.clone(),
                        file_path: req.file_path.clone(),
                        risk_level: req.risk_level.clone(),
                    };
                    if let Err(e) = app.emit("permission:request", &payload) {
                        tracing::warn!("Failed to emit permission:request: {}", e);
                    }
                    {
                        let mut rts = runtimes.write().await;
                        if let Some(rt) = rts.get_mut(session_id) {
                            rt.buffer_event(BufferedEvent::PermissionRequest(payload.clone()));
                        }
                    }

                    match pm.request_permission(req.clone()).await {
                        Ok(action) => action,
                        Err(e) => {
                            tracing::error!(
                                "Event loop [{}]: permission flow failed (request {}): {}",
                                session_id,
                                request_id,
                                e
                            );
                            PermissionAction::Deny
                        }
                    }
                };

                let allow = matches!(
                    action,
                    PermissionAction::Approve | PermissionAction::AlwaysAllow
                );
                let deny_reason = if allow {
                    None
                } else {
                    Some("User denied".to_string())
                };
                let updated_input = if allow {
                    if req.tool_input.is_none() {
                        tracing::warn!(
                            "Event loop [{}]: approving SDK permission {} without original tool_input; sending empty updatedInput",
                            session_id,
                            request_id
                        );
                    }
                    req.tool_input.clone()
                } else {
                    None
                };

                if let Err(e) = bridge
                    .send_control_response(&request_id, allow, deny_reason, updated_input)
                    .await
                {
                    tracing::error!(
                        "Event loop [{}]: failed to write control_response for {}: {}",
                        session_id,
                        request_id,
                        e
                    );
                } else {
                    tracing::info!(
                        "Event loop [{}]: sent control_response (allow: {}) for request {}",
                        session_id,
                        allow,
                        request_id
                    );
                }
            } else {
                // Legacy mode: preserve existing behavior (emit only).
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
                {
                    let mut rts = runtimes.write().await;
                    if let Some(rt) = rts.get_mut(session_id) {
                        rt.buffer_event(BufferedEvent::PermissionRequest(payload.clone()));
                    }
                }
            }
        }
        BridgeOutput::QuestionRequired(req) => {
            if let Some(pm) = permission_manager.as_ref() {
                let request_id = req.request_id.clone();
                let request_id_for_response = request_id.clone();
                let questions = req.questions.clone();
                let tool_input = req.tool_input.clone();
                let rx = pm.store_pending_question(request_id.clone(), req).await;
                let bridge_clone = Arc::clone(bridge);
                let session_id_for_response = session_id.to_string();

                tokio::spawn(async move {
                    match rx.await {
                        Ok(updated_input) => {
                            if let Err(e) = bridge_clone
                                .send_control_response(
                                    &request_id_for_response,
                                    true,
                                    None,
                                    Some(updated_input),
                                )
                                .await
                            {
                                tracing::warn!(
                                    "Event loop [{}]: failed to send question response for {}: {}",
                                    session_id_for_response,
                                    request_id_for_response,
                                    e
                                );
                            }
                        }
                        Err(_) => {
                            tracing::warn!(
                                "Event loop [{}]: question {} cancelled (receiver dropped)",
                                session_id_for_response,
                                request_id_for_response
                            );
                        }
                    }
                });

                if pm.is_yolo_mode().await {
                    tracing::info!(
                        "Event loop [{}]: YOLO auto-resolving question {}",
                        session_id,
                        request_id
                    );
                    let mut updated_input = tool_input;
                    if !updated_input.contains_key("questions") {
                        updated_input.insert(
                            "questions".to_string(),
                            serde_json::to_value(&questions)
                                .unwrap_or(serde_json::Value::Array(vec![])),
                        );
                    }
                    let auto_answers = super::build_auto_answers(&questions);
                    match serde_json::to_value(&auto_answers) {
                        Ok(value) => {
                            updated_input.insert("answers".to_string(), value);
                            if let Err(e) = pm.resolve_question(&request_id, updated_input).await {
                                tracing::warn!(
                                    "Event loop [{}]: failed to auto-resolve question {}: {}",
                                    session_id,
                                    request_id,
                                    e
                                );
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                "Event loop [{}]: failed to serialize YOLO auto-answers for {}: {}",
                                session_id,
                                request_id,
                                e
                            );
                            let _ = pm.resolve_question(&request_id, updated_input).await;
                        }
                    }
                    return;
                }

                tracing::info!(
                    "Event loop [{}]: emitting question:request ({} questions)",
                    session_id,
                    questions.len()
                );
                let payload = QuestionRequestPayload {
                    session_id: session_id.to_string(),
                    request_id: request_id.clone(),
                    questions,
                };
                if let Err(e) = app.emit("question:request", &payload) {
                    tracing::warn!("Failed to emit question:request: {}", e);
                }
            } else {
                tracing::warn!(
                    "Event loop [{}]: QuestionRequired without PermissionManager; question {} cannot be resolved",
                    session_id,
                    req.request_id
                );
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
            // Buffer for HMR reconnection + update runtime state
            {
                let mut rts = runtimes.write().await;
                if let Some(rt) = rts.get_mut(session_id) {
                    rt.process_status = "exited".to_string();
                    rt.buffer_event(BufferedEvent::CliExited(payload.clone()));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_payload_serializes_correctly() {
        let payload = ChunkPayload {
            session_id: "s1".to_string(),
            content: "Hello world".to_string(),
            token_count: Some(3),
        };
        let json = serde_json::to_string(&payload).expect("serialize chunk payload");
        assert!(json.contains("\"session_id\":\"s1\""));
        assert!(json.contains("\"content\":\"Hello world\""));
        assert!(json.contains("\"token_count\":3"));
    }

    #[test]
    fn message_complete_payload_serializes_with_all_fields() {
        let payload = MessageCompletePayload {
            session_id: "s1".to_string(),
            role: "assistant".to_string(),
            content: "Hello!".to_string(),
            model: Some("claude-sonnet-4-6".to_string()),
            input_tokens: Some(10),
            output_tokens: Some(5),
            thinking_tokens: Some(2),
            cost_cents: Some(0.05),
            is_error: false,
            stop_reason: Some("end_turn".to_string()),
            uuid: Some("msg-1".to_string()),
            parent_uuid: None,
        };
        let json = serde_json::to_string(&payload).expect("serialize complete payload");
        assert!(json.contains("\"role\":\"assistant\""));
        assert!(json.contains("\"model\":\"claude-sonnet-4-6\""));
        assert!(json.contains("\"is_error\":false"));
    }

    #[test]
    fn message_complete_payload_handles_null_optionals() {
        let payload = MessageCompletePayload {
            session_id: "s1".to_string(),
            role: "assistant".to_string(),
            content: "Error".to_string(),
            model: None,
            input_tokens: None,
            output_tokens: None,
            thinking_tokens: None,
            cost_cents: None,
            is_error: true,
            stop_reason: None,
            uuid: None,
            parent_uuid: None,
        };
        let json = serde_json::to_string(&payload).expect("serialize nullable complete payload");
        assert!(json.contains("\"model\":null"));
        assert!(json.contains("\"is_error\":true"));
    }

    #[test]
    fn cli_exited_payload_serializes() {
        let payload = CliExitedPayload {
            session_id: "s1".to_string(),
            exit_code: Some(0),
        };
        let json = serde_json::to_string(&payload).expect("serialize exited payload");
        assert!(json.contains("\"exit_code\":0"));

        let no_code = CliExitedPayload {
            session_id: "s1".to_string(),
            exit_code: None,
        };
        let json = serde_json::to_string(&no_code).expect("serialize exited payload without code");
        assert!(json.contains("\"exit_code\":null"));
    }

    #[test]
    fn permission_request_payload_serializes() {
        let payload = PermissionRequestPayload {
            session_id: "s1".to_string(),
            request_id: "req-1".to_string(),
            tool: "Bash".to_string(),
            command: "rm -rf /tmp".to_string(),
            file_path: None,
            risk_level: "high".to_string(),
        };
        let json = serde_json::to_string(&payload).expect("serialize permission payload");
        assert!(json.contains("\"tool\":\"Bash\""));
        assert!(json.contains("\"risk_level\":\"high\""));
    }

    #[test]
    fn cli_init_payload_serializes_with_tools_and_mcp() {
        let payload = CliInitPayload {
            session_id: "s1".to_string(),
            cli_session_id: "cli-abc123".to_string(),
            model: "claude-sonnet-4-6".to_string(),
            tools: vec!["Read".to_string(), "Write".to_string()],
            mcp_servers: vec!["server1".to_string()],
        };
        let json = serde_json::to_string(&payload).expect("serialize init payload");
        assert!(json.contains("\"cli_session_id\":\"cli-abc123\""));
        assert!(json.contains("\"Read\""));
        assert!(json.contains("\"server1\""));
    }

    #[test]
    fn tool_use_payload_serializes() {
        let payload = ToolUsePayload {
            session_id: "s1".to_string(),
            tool_use_id: "tu-1".to_string(),
            tool_name: "Read".to_string(),
            tool_input: r#"{"file_path":"/tmp/test.rs"}"#.to_string(),
        };
        let json = serde_json::to_string(&payload).expect("serialize tool use payload");
        assert!(json.contains("\"tool_name\":\"Read\""));
        assert!(json.contains("\"tool_use_id\":\"tu-1\""));
    }

    #[test]
    fn tool_result_payload_serializes() {
        let payload = ToolResultPayload {
            session_id: "s1".to_string(),
            tool_use_id: "tu-1".to_string(),
            content: "file content here".to_string(),
            is_error: false,
        };
        let json = serde_json::to_string(&payload).expect("serialize tool result payload");
        assert!(json.contains("\"is_error\":false"));

        let error_result = ToolResultPayload {
            session_id: "s1".to_string(),
            tool_use_id: "tu-2".to_string(),
            content: "Permission denied".to_string(),
            is_error: true,
        };
        let json = serde_json::to_string(&error_result).expect("serialize errored tool result");
        assert!(json.contains("\"is_error\":true"));
    }

    #[test]
    fn tool_output_payload_serializes() {
        let payload = ToolOutputPayload {
            session_id: "sess-1".to_string(),
            tool_use_id: "tool-abc".to_string(),
            content: "stdout line\n".to_string(),
            is_error: false,
        };
        let json = serde_json::to_string(&payload).expect("serialize tool output payload");
        assert!(json.contains("\"session_id\":\"sess-1\""));
        assert!(json.contains("\"tool_use_id\":\"tool-abc\""));
        assert!(json.contains("\"is_error\":false"));
    }

    #[test]
    fn thinking_payload_serializes() {
        let payload = ThinkingPayload {
            session_id: "s1".to_string(),
            content: "I'm thinking about...".to_string(),
            is_streaming: true,
        };
        let json = serde_json::to_string(&payload).expect("serialize thinking payload");
        assert!(json.contains("\"is_streaming\":true"));
    }

    #[test]
    fn all_payloads_roundtrip_serde() {
        let chunk = ChunkPayload {
            session_id: "s1".to_string(),
            content: "test".to_string(),
            token_count: None,
        };
        let json = serde_json::to_string(&chunk).expect("serialize chunk");
        let decoded: ChunkPayload = serde_json::from_str(&json).expect("deserialize chunk");
        assert_eq!(decoded.session_id, "s1");
        assert_eq!(decoded.content, "test");

        let complete = MessageCompletePayload {
            session_id: "s1".to_string(),
            role: "assistant".to_string(),
            content: "done".to_string(),
            model: Some("claude-sonnet-4-6".to_string()),
            input_tokens: Some(100),
            output_tokens: Some(50),
            thinking_tokens: None,
            cost_cents: Some(1.5),
            is_error: false,
            stop_reason: None,
            uuid: Some("msg-2".to_string()),
            parent_uuid: Some("msg-1".to_string()),
        };
        let json = serde_json::to_string(&complete).expect("serialize complete");
        let decoded: MessageCompletePayload =
            serde_json::from_str(&json).expect("deserialize complete");
        assert_eq!(decoded.role, "assistant");
        assert_eq!(decoded.input_tokens, Some(100));
    }

    #[test]
    fn chunk_payload_handles_unicode_content() {
        let payload = ChunkPayload {
            session_id: "s1".to_string(),
            content: "Hello 世界! 🌍 café".to_string(),
            token_count: Some(5),
        };
        let json = serde_json::to_string(&payload).expect("serialize unicode chunk");
        let decoded: ChunkPayload = serde_json::from_str(&json).expect("deserialize unicode chunk");
        assert_eq!(decoded.content, "Hello 世界! 🌍 café");
    }

    #[test]
    fn chunk_payload_handles_empty_content() {
        let payload = ChunkPayload {
            session_id: "s1".to_string(),
            content: String::new(),
            token_count: None,
        };
        let json = serde_json::to_string(&payload).expect("serialize empty chunk");
        let decoded: ChunkPayload = serde_json::from_str(&json).expect("deserialize empty chunk");
        assert!(decoded.content.is_empty());
    }
}
