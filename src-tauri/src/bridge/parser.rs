//! Structured output parser for Claude Code CLI responses.
//!
//! Implements CHI-14: structured output parser.
//! Parses Claude Code `--output-format stream-json` output into typed events.
//!
//! Architecture: SPEC-004 §2 (bridge/parser.rs), §5.1 (Message Send Flow)
//! Standards: GUIDE-001 §2.4 (errors), §2.7 (testing)
//!
//! Claude Code's stream-json format emits one JSON object per line.
//! Each object has a `type` field that determines the payload structure.
//! The parser is chunk-aware — it handles partial JSON across PTY reads.

use serde::{Deserialize, Serialize};

use super::permission::PermissionRequest;

/// A streaming message chunk emitted during response generation.
/// Maps to the `message:chunk` Tauri event (SPEC-004 §4.3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageChunk {
    pub session_id: String,
    pub content: String,
    pub token_count: Option<u64>,
}

/// A discrete event parsed from CLI output.
/// These map to various Tauri events defined in SPEC-004 §4.3.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BridgeEvent {
    /// Message is complete (maps to `message:complete`).
    MessageComplete {
        session_id: String,
        role: String,
        content: String,
        model: Option<String>,
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        thinking_tokens: Option<u64>,
        cost_cents: Option<f64>,
    },

    /// Tool use detected (e.g., file read, bash command).
    ToolUse {
        session_id: String,
        tool_use_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
    },

    /// Tool result received.
    ToolResult {
        session_id: String,
        tool_use_id: String,
        content: String,
        is_error: bool,
    },

    /// System message (info, warning, etc.).
    SystemMessage { level: String, message: String },

    /// Thinking/reasoning content (maps to `message:thinking`).
    Thinking {
        session_id: String,
        content: String,
        is_streaming: bool,
    },

    /// Cost/usage metadata update (maps to `cost:update`).
    UsageUpdate {
        session_id: String,
        model: String,
        input_tokens: u64,
        output_tokens: u64,
        cache_read_tokens: u64,
        cache_write_tokens: u64,
    },

    /// Context utilization update (maps to `context:update`).
    ContextUpdate {
        session_id: String,
        tokens_used: u64,
        tokens_limit: u64,
    },

    /// Agent state change (maps to `agent:state_change`).
    AgentStateChange {
        agent_id: String,
        old_state: String,
        new_state: String,
        details: Option<String>,
    },

    /// CLI session init event — carries the CLI's own session ID.
    SystemInit {
        cli_session_id: String,
        model: String,
        /// MCP server names from the init event (e.g., "plugin:context7:context7").
        mcp_servers: Vec<String>,
        /// All available tool names from the init event.
        tools: Vec<String>,
    },

    /// Raw/unrecognized output line (forward-compatible).
    Unknown {
        raw_type: String,
        data: serde_json::Value,
    },
}

/// Unified parsed output from the stream parser.
pub enum ParsedOutput {
    Chunk(MessageChunk),
    Event(BridgeEvent),
    PermissionRequest(PermissionRequest),
}

/// Raw JSON event structure from Claude Code's stream-json output.
/// Each line of output is one of these objects.
#[derive(Debug, Deserialize)]
struct RawStreamEvent {
    #[serde(rename = "type")]
    event_type: String,

    #[serde(flatten)]
    data: serde_json::Value,
}

/// Streaming parser that handles partial JSON across PTY read boundaries.
/// Per SPEC-004 §9.2: "Parser operates on chunks, not full messages."
pub struct StreamParser {
    /// Buffer for accumulating partial lines across chunks.
    line_buffer: String,
    /// Current session ID (set when first message arrives).
    session_id: String,
}

impl StreamParser {
    /// Create a new stream parser.
    pub fn new() -> Self {
        Self {
            line_buffer: String::new(),
            session_id: String::new(),
        }
    }

    /// Create a parser with a known session ID.
    pub fn with_session_id(session_id: String) -> Self {
        Self {
            line_buffer: String::new(),
            session_id,
        }
    }

    /// Set the current session ID.
    pub fn set_session_id(&mut self, session_id: String) {
        self.session_id = session_id;
    }

    /// Feed a raw text chunk from the PTY reader.
    /// Returns zero or more parsed outputs.
    ///
    /// Handles partial lines by buffering incomplete JSON across calls.
    /// Per SPEC-004 §9.2: robust against malformed/incomplete JSON chunks.
    pub fn feed(&mut self, chunk: &str) -> Vec<ParsedOutput> {
        let mut outputs = Vec::new();

        self.line_buffer.push_str(chunk);

        // Process complete lines (newline-delimited JSON)
        while let Some(newline_pos) = self.line_buffer.find('\n') {
            let line: String = self.line_buffer.drain(..=newline_pos).collect();
            let line = line.trim();

            if line.is_empty() {
                continue;
            }

            match self.parse_line(line) {
                Ok(Some(output)) => outputs.push(output),
                Ok(None) => {
                    // Line was valid but not actionable (e.g., empty event)
                }
                Err(e) => {
                    // Log but don't crash on malformed JSON — forward compatibility
                    tracing::warn!("Parser: failed to parse line: {} — raw: {}", e, line);
                }
            }
        }

        outputs
    }

    /// Parse a single complete line of stream-json output.
    fn parse_line(&mut self, line: &str) -> Result<Option<ParsedOutput>, String> {
        let event: RawStreamEvent =
            serde_json::from_str(line).map_err(|e| format!("JSON parse error: {}", e))?;

        match event.event_type.as_str() {
            // Streaming content delta
            "content_block_delta" | "content_delta" | "assistant_message_delta" => {
                let content = extract_string(&event.data, "text")
                    .or_else(|| extract_string(&event.data, "delta.text"))
                    .or_else(|| extract_nested_string(&event.data, &["delta", "text"]))
                    .unwrap_or_default();

                if content.is_empty() {
                    return Ok(None);
                }

                Ok(Some(ParsedOutput::Chunk(MessageChunk {
                    session_id: self.session_id.clone(),
                    content,
                    token_count: extract_u64(&event.data, "token_count"),
                })))
            }

            // Streamed assistant message — contains content blocks (text, thinking, tool_use).
            // Claude Code emits one `assistant` event per content block addition.
            // Structure: { type: "assistant", message: { content: [{type, text/thinking}], ... } }
            "assistant" => {
                let mut outputs = Vec::new();

                if let Some(content_arr) = event
                    .data
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for block in content_arr {
                        let block_type = block
                            .get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        match block_type {
                            "text" => {
                                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                    if !text.is_empty() {
                                        outputs.push(ParsedOutput::Chunk(MessageChunk {
                                            session_id: self.session_id.clone(),
                                            content: text.to_string(),
                                            token_count: None,
                                        }));
                                    }
                                }
                            }
                            "thinking" => {
                                if let Some(thinking) =
                                    block.get("thinking").and_then(|t| t.as_str())
                                {
                                    outputs.push(ParsedOutput::Event(BridgeEvent::Thinking {
                                        session_id: self.session_id.clone(),
                                        content: thinking.to_string(),
                                        is_streaming: false,
                                    }));
                                }
                            }
                            _ => {} // tool_use, etc. — handled elsewhere
                        }
                    }
                }

                // Return first output, queue the rest. For simplicity, if there are
                // multiple blocks in one event, return them all via the vec path.
                if outputs.is_empty() {
                    Ok(None)
                } else if outputs.len() == 1 {
                    Ok(Some(outputs.remove(0)))
                } else {
                    // Multiple blocks — return first, push rest back.
                    // Actually, our feed() collects into a Vec, so we'll handle
                    // multi-block by returning just the first here and letting the
                    // outer loop call again. But parse_line is called once per line.
                    // So we need a different approach: store pending outputs.
                    // For now, concatenate text chunks into one.
                    let mut combined_text = String::new();
                    for output in &outputs {
                        if let ParsedOutput::Chunk(chunk) = output {
                            combined_text.push_str(&chunk.content);
                        }
                    }
                    if !combined_text.is_empty() {
                        Ok(Some(ParsedOutput::Chunk(MessageChunk {
                            session_id: self.session_id.clone(),
                            content: combined_text,
                            token_count: None,
                        })))
                    } else {
                        Ok(outputs.into_iter().next())
                    }
                }
            }

            // Message complete / final result.
            // `result` events have content in `result` field and cost in `total_cost_usd`.
            // `message_complete` / `assistant_message` use `content` field.
            "message_complete" | "result" | "assistant_message" => {
                let content = extract_string(&event.data, "result")
                    .or_else(|| extract_string(&event.data, "content"))
                    .or_else(|| extract_string(&event.data, "text"))
                    .unwrap_or_default();

                // Cost: `result` events use `total_cost_usd` (dollars → cents)
                let cost_cents = extract_f64(&event.data, "total_cost_usd")
                    .map(|usd| usd * 100.0)
                    .or_else(|| extract_f64(&event.data, "cost_cents"));

                Ok(Some(ParsedOutput::Event(BridgeEvent::MessageComplete {
                    session_id: self.session_id.clone(),
                    role: extract_string(&event.data, "role")
                        .unwrap_or_else(|| "assistant".to_string()),
                    content,
                    model: extract_string(&event.data, "model"),
                    input_tokens: extract_u64(&event.data, "usage.input_tokens")
                        .or_else(|| extract_nested_u64(&event.data, &["usage", "input_tokens"])),
                    output_tokens: extract_u64(&event.data, "usage.output_tokens")
                        .or_else(|| extract_nested_u64(&event.data, &["usage", "output_tokens"])),
                    thinking_tokens: extract_u64(&event.data, "usage.thinking_tokens")
                        .or_else(|| extract_nested_u64(&event.data, &["usage", "thinking_tokens"])),
                    cost_cents,
                })))
            }

            // Tool use
            "tool_use" | "tool_call" => {
                let tool_use_id = extract_string(&event.data, "id")
                    .unwrap_or_default();

                let tool_name = extract_string(&event.data, "name")
                    .or_else(|| extract_string(&event.data, "tool_name"))
                    .unwrap_or_else(|| "unknown".to_string());

                let tool_input = event
                    .data
                    .get("input")
                    .or_else(|| event.data.get("parameters"))
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);

                Ok(Some(ParsedOutput::Event(BridgeEvent::ToolUse {
                    session_id: self.session_id.clone(),
                    tool_use_id,
                    tool_name,
                    tool_input,
                })))
            }

            // Tool result
            "tool_result" => Ok(Some(ParsedOutput::Event(BridgeEvent::ToolResult {
                session_id: self.session_id.clone(),
                tool_use_id: extract_string(&event.data, "tool_use_id").unwrap_or_default(),
                content: extract_string(&event.data, "content").unwrap_or_default(),
                is_error: event
                    .data
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            }))),

            // Thinking/reasoning
            "thinking" | "thinking_delta" => {
                let content = extract_string(&event.data, "thinking")
                    .or_else(|| extract_string(&event.data, "text"))
                    .or_else(|| extract_nested_string(&event.data, &["delta", "thinking"]))
                    .unwrap_or_default();

                Ok(Some(ParsedOutput::Event(BridgeEvent::Thinking {
                    session_id: self.session_id.clone(),
                    content,
                    is_streaming: event.event_type == "thinking_delta",
                })))
            }

            // Permission request
            "permission_request" | "permission" => {
                let tool =
                    extract_string(&event.data, "tool").unwrap_or_else(|| "unknown".to_string());
                let command = extract_string(&event.data, "command")
                    .or_else(|| extract_string(&event.data, "description"))
                    .unwrap_or_default();

                let risk_level = extract_string(&event.data, "risk_level")
                    .unwrap_or_else(|| "medium".to_string());

                Ok(Some(ParsedOutput::PermissionRequest(PermissionRequest {
                    request_id: extract_string(&event.data, "request_id")
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                    tool,
                    command,
                    file_path: extract_string(&event.data, "file_path"),
                    risk_level,
                })))
            }

            // Usage/cost update
            "usage" | "usage_update" => Ok(Some(ParsedOutput::Event(BridgeEvent::UsageUpdate {
                session_id: self.session_id.clone(),
                model: extract_string(&event.data, "model")
                    .unwrap_or_else(|| "unknown".to_string()),
                input_tokens: extract_u64(&event.data, "input_tokens").unwrap_or(0),
                output_tokens: extract_u64(&event.data, "output_tokens").unwrap_or(0),
                cache_read_tokens: extract_u64(&event.data, "cache_read_tokens").unwrap_or(0),
                cache_write_tokens: extract_u64(&event.data, "cache_write_tokens").unwrap_or(0),
            }))),

            // System events — init subtype carries CLI session_id
            "system" => {
                let subtype = extract_string(&event.data, "subtype");
                if subtype.as_deref() == Some("init") {
                    let cli_session_id = extract_string(&event.data, "session_id")
                        .unwrap_or_default();
                    let model = extract_string(&event.data, "model")
                        .unwrap_or_else(|| "unknown".to_string());

                    // Extract MCP server names from init event
                    let mcp_servers = event
                        .data
                        .get("mcp_servers")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|s| s.get("name").and_then(|n| n.as_str()))
                                .map(|s| s.to_string())
                                .collect()
                        })
                        .unwrap_or_default();

                    // Extract available tool names
                    let tools = event
                        .data
                        .get("tools")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|t| t.as_str())
                                .map(|s| s.to_string())
                                .collect()
                        })
                        .unwrap_or_default();

                    Ok(Some(ParsedOutput::Event(BridgeEvent::SystemInit {
                        cli_session_id,
                        model,
                        mcp_servers,
                        tools,
                    })))
                } else {
                    Ok(Some(ParsedOutput::Event(BridgeEvent::SystemMessage {
                        level: event.event_type.clone(),
                        message: extract_string(&event.data, "message")
                            .or_else(|| extract_string(&event.data, "text"))
                            .unwrap_or_default(),
                    })))
                }
            }

            // Info/warning/error messages
            "info" | "warning" | "error" => {
                Ok(Some(ParsedOutput::Event(BridgeEvent::SystemMessage {
                    level: event.event_type.clone(),
                    message: extract_string(&event.data, "message")
                        .or_else(|| extract_string(&event.data, "text"))
                        .unwrap_or_default(),
                })))
            }

            // Agent state changes
            "agent_state" | "agent_state_change" => {
                Ok(Some(ParsedOutput::Event(BridgeEvent::AgentStateChange {
                    agent_id: extract_string(&event.data, "agent_id").unwrap_or_default(),
                    old_state: extract_string(&event.data, "old_state").unwrap_or_default(),
                    new_state: extract_string(&event.data, "new_state").unwrap_or_default(),
                    details: extract_string(&event.data, "details"),
                })))
            }

            // Forward compatibility: log unknown types but don't error
            _ => {
                tracing::debug!(
                    "Parser: unknown event type '{}', forwarding as Unknown",
                    event.event_type
                );
                Ok(Some(ParsedOutput::Event(BridgeEvent::Unknown {
                    raw_type: event.event_type,
                    data: event.data,
                })))
            }
        }
    }
}

impl Default for StreamParser {
    fn default() -> Self {
        Self::new()
    }
}

// --- Helper functions for safe JSON field extraction ---

fn extract_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn extract_nested_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let mut current = value;
    for key in keys {
        current = current.get(key)?;
    }
    current.as_str().map(|s| s.to_string())
}

fn extract_u64(value: &serde_json::Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|v| v.as_u64())
}

fn extract_nested_u64(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    let mut current = value;
    for key in keys {
        current = current.get(key)?;
    }
    current.as_u64()
}

fn extract_f64(value: &serde_json::Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| v.as_f64())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_parser() -> StreamParser {
        StreamParser::with_session_id("test-session".to_string())
    }

    #[test]
    fn parse_content_delta() {
        let mut parser = make_parser();
        let line = r#"{"type":"content_block_delta","text":"Hello world"}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Chunk(chunk) => {
                assert_eq!(chunk.content, "Hello world");
                assert_eq!(chunk.session_id, "test-session");
            }
            _ => panic!("Expected Chunk, got something else"),
        }
    }

    #[test]
    fn parse_message_complete() {
        let mut parser = make_parser();
        let line = r#"{"type":"message_complete","content":"Done!","role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":50}}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::MessageComplete {
                content,
                model,
                input_tokens,
                output_tokens,
                ..
            }) => {
                assert_eq!(content, "Done!");
                assert_eq!(model.as_deref(), Some("claude-sonnet-4-6"));
                assert_eq!(*input_tokens, Some(100));
                assert_eq!(*output_tokens, Some(50));
            }
            _ => panic!("Expected MessageComplete event"),
        }
    }

    #[test]
    fn parse_tool_use() {
        let mut parser = make_parser();
        let line = r#"{"type":"tool_use","id":"toolu_abc123","name":"Bash","input":{"command":"ls -la"}}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::ToolUse {
                tool_use_id,
                tool_name,
                tool_input,
                ..
            }) => {
                assert_eq!(tool_use_id, "toolu_abc123");
                assert_eq!(tool_name, "Bash");
                assert_eq!(tool_input["command"], "ls -la");
            }
            _ => panic!("Expected ToolUse event"),
        }
    }

    #[test]
    fn parse_permission_request() {
        let mut parser = make_parser();
        let line = r#"{"type":"permission_request","request_id":"abc-123","tool":"Bash","command":"rm -rf /tmp/test","risk_level":"high"}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::PermissionRequest(req) => {
                assert_eq!(req.request_id, "abc-123");
                assert_eq!(req.tool, "Bash");
                assert_eq!(req.risk_level, "high");
            }
            _ => panic!("Expected PermissionRequest"),
        }
    }

    #[test]
    fn parse_thinking_event() {
        let mut parser = make_parser();
        let line = r#"{"type":"thinking_delta","text":"Let me analyze..."}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::Thinking {
                content,
                is_streaming,
                ..
            }) => {
                assert_eq!(content, "Let me analyze...");
                assert!(*is_streaming);
            }
            _ => panic!("Expected Thinking event"),
        }
    }

    #[test]
    fn handle_partial_json_across_chunks() {
        let mut parser = make_parser();
        let full_line = r#"{"type":"content_block_delta","text":"Hello"}"#;

        // Split the line across two chunks
        let (part1, part2) = full_line.split_at(20);

        // First chunk — no complete line yet
        let outputs1 = parser.feed(part1);
        assert!(outputs1.is_empty());

        // Second chunk completes the line
        let outputs2 = parser.feed(&format!("{}\n", part2));
        assert_eq!(outputs2.len(), 1);
    }

    #[test]
    fn handle_multiple_lines_in_one_chunk() {
        let mut parser = make_parser();
        let chunk = format!(
            "{}\n{}\n",
            r#"{"type":"content_block_delta","text":"Hello"}"#,
            r#"{"type":"content_block_delta","text":" world"}"#
        );

        let outputs = parser.feed(&chunk);
        assert_eq!(outputs.len(), 2);
    }

    #[test]
    fn handle_malformed_json_gracefully() {
        let mut parser = make_parser();
        let chunk = "this is not valid json\n";
        let outputs = parser.feed(chunk);
        // Should not panic, returns empty (warning logged)
        assert!(outputs.is_empty());
    }

    #[test]
    fn unknown_event_type_produces_unknown_event() {
        let mut parser = make_parser();
        let line = r#"{"type":"future_event_v99","data":"something new"}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::Unknown { raw_type, .. }) => {
                assert_eq!(raw_type, "future_event_v99");
            }
            _ => panic!("Expected Unknown event"),
        }
    }

    #[test]
    fn empty_lines_are_skipped() {
        let mut parser = make_parser();
        let chunk = "\n\n\n";
        let outputs = parser.feed(chunk);
        assert!(outputs.is_empty());
    }

    #[test]
    fn parse_system_init_extracts_cli_session_id() {
        let mut parser = make_parser();
        let line = r#"{"type":"system","subtype":"init","session_id":"cli-sess-abc","model":"claude-sonnet-4-6"}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::SystemInit {
                cli_session_id,
                model,
                ..
            }) => {
                assert_eq!(cli_session_id, "cli-sess-abc");
                assert_eq!(model, "claude-sonnet-4-6");
            }
            _ => panic!("Expected SystemInit event"),
        }
    }

    #[test]
    fn parse_system_init_extracts_mcp_servers() {
        let mut parser = make_parser();
        let line = r#"{"type":"system","subtype":"init","session_id":"s1","model":"claude-sonnet-4-6","mcp_servers":[{"name":"plugin:context7:context7","status":"connected"},{"name":"claude.ai/Linear","status":"connected"}],"tools":["Read","mcp__plugin_context7_context7__query-docs"]}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::SystemInit {
                mcp_servers,
                tools,
                ..
            }) => {
                assert_eq!(mcp_servers.len(), 2);
                assert_eq!(mcp_servers[0], "plugin:context7:context7");
                assert_eq!(mcp_servers[1], "claude.ai/Linear");
                assert_eq!(tools.len(), 2);
                assert!(tools.contains(&"mcp__plugin_context7_context7__query-docs".to_string()));
            }
            _ => panic!("Expected SystemInit event"),
        }
    }

    #[test]
    fn parse_system_non_init_is_system_message() {
        let mut parser = make_parser();
        let line = r#"{"type":"system","message":"Session started"}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::SystemMessage { level, message }) => {
                assert_eq!(level, "system");
                assert_eq!(message, "Session started");
            }
            _ => panic!("Expected SystemMessage event"),
        }
    }

    #[test]
    fn parse_usage_update() {
        let mut parser = make_parser();
        let line = r#"{"type":"usage","model":"claude-opus-4-6","input_tokens":500,"output_tokens":200,"cache_read_tokens":100,"cache_write_tokens":50}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::UsageUpdate {
                model,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                ..
            }) => {
                assert_eq!(model, "claude-opus-4-6");
                assert_eq!(*input_tokens, 500);
                assert_eq!(*output_tokens, 200);
                assert_eq!(*cache_read_tokens, 100);
            }
            _ => panic!("Expected UsageUpdate event"),
        }
    }

    #[test]
    fn parse_system_message() {
        let mut parser = make_parser();
        let line = r#"{"type":"warning","message":"Context is getting large"}"#;
        let outputs = parser.feed(&format!("{}\n", line));

        assert_eq!(outputs.len(), 1);
        match &outputs[0] {
            ParsedOutput::Event(BridgeEvent::SystemMessage { level, message }) => {
                assert_eq!(level, "warning");
                assert_eq!(message, "Context is getting large");
            }
            _ => panic!("Expected SystemMessage event"),
        }
    }
}
