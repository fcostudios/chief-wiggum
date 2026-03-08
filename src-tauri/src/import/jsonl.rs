//! Streaming JSONL parser for Claude Code session transcripts (CHI-302).
//!
//! Reads JSONL line-by-line via `BufRead` and tolerates malformed lines.

use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct JsonlUsage {
    #[serde(default, alias = "inputTokenCount")]
    pub input_tokens: Option<i64>,
    #[serde(default, alias = "outputTokenCount")]
    pub output_tokens: Option<i64>,
    #[serde(default, alias = "cache_read_tokens", alias = "cacheReadInputTokens")]
    pub cache_read_input_tokens: Option<i64>,
    #[serde(
        default,
        alias = "cache_write_tokens",
        alias = "cacheCreationInputTokens"
    )]
    pub cache_creation_input_tokens: Option<i64>,
    #[serde(default, alias = "thinkingTokenCount")]
    pub thinking_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JsonlMessage {
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub content: Option<JsonlContent>,
    #[serde(default)]
    pub usage: Option<JsonlUsage>,
    #[serde(default, alias = "stopReason")]
    pub stop_reason: Option<String>,
    #[serde(default, alias = "isError")]
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JsonlLine {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub subtype: Option<String>,

    #[serde(default)]
    pub uuid: Option<String>,
    #[serde(default, rename = "parentUuid")]
    pub parent_uuid: Option<String>,
    #[serde(default, rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(default, rename = "cliSessionId")]
    pub cli_session_id: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default, alias = "cliVersion")]
    pub version: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default, rename = "gitBranch")]
    pub git_branch: Option<String>,
    #[serde(default, rename = "isSidechain")]
    pub is_sidechain: Option<bool>,

    #[serde(default)]
    pub message: Option<JsonlMessage>,
    #[serde(default)]
    pub content: Option<JsonlContent>,
    #[serde(default)]
    pub usage: Option<JsonlUsage>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default, alias = "stopReason")]
    pub stop_reason: Option<String>,
    #[serde(default, alias = "isError")]
    pub is_error: Option<bool>,

    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub input: Option<Value>,
    #[serde(default, rename = "tool_use_id")]
    pub tool_use_id: Option<String>,

    #[serde(default)]
    pub tools: Option<Vec<Value>>,
    #[serde(default, rename = "mcp_servers")]
    pub mcp_servers: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonlContent {
    Text(String),
    Blocks(Vec<JsonlContentBlock>),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JsonlContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub input: Option<Value>,
    #[serde(default, rename = "tool_use_id")]
    pub tool_use_id: Option<String>,
    #[serde(default)]
    pub content: Option<Value>,
    #[serde(default, alias = "isError")]
    pub is_error: Option<bool>,
    #[serde(default)]
    pub source: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct MessageInsert {
    pub uuid: Option<String>,
    pub parent_uuid: Option<String>,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub usage: Option<JsonlUsage>,
    pub stop_reason: Option<String>,
    pub is_error: bool,
    pub is_compacted: bool,
    pub is_sidechain: bool,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct ToolUseRecord {
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct ToolResultRecord {
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct TokenAccumulator {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub thinking_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
}

impl TokenAccumulator {
    pub fn add_usage(&mut self, usage: &JsonlUsage) {
        self.input_tokens += usage.input_tokens.unwrap_or(0);
        self.output_tokens += usage.output_tokens.unwrap_or(0);
        self.thinking_tokens += usage.thinking_tokens.unwrap_or(0);
        self.cache_read_tokens += usage.cache_read_input_tokens.unwrap_or(0);
        self.cache_write_tokens += usage.cache_creation_input_tokens.unwrap_or(0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct JsonlSessionMetadata {
    pub cli_session_id: Option<String>,
    pub model: Option<String>,
    pub cli_version: Option<String>,
    pub tools: Vec<String>,
    pub mcp_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct JsonlParseWarning {
    pub line: usize,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct JsonlParseResult {
    pub session_id: Option<String>,
    pub metadata: JsonlSessionMetadata,
    pub messages: Vec<MessageInsert>,
    pub tool_uses: Vec<ToolUseRecord>,
    pub tool_results: Vec<ToolResultRecord>,
    pub token_totals: TokenAccumulator,
    pub warnings: Vec<JsonlParseWarning>,
    pub parsed_lines: usize,
    pub skipped_lines: usize,
    pub boundary_count: usize,
    pub sidechain_messages: usize,
}

pub fn parse_jsonl_file(path: &Path) -> AppResult<JsonlParseResult> {
    let file = File::open(path)?;
    parse_jsonl_reader(BufReader::new(file))
}

pub fn parse_jsonl_reader<R: BufRead>(reader: R) -> AppResult<JsonlParseResult> {
    let mut result = JsonlParseResult::default();
    let mut mark_next_compacted = false;

    for (idx, line_result) in reader.lines().enumerate() {
        let line_number = idx + 1;
        let line = line_result.map_err(AppError::Io)?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: JsonlLine = match serde_json::from_str(trimmed) {
            Ok(line) => line,
            Err(err) => {
                result.skipped_lines += 1;
                result.warnings.push(JsonlParseWarning {
                    line: line_number,
                    kind: "malformed_line".to_string(),
                    message: err.to_string(),
                });
                continue;
            }
        };

        result.parsed_lines += 1;
        if result.session_id.is_none() {
            result.session_id = parsed.session_id.clone();
        }

        if parsed.event_type == "system" {
            if parsed.subtype.as_deref() == Some("init") {
                if result.metadata.cli_session_id.is_none() {
                    result.metadata.cli_session_id = parsed
                        .cli_session_id
                        .clone()
                        .or_else(|| parsed.session_id.clone());
                }
                if result.metadata.model.is_none() {
                    result.metadata.model = parsed.model.clone();
                }
                if result.metadata.cli_version.is_none() {
                    result.metadata.cli_version = parsed.version.clone();
                }
                append_unique_strings(&mut result.metadata.tools, parsed.tools.as_ref());
                append_unique_strings(
                    &mut result.metadata.mcp_servers,
                    parsed.mcp_servers.as_ref(),
                );
            } else if parsed.subtype.as_deref() == Some("compact_boundary") {
                result.boundary_count += 1;
                mark_next_compacted = true;
            }
            continue;
        }

        if parsed.event_type == "usage" {
            if let Some(usage) = parsed.usage.as_ref() {
                result.token_totals.add_usage(usage);
            }
            continue;
        }

        if parsed.event_type == "tool_use" {
            if let Some(tool) = extract_top_level_tool_use(&parsed) {
                result.tool_uses.push(tool);
            }
            continue;
        }

        if parsed.event_type == "tool_result" {
            if let Some(tool) = extract_top_level_tool_result(&parsed) {
                result.tool_results.push(tool);
            }
            continue;
        }

        if !matches!(parsed.event_type.as_str(), "user" | "assistant" | "result") {
            continue;
        }

        let is_sidechain = parsed.is_sidechain.unwrap_or(false);
        if is_sidechain {
            result.sidechain_messages += 1;
        }

        let message = parsed.message.clone().unwrap_or_default();
        let role = message
            .role
            .clone()
            .unwrap_or_else(|| fallback_role_for_event(&parsed.event_type).to_string());
        let content_source = message.content.clone().or(parsed.content.clone());
        let (content, extracted_tools, extracted_results) =
            extract_content(content_source, line_number, &mut result.warnings);
        result.tool_uses.extend(extracted_tools);
        result.tool_results.extend(extracted_results);

        let usage = message.usage.clone().or(parsed.usage.clone());
        if let Some(usage_ref) = usage.as_ref() {
            result.token_totals.add_usage(usage_ref);
        }

        result.messages.push(MessageInsert {
            uuid: parsed.uuid.clone(),
            parent_uuid: parsed.parent_uuid.clone(),
            role,
            content,
            model: message.model.clone().or(parsed.model.clone()),
            usage,
            stop_reason: message.stop_reason.clone().or(parsed.stop_reason.clone()),
            is_error: message.is_error.or(parsed.is_error).unwrap_or_default(),
            is_compacted: mark_next_compacted,
            is_sidechain,
            timestamp: parsed.timestamp.clone(),
        });
        mark_next_compacted = false;
    }

    Ok(result)
}

fn fallback_role_for_event(event_type: &str) -> &str {
    match event_type {
        "assistant" | "result" => "assistant",
        "user" => "user",
        _ => "system",
    }
}

fn append_unique_strings(target: &mut Vec<String>, values: Option<&Vec<Value>>) {
    let Some(values) = values else { return };
    for value in values {
        let text = if let Some(s) = value.as_str() {
            Some(s.to_string())
        } else {
            value
                .get("name")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        };
        if let Some(text) = text {
            if !target.iter().any(|existing| existing == &text) {
                target.push(text);
            }
        }
    }
}

fn extract_top_level_tool_use(parsed: &JsonlLine) -> Option<ToolUseRecord> {
    let tool_use_id = parsed.id.clone().unwrap_or_default();
    if tool_use_id.is_empty() {
        return None;
    }
    Some(ToolUseRecord {
        tool_use_id,
        tool_name: parsed.name.clone().unwrap_or_else(|| "unknown".to_string()),
        tool_input: parsed.input.clone().unwrap_or(Value::Null),
    })
}

fn extract_top_level_tool_result(parsed: &JsonlLine) -> Option<ToolResultRecord> {
    let tool_use_id = parsed.tool_use_id.clone().unwrap_or_default();
    if tool_use_id.is_empty() {
        return None;
    }
    let content = parsed
        .content
        .clone()
        .map(content_to_string)
        .unwrap_or_default();
    Some(ToolResultRecord {
        tool_use_id,
        content,
        is_error: parsed.is_error.unwrap_or(false),
    })
}

fn extract_content(
    content: Option<JsonlContent>,
    line_number: usize,
    warnings: &mut Vec<JsonlParseWarning>,
) -> (String, Vec<ToolUseRecord>, Vec<ToolResultRecord>) {
    let mut text_parts = Vec::new();
    let mut tool_uses = Vec::new();
    let mut tool_results = Vec::new();

    let Some(content) = content else {
        return (String::new(), tool_uses, tool_results);
    };

    match content {
        JsonlContent::Text(text) => text_parts.push(text),
        JsonlContent::Blocks(blocks) => {
            for block in blocks {
                match block.block_type.as_str() {
                    "text" => {
                        if let Some(text) = block.text {
                            text_parts.push(text);
                        }
                    }
                    "thinking" => {
                        if let Some(thinking) = block.thinking {
                            text_parts.push(thinking);
                        }
                    }
                    "tool_use" => {
                        if let Some(tool_use_id) = block.id.clone() {
                            tool_uses.push(ToolUseRecord {
                                tool_use_id,
                                tool_name: block.name.unwrap_or_else(|| "unknown".to_string()),
                                tool_input: block.input.unwrap_or(Value::Null),
                            });
                        }
                    }
                    "tool_result" => {
                        if let Some(tool_use_id) = block.tool_use_id.clone() {
                            tool_results.push(ToolResultRecord {
                                tool_use_id,
                                content: block
                                    .content
                                    .as_ref()
                                    .map(|value| value_to_string(value.clone()))
                                    .unwrap_or_default(),
                                is_error: block.is_error.unwrap_or(false),
                            });
                        }
                    }
                    other if is_binary_block(other) || block_has_binary_source(&block) => {
                        warnings.push(JsonlParseWarning {
                            line: line_number,
                            kind: "binary_block".to_string(),
                            message: format!("Skipped binary content block type '{}'", other),
                        });
                    }
                    _ => {}
                }
            }
        }
    }

    (text_parts.join("\n"), tool_uses, tool_results)
}

fn is_binary_block(block_type: &str) -> bool {
    matches!(
        block_type,
        "image" | "document" | "pdf" | "file" | "video" | "audio"
    )
}

fn block_has_binary_source(block: &JsonlContentBlock) -> bool {
    let Some(source) = block.source.as_ref() else {
        return false;
    };
    source
        .get("media_type")
        .and_then(Value::as_str)
        .map(|media| {
            media.starts_with("image/")
                || media.starts_with("audio/")
                || media.starts_with("video/")
                || media == "application/pdf"
        })
        .unwrap_or(false)
}

fn content_to_string(content: JsonlContent) -> String {
    match content {
        JsonlContent::Text(text) => text,
        JsonlContent::Blocks(blocks) => blocks
            .into_iter()
            .map(|b| b.content.map_or_else(String::new, value_to_string))
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn value_to_string(value: Value) -> String {
    match value {
        Value::String(s) => s,
        Value::Array(values) => values
            .into_iter()
            .filter_map(|item| {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    return Some(text.to_string());
                }
                item.as_str().map(ToString::to_string)
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(map) => map
            .get("text")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| Value::Object(map).to_string()),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn parses_streaming_types_and_extracts_tools() {
        let input = r#"{"type":"system","subtype":"init","sessionId":"cli-s1","model":"claude-sonnet-4-6","version":"1.0.0","tools":["Read","Bash"],"mcp_servers":["plugin:context7:context7"]}
{"type":"system","subtype":"compact_boundary"}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"cli-s1","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"Hello"},{"type":"tool_use","id":"tu_1","name":"Read","input":{"file":"README.md"}}],"usage":{"input_tokens":10,"output_tokens":20,"thinking_tokens":3,"cache_read_input_tokens":2,"cache_creation_input_tokens":1},"stop_reason":"end_turn","is_error":false}}
{"type":"user","uuid":"u2","sessionId":"cli-s1","message":{"role":"user","content":"Thanks"}}
{"type":"user","uuid":"u3","sessionId":"cli-s1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_1","content":"OK","is_error":false}]}}
{"type":"usage","usage":{"input_tokens":2,"output_tokens":1}}
"#;
        let parsed = parse_jsonl_reader(Cursor::new(input)).expect("parse");

        assert_eq!(parsed.parsed_lines, 6);
        assert_eq!(parsed.skipped_lines, 0);
        assert_eq!(parsed.boundary_count, 1);
        assert_eq!(parsed.metadata.cli_session_id.as_deref(), Some("cli-s1"));
        assert_eq!(
            parsed.metadata.mcp_servers,
            vec!["plugin:context7:context7".to_string()]
        );
        assert_eq!(parsed.messages.len(), 3);
        assert!(parsed.messages[0].is_compacted);
        assert_eq!(parsed.messages[0].uuid.as_deref(), Some("a1"));
        assert_eq!(parsed.tool_uses.len(), 1);
        assert_eq!(parsed.tool_results.len(), 1);
        assert_eq!(parsed.token_totals.input_tokens, 12);
        assert_eq!(parsed.token_totals.output_tokens, 21);
        assert_eq!(parsed.token_totals.thinking_tokens, 3);
        assert_eq!(parsed.token_totals.cache_read_tokens, 2);
        assert_eq!(parsed.token_totals.cache_write_tokens, 1);
    }

    #[test]
    fn skips_malformed_lines_without_aborting() {
        let input = r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"ok"}}
not-json
{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":"done"}}
"#;
        let parsed = parse_jsonl_reader(Cursor::new(input)).expect("parse");
        assert_eq!(parsed.messages.len(), 2);
        assert_eq!(parsed.skipped_lines, 1);
        assert_eq!(parsed.warnings.len(), 1);
        assert_eq!(parsed.warnings[0].kind, "malformed_line");
    }

    #[test]
    fn warns_and_skips_binary_blocks() {
        let input = r#"{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"image","source":{"media_type":"image/png"}},{"type":"text","text":"caption"}]}}
"#;
        let parsed = parse_jsonl_reader(Cursor::new(input)).expect("parse");
        assert_eq!(parsed.messages.len(), 1);
        assert_eq!(parsed.messages[0].content, "caption");
        assert_eq!(parsed.warnings.len(), 1);
        assert_eq!(parsed.warnings[0].kind, "binary_block");
    }

    #[test]
    fn tracks_sidechain_messages() {
        let input = r#"{"type":"assistant","uuid":"a1","isSidechain":true,"message":{"role":"assistant","content":"hidden"}}
"#;
        let parsed = parse_jsonl_reader(Cursor::new(input)).expect("parse");
        assert_eq!(parsed.messages.len(), 1);
        assert_eq!(parsed.sidechain_messages, 1);
        assert!(parsed.messages[0].is_sidechain);
    }
}
