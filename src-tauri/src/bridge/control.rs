//! Agent SDK control protocol types (CHI-101).
//! Per SPEC-004 §5.6: bidirectional JSONL control messages.

use serde::{Deserialize, Serialize};

/// Outbound control request (CW → CLI via stdin).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlRequest {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub request_id: String,
    pub request: ControlRequestBody,
}

/// Body of an outbound control request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "subtype")]
pub enum ControlRequestBody {
    #[serde(rename = "initialize")]
    Initialize,
    #[serde(rename = "set_model")]
    SetModel { model: String },
    #[serde(rename = "set_permission_mode")]
    SetPermissionMode { mode: String },
    #[serde(rename = "interrupt")]
    Interrupt,
}

/// Outbound control response (CW → CLI via stdin, answering can_use_tool).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub response: ControlResponseEnvelope,
}

/// SDK envelope for an outbound control response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponseEnvelope {
    pub subtype: String,
    pub request_id: String,
    pub response: ControlResponseBody,
}

/// Body of an outbound control response (permission decision).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponseBody {
    pub behavior: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Inbound control request from CLI (CLI → CW on stdout).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboundControlRequest {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub request_id: String,
    pub request: serde_json::Value,
}

/// User message written to CLI stdin for follow-up prompts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub message: UserMessageBody,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessageBody {
    pub role: String,
    pub content: String,
}

impl ControlRequest {
    /// Create an initialize control request.
    pub fn initialize(request_id: String) -> Self {
        Self {
            msg_type: "control_request".to_string(),
            request_id,
            request: ControlRequestBody::Initialize,
        }
    }

    /// Create a set_model control request.
    pub fn set_model(request_id: String, model: String) -> Self {
        Self {
            msg_type: "control_request".to_string(),
            request_id,
            request: ControlRequestBody::SetModel { model },
        }
    }

    /// Create an interrupt control request.
    pub fn interrupt(request_id: String) -> Self {
        Self {
            msg_type: "control_request".to_string(),
            request_id,
            request: ControlRequestBody::Interrupt,
        }
    }
}

impl ControlResponse {
    /// Create a permission allow response.
    pub fn allow(request_id: String) -> Self {
        Self {
            msg_type: "control_response".to_string(),
            response: ControlResponseEnvelope {
                subtype: "success".to_string(),
                request_id,
                response: ControlResponseBody {
                    behavior: "allow".to_string(),
                    message: None,
                },
            },
        }
    }

    /// Create a permission deny response.
    pub fn deny(request_id: String, reason: Option<String>) -> Self {
        Self {
            msg_type: "control_response".to_string(),
            response: ControlResponseEnvelope {
                subtype: "success".to_string(),
                request_id,
                response: ControlResponseBody {
                    behavior: "deny".to_string(),
                    message: reason,
                },
            },
        }
    }
}

impl UserMessage {
    /// Create a user message for follow-up prompts.
    pub fn new(content: String) -> Self {
        Self {
            msg_type: "user".to_string(),
            message: UserMessageBody {
                role: "user".to_string(),
                content,
            },
        }
    }
}

/// Generate a unique request ID for outbound control messages.
pub fn next_request_id() -> String {
    format!(
        "cw_{}",
        uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0")
    )
}

/// Parse an inbound line to check if it's a control message.
/// Returns Some(type_str) if the line is valid JSON with a "type" field.
pub fn peek_message_type(line: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    value
        .get("type")
        .and_then(|t| t.as_str())
        .map(ToString::to_string)
}

/// Extract the subtype from an inbound control_request JSON value.
pub fn extract_control_subtype(json: &serde_json::Value) -> Option<String> {
    json.pointer("/request/subtype")
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
}

/// Extract request_id from an inbound control_response JSON value.
/// Supports both nested SDK envelope shape and a legacy top-level request_id shape.
pub fn extract_control_response_request_id(json: &serde_json::Value) -> Option<String> {
    json.pointer("/response/request_id")
        .or_else(|| json.get("request_id"))
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_request_serializes() {
        let req = ControlRequest::initialize("req_1".to_string());
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"type\":\"control_request\""));
        assert!(json.contains("\"request_id\":\"req_1\""));
        assert!(json.contains("\"subtype\":\"initialize\""));
    }

    #[test]
    fn set_model_request_serializes() {
        let req = ControlRequest::set_model("req_2".to_string(), "claude-opus-4-6".to_string());
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"subtype\":\"set_model\""));
        assert!(json.contains("claude-opus-4-6"));
    }

    #[test]
    fn allow_response_serializes() {
        let resp = ControlResponse::allow("req_cli_1".to_string());
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"type\":\"control_response\""));
        assert!(json.contains("\"subtype\":\"success\""));
        assert!(json.contains("\"request_id\":\"req_cli_1\""));
        assert!(json.contains("\"behavior\":\"allow\""));
        assert!(!json.contains("\"message\""));
    }

    #[test]
    fn deny_response_serializes() {
        let resp = ControlResponse::deny("req_cli_2".to_string(), Some("User denied".to_string()));
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"behavior\":\"deny\""));
        assert!(json.contains("User denied"));
    }

    #[test]
    fn user_message_serializes() {
        let msg = UserMessage::new("Hello Claude".to_string());
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"user\""));
        assert!(json.contains("\"role\":\"user\""));
        assert!(json.contains("Hello Claude"));
    }

    #[test]
    fn peek_message_type_parses_control_request() {
        let line = r#"{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool"}}"#;
        assert_eq!(peek_message_type(line), Some("control_request".to_string()));
    }

    #[test]
    fn peek_message_type_parses_system() {
        let line = r#"{"type":"system","subtype":"init","session_id":"abc"}"#;
        assert_eq!(peek_message_type(line), Some("system".to_string()));
    }

    #[test]
    fn peek_message_type_returns_none_for_invalid() {
        assert_eq!(peek_message_type("not json"), None);
        assert_eq!(peek_message_type(r#"{"no_type": true}"#), None);
    }

    #[test]
    fn extract_control_subtype_works() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Bash"}}"#,
        )
        .unwrap();
        assert_eq!(
            extract_control_subtype(&json),
            Some("can_use_tool".to_string())
        );
    }

    #[test]
    fn next_request_id_is_unique() {
        let id1 = next_request_id();
        let id2 = next_request_id();
        assert_ne!(id1, id2);
        assert!(id1.starts_with("cw_"));
    }

    #[test]
    fn extract_control_response_request_id_supports_nested_shape() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"type":"control_response","response":{"subtype":"success","request_id":"cw_123","response":{"behavior":"allow"}}}"#,
        )
        .unwrap();
        assert_eq!(
            extract_control_response_request_id(&json),
            Some("cw_123".to_string())
        );
    }

    #[test]
    fn extract_control_response_request_id_supports_legacy_shape() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"type":"control_response","request_id":"cw_456"}"#).unwrap();
        assert_eq!(
            extract_control_response_request_id(&json),
            Some("cw_456".to_string())
        );
    }
}
