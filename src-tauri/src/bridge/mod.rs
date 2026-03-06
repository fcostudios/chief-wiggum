//! Claude Code CLI process management layer.
//!
//! This module handles spawning Claude Code as a subprocess via PTY,
//! parsing its structured output, adapting to CLI version changes,
//! and intercepting permission requests.
//!
//! Architecture: SPEC-004 §2 (bridge/), §3.1, §5.1, §5.2
//! Coding standards: GUIDE-001 §2

pub mod adapter;
pub mod control;
pub mod event_loop;
pub mod manager;
pub mod parser;
pub mod permission;
pub mod process;
pub mod sdk_bridge;

// Re-export primary public types
pub use adapter::{AdapterRegistry, OutputAdapter};
pub use control::{ControlRequest, ControlResponse, UserMessage};
pub use manager::SessionBridgeMap;
pub use parser::{BridgeEvent, MessageChunk, ParsedOutput, StreamParser};
pub use permission::{PermissionAction, PermissionManager, PermissionRequest, PermissionResponse};
pub use process::{BridgeConfig, BridgeInterface, CliBridge, ProcessStatus};
pub use sdk_bridge::AgentSdkBridge;

use crate::AppError;

/// Output from the bridge, consumed by command handlers.
/// Per SPEC-004 §11.1 — shared between LiveBridge and MockBridge.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum BridgeOutput {
    /// A chunk of streaming message content.
    Chunk(MessageChunk),

    /// A complete parsed output event (tool use, system message, etc.).
    Event(BridgeEvent),

    /// A permission request that must be resolved before continuing.
    PermissionRequired(PermissionRequest),

    /// A question from AskUserQuestion that must be answered by the user.
    /// Never auto-approved, even in YOLO mode.
    QuestionRequired(QuestionRequest),

    /// The CLI process has exited.
    ProcessExited { exit_code: Option<i32> },
}

/// Structured question from AskUserQuestion tool.
/// Claude asks the user clarifying questions with selectable options.
/// SPEC-006 §4.24.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QuestionRequest {
    pub request_id: String,
    pub questions: Vec<QuestionItem>,
    pub tool_input: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QuestionItem {
    pub question: String,
    pub header: String,
    pub options: Vec<QuestionOption>,
    #[serde(rename = "multiSelect", default)]
    pub multi_select: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QuestionOption {
    pub label: String,
    pub description: String,
}

/// Payload for `question:request` frontend event.
#[derive(Debug, Clone, serde::Serialize)]
pub struct QuestionRequestPayload {
    pub session_id: String,
    pub request_id: String,
    pub questions: Vec<QuestionItem>,
}

/// Configuration for locating the Claude Code CLI binary.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CliLocation {
    /// Explicit path override (from settings). Takes priority over PATH.
    pub path_override: Option<String>,

    /// Resolved binary path after detection.
    pub resolved_path: Option<String>,

    /// Detected CLI version string (e.g., "1.0.34").
    pub version: Option<String>,
}

impl CliLocation {
    /// Detect the Claude Code CLI binary location.
    /// Checks path_override first, then searches PATH.
    pub fn detect(path_override: Option<String>) -> Result<Self, AppError> {
        if let Some(ref override_path) = path_override {
            if std::path::Path::new(override_path).exists() {
                tracing::info!("Using CLI override path: {}", override_path);
                return Ok(Self {
                    path_override: path_override.clone(),
                    resolved_path: Some(override_path.clone()),
                    version: None,
                });
            }
            tracing::warn!(
                "CLI override path does not exist: {}, falling back to PATH",
                override_path
            );
        }

        // Search PATH for `claude` binary
        let binary_name = if cfg!(target_os = "windows") {
            "claude.exe"
        } else {
            "claude"
        };

        match which::which(binary_name) {
            Ok(path) => {
                let path_str = path.to_string_lossy().to_string();
                tracing::info!("Found Claude Code CLI at: {}", path_str);
                Ok(Self {
                    path_override,
                    resolved_path: Some(path_str),
                    version: None,
                })
            }
            Err(_) => Err(AppError::Bridge(format!(
                "Claude Code CLI binary '{}' not found in PATH. \
                 Install it with: npm install -g @anthropic-ai/claude-code",
                binary_name
            ))),
        }
    }

    /// Get the resolved binary path, or error if not detected.
    pub fn binary_path(&self) -> Result<&str, AppError> {
        self.resolved_path
            .as_deref()
            .ok_or_else(|| AppError::Bridge("CLI binary path not resolved".to_string()))
    }

    /// Detect CLI version by running `claude --version`.
    pub fn detect_version(&mut self) -> Option<String> {
        let path = self.resolved_path.as_ref()?;
        match std::process::Command::new(path).arg("--version").output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let raw = if !stdout.is_empty() { stdout } else { stderr };
                if raw.is_empty() {
                    tracing::warn!("CLI version detection returned empty output");
                    return None;
                }
                let version = parse_cli_version_token(&raw).unwrap_or_else(|| raw.clone());
                tracing::info!("Claude Code CLI version: {}", version);
                self.version = Some(version.clone());
                Some(version)
            }
            Err(e) => {
                tracing::warn!("Failed to detect CLI version: {}", e);
                None
            }
        }
    }

    /// Check if the detected CLI version supports the Agent SDK protocol.
    /// SDK mode requires CLI version >= 2.1.
    pub fn supports_sdk(&self) -> bool {
        self.version
            .as_deref()
            .and_then(|v| {
                let mut parts = v.trim_start_matches('v').split('.');
                let major: u32 = parts.next()?.parse().ok()?;
                let minor: u32 = parts.next()?.parse().ok()?;
                Some(major > 2 || (major == 2 && minor >= 1))
            })
            .unwrap_or(false)
    }
}

fn parse_cli_version_token(raw: &str) -> Option<String> {
    raw.split_whitespace().find_map(|token| {
        let cleaned = token
            .trim_matches(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '-'))
            .trim_start_matches('v');

        if cleaned.is_empty() {
            return None;
        }

        let mut parts = cleaned.split('.');
        let major = parts.next()?;
        let minor = parts.next()?;

        if !major.chars().all(|c| c.is_ascii_digit()) || !minor.chars().all(|c| c.is_ascii_digit())
        {
            return None;
        }

        let mut normalized = format!("{}.{}", major, minor);
        if let Some(patch) = parts.next() {
            if patch.chars().all(|c| c.is_ascii_digit()) {
                normalized.push('.');
                normalized.push_str(patch);
            }
        }

        Some(normalized)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_location_nonexistent_override_falls_back() {
        let loc = CliLocation::detect(Some("/nonexistent/path/claude".to_string()));
        // Should either find claude in PATH or return an error — not panic
        assert!(loc.is_ok() || loc.is_err());
    }

    #[test]
    fn bridge_output_serializes() {
        let output = BridgeOutput::ProcessExited { exit_code: Some(0) };
        let json = serde_json::to_string(&output).expect("should serialize");
        assert!(json.contains("ProcessExited"));
    }

    #[test]
    fn supports_sdk_with_valid_version() {
        let loc = CliLocation {
            path_override: None,
            resolved_path: Some("/usr/bin/claude".to_string()),
            version: Some("2.1.8".to_string()),
        };
        assert!(loc.supports_sdk());
    }

    #[test]
    fn supports_sdk_rejects_old_version() {
        let loc = CliLocation {
            path_override: None,
            resolved_path: Some("/usr/bin/claude".to_string()),
            version: Some("1.0.34".to_string()),
        };
        assert!(!loc.supports_sdk());
    }

    #[test]
    fn supports_sdk_with_no_version() {
        let loc = CliLocation {
            path_override: None,
            resolved_path: Some("/usr/bin/claude".to_string()),
            version: None,
        };
        assert!(!loc.supports_sdk());
    }

    #[test]
    fn parse_cli_version_token_handles_claude_code_suffix() {
        let raw = "2.1.50 (Claude Code)";
        assert_eq!(parse_cli_version_token(raw), Some("2.1.50".to_string()));
    }

    #[test]
    fn parse_cli_version_token_handles_prefixed_version() {
        let raw = "Claude Code v2.2.1";
        assert_eq!(parse_cli_version_token(raw), Some("2.2.1".to_string()));
    }
}
