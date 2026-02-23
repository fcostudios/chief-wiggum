//! Agent SDK bridge: pipe-based bidirectional JSONL transport (CHI-101).
//! Per SPEC-004 §5.6: uses --input-format stream-json for persistent sessions.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout};
use tokio::sync::{mpsc, oneshot, watch, Mutex, RwLock};

use super::control::{self, ControlRequest, ControlResponse, UserMessage};
use super::process::{BridgeConfig, BridgeInterface, ProcessStatus};
use super::{BridgeOutput, PermissionRequest, StreamParser};
use crate::{AppError, AppResult};

/// AgentSdkBridge: persistent CLI session with bidirectional JSONL protocol.
pub struct AgentSdkBridge {
    /// Write-locked stdin for sending JSONL messages to CLI.
    stdin: Arc<Mutex<ChildStdin>>,
    /// Channel to receive parsed output from the stdout reader task.
    output_rx: Mutex<mpsc::Receiver<BridgeOutput>>,
    /// Current process status.
    status: Arc<RwLock<ProcessStatus>>,
    /// Shutdown signal to background tasks.
    shutdown_tx: watch::Sender<bool>,
    /// Pending outbound control requests awaiting CLI responses.
    pending_requests: Arc<RwLock<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
    /// Configuration used to spawn this process.
    #[allow(dead_code)]
    config: BridgeConfig,
}

impl AgentSdkBridge {
    /// Spawn a new Claude Code CLI process in Agent SDK mode.
    pub async fn spawn(config: BridgeConfig) -> AppResult<Self> {
        let status = Arc::new(RwLock::new(ProcessStatus::Starting));

        let mut cmd = tokio::process::Command::new(&config.cli_path);
        cmd.args(["--output-format", "stream-json"]);
        cmd.args(["--input-format", "stream-json"]);
        cmd.args(["--verbose"]);
        cmd.args(["--permission-prompt-tool", "stdio"]);
        cmd.args(["--include-partial-messages"]);

        if let Some(ref model) = config.model {
            cmd.args(["--model", model]);
        }

        for arg in &config.extra_args {
            cmd.arg(arg);
        }

        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }

        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }
        // Avoid nested session detection when spawned from CW.
        cmd.env("CLAUDECODE", "");

        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Bridge(format!("Failed to spawn CLI in SDK mode: {}", e)))?;

        tracing::info!(
            "Spawned Claude Code CLI in SDK mode (pid: {:?}) | model: {:?} | cwd: {:?}",
            child.id(),
            config.model,
            config.working_dir
        );

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Bridge("Failed to capture CLI stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Bridge("Failed to capture CLI stdout".into()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Bridge("Failed to capture CLI stderr".into()))?;

        let stdin = Arc::new(Mutex::new(stdin));
        let pending_requests = Arc::new(RwLock::new(HashMap::new()));
        let (output_tx, output_rx) = mpsc::channel::<BridgeOutput>(256);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        {
            let status = Arc::clone(&status);
            let output_tx = output_tx.clone();
            let pending = Arc::clone(&pending_requests);
            let shutdown_rx = shutdown_rx.clone();
            tokio::spawn(async move {
                Self::stdout_reader(stdout, output_tx, pending, status, shutdown_rx).await;
            });
        }

        {
            let shutdown_rx = shutdown_rx.clone();
            tokio::spawn(async move {
                Self::stderr_reader(stderr, shutdown_rx).await;
            });
        }

        {
            let status = Arc::clone(&status);
            tokio::spawn(async move {
                Self::process_monitor(child, status, output_tx, shutdown_rx).await;
            });
        }

        let bridge = Self {
            stdin,
            output_rx: Mutex::new(output_rx),
            status,
            shutdown_tx,
            pending_requests,
            config,
        };

        bridge.initialize().await?;
        Ok(bridge)
    }

    /// Send the initialization control request and mark as running.
    async fn initialize(&self) -> AppResult<()> {
        let request_id = control::next_request_id();
        let init_req = ControlRequest::initialize(request_id);
        let value = serde_json::to_value(&init_req)
            .map_err(|e| AppError::Bridge(format!("Failed to serialize init request: {}", e)))?;
        self.write_jsonl_value(&value).await?;

        *self.status.write().await = ProcessStatus::Running;
        tracing::info!("AgentSdkBridge: initialization request sent");
        Ok(())
    }

    /// Write a JSON value as a JSONL line to CLI stdin.
    pub async fn write_jsonl_value(&self, value: &serde_json::Value) -> AppResult<()> {
        let line = serde_json::to_string(value)
            .map_err(|e| AppError::Bridge(format!("Failed to serialize JSONL: {}", e)))?;
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| AppError::Bridge(format!("Failed to write to stdin: {}", e)))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| AppError::Bridge(format!("Failed to write newline: {}", e)))?;
        stdin
            .flush()
            .await
            .map_err(|e| AppError::Bridge(format!("Failed to flush stdin: {}", e)))?;
        tracing::debug!("AgentSdkBridge stdin: {}", line);
        Ok(())
    }

    /// Send a user message (follow-up prompt) to the CLI.
    pub async fn send_user_message(&self, content: &str) -> AppResult<()> {
        let msg = UserMessage::new(content.to_string());
        let value = serde_json::to_value(&msg)
            .map_err(|e| AppError::Bridge(format!("Failed to serialize user message: {}", e)))?;
        self.write_jsonl_value(&value).await
    }

    /// Send a control response (permission decision) to the CLI.
    pub async fn send_control_response_message(
        &self,
        request_id: &str,
        allow: bool,
        reason: Option<String>,
    ) -> AppResult<()> {
        let resp = if allow {
            ControlResponse::allow(request_id.to_string())
        } else {
            ControlResponse::deny(request_id.to_string(), reason)
        };
        let value = serde_json::to_value(&resp).map_err(|e| {
            AppError::Bridge(format!("Failed to serialize control response: {}", e))
        })?;
        self.write_jsonl_value(&value).await
    }

    /// Send a control request and await the CLI's response.
    #[allow(dead_code)]
    pub async fn send_control_request(&self, request: ControlRequest) -> AppResult<serde_json::Value> {
        let request_id = request.request_id.clone();

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.write().await;
            pending.insert(request_id.clone(), tx);
        }

        let value = serde_json::to_value(&request)
            .map_err(|e| AppError::Bridge(format!("Failed to serialize control request: {}", e)))?;
        self.write_jsonl_value(&value).await?;

        match tokio::time::timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => Err(AppError::Bridge("Control request channel closed".into())),
            Err(_) => {
                let mut pending = self.pending_requests.write().await;
                pending.remove(&request_id);
                Err(AppError::Bridge(format!(
                    "Control request {} timed out after 30s",
                    request_id
                )))
            }
        }
    }

    async fn stdout_reader(
        stdout: ChildStdout,
        output_tx: mpsc::Sender<BridgeOutput>,
        pending_requests: Arc<RwLock<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
        status: Arc<RwLock<ProcessStatus>>,
        shutdown_rx: watch::Receiver<bool>,
    ) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut parser = StreamParser::new();

        loop {
            if *shutdown_rx.borrow() {
                tracing::debug!("AgentSdkBridge stdout reader: shutdown signal");
                break;
            }

            match lines.next_line().await {
                Ok(Some(line)) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    tracing::debug!(
                        "AgentSdkBridge stdout: {}",
                        &trimmed[..trimmed.len().min(500)]
                    );

                    match control::peek_message_type(trimmed) {
                        Some(ref t) if t == "control_response" => {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                if let Some(req_id) =
                                    json.get("request_id").and_then(|v| v.as_str())
                                {
                                    let mut pending = pending_requests.write().await;
                                    if let Some(tx) = pending.remove(req_id) {
                                        let _ = tx.send(json);
                                    } else {
                                        tracing::warn!(
                                            "Received control_response for unknown request_id: {}",
                                            req_id
                                        );
                                    }
                                }
                            }
                            continue;
                        }
                        Some(ref t) if t == "control_request" => {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                Self::handle_inbound_control_request(&json, &output_tx).await;
                            }
                            continue;
                        }
                        _ => {
                            let events = parser.feed(&format!("{}\n", trimmed));
                            for event in events {
                                let output = match event {
                                    super::parser::ParsedOutput::Chunk(chunk) => {
                                        BridgeOutput::Chunk(chunk)
                                    }
                                    super::parser::ParsedOutput::Event(evt) => {
                                        BridgeOutput::Event(evt)
                                    }
                                    super::parser::ParsedOutput::PermissionRequest(req) => {
                                        BridgeOutput::PermissionRequired(req)
                                    }
                                };
                                if output_tx.send(output).await.is_err() {
                                    tracing::debug!("AgentSdkBridge: output channel closed");
                                    return;
                                }
                            }
                        }
                    }
                }
                Ok(None) => {
                    tracing::info!("AgentSdkBridge stdout: EOF (process exited)");
                    break;
                }
                Err(e) => {
                    tracing::error!("AgentSdkBridge stdout read error: {}", e);
                    *status.write().await = ProcessStatus::Error(e.to_string());
                    break;
                }
            }
        }

        tracing::debug!("AgentSdkBridge stdout reader exiting");
    }

    async fn handle_inbound_control_request(
        json: &serde_json::Value,
        output_tx: &mpsc::Sender<BridgeOutput>,
    ) {
        let request_id = json
            .get("request_id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        match control::extract_control_subtype(json) {
            Some(ref subtype) if subtype == "can_use_tool" => {
                let request = json.get("request").cloned().unwrap_or_default();
                let tool_name = request
                    .get("tool_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let tool_input = request.get("input").cloned().unwrap_or_default();

                let command = tool_input
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let file_path = tool_input
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string);

                let risk_level = match tool_name.as_str() {
                    "Bash" => "high".to_string(),
                    "Write" | "Edit" | "NotebookEdit" => "medium".to_string(),
                    _ => "low".to_string(),
                };

                let perm_request = PermissionRequest {
                    request_id,
                    tool: tool_name,
                    command,
                    file_path,
                    risk_level,
                };

                tracing::info!(
                    "AgentSdkBridge: can_use_tool → PermissionRequired (tool: {}, command: {})",
                    perm_request.tool,
                    perm_request.command
                );

                let _ = output_tx.send(BridgeOutput::PermissionRequired(perm_request)).await;
            }
            Some(ref subtype) if subtype == "hook_callback" => {
                tracing::info!("AgentSdkBridge: hook_callback (request_id: {})", request_id);
            }
            Some(ref subtype) => {
                tracing::warn!("AgentSdkBridge: unknown inbound control subtype: {}", subtype);
            }
            None => {
                tracing::warn!("AgentSdkBridge: control_request missing subtype");
            }
        }
    }

    async fn stderr_reader(stderr: ChildStderr, shutdown_rx: watch::Receiver<bool>) {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        loop {
            if *shutdown_rx.borrow() {
                break;
            }
            match lines.next_line().await {
                Ok(Some(line)) => tracing::debug!("CLI stderr: {}", line),
                Ok(None) => break,
                Err(e) => {
                    tracing::debug!("AgentSdkBridge stderr read error: {}", e);
                    break;
                }
            }
        }
    }

    async fn process_monitor(
        mut child: Child,
        status: Arc<RwLock<ProcessStatus>>,
        output_tx: mpsc::Sender<BridgeOutput>,
        mut shutdown_rx: watch::Receiver<bool>,
    ) {
        tokio::select! {
            exit_result = child.wait() => {
                match exit_result {
                    Ok(exit_status) => {
                        let code = exit_status.code();
                        tracing::info!("AgentSdkBridge: CLI exited with code {:?}", code);
                        *status.write().await = ProcessStatus::Exited(code);
                        let _ = output_tx.send(BridgeOutput::ProcessExited { exit_code: code }).await;
                    }
                    Err(e) => {
                        tracing::error!("AgentSdkBridge: process wait error: {}", e);
                        *status.write().await = ProcessStatus::Error(e.to_string());
                    }
                }
            }
            changed = shutdown_rx.changed() => {
                if changed.is_ok() && *shutdown_rx.borrow() {
                    tracing::info!("AgentSdkBridge: shutdown signal, killing process");
                    let _ = child.kill().await;
                    *status.write().await = ProcessStatus::Exited(None);
                    let _ = output_tx.send(BridgeOutput::ProcessExited { exit_code: None }).await;
                }
            }
        }
    }
}

#[async_trait::async_trait]
impl BridgeInterface for AgentSdkBridge {
    async fn send(&self, input: &str) -> AppResult<()> {
        self.send_user_message(input).await
    }

    async fn send_control_response(
        &self,
        request_id: &str,
        allow: bool,
        reason: Option<String>,
    ) -> AppResult<()> {
        self.send_control_response_message(request_id, allow, reason)
            .await
    }

    async fn receive(&self) -> AppResult<Option<BridgeOutput>> {
        let mut rx = self.output_rx.lock().await;
        Ok(rx.recv().await)
    }

    async fn status(&self) -> ProcessStatus {
        self.status.read().await.clone()
    }

    async fn shutdown(&self) -> AppResult<()> {
        tracing::info!("AgentSdkBridge: initiating graceful shutdown");
        *self.status.write().await = ProcessStatus::ShuttingDown;

        let interrupt = ControlRequest::interrupt(control::next_request_id());
        if let Ok(value) = serde_json::to_value(&interrupt) {
            let _ = self.write_jsonl_value(&value).await;
        }

        tokio::time::sleep(Duration::from_secs(2)).await;

        let current = self.status.read().await.clone();
        if matches!(current, ProcessStatus::ShuttingDown) {
            self.kill().await?;
        }

        Ok(())
    }

    async fn kill(&self) -> AppResult<()> {
        tracing::info!("AgentSdkBridge: force killing process");
        let _ = self.shutdown_tx.send(true);
        *self.status.write().await = ProcessStatus::Exited(None);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_config_sdk_flags() {
        let config = BridgeConfig::default();
        assert_eq!(config.output_format, "stream-json");
    }

    #[tokio::test]
    async fn control_response_allow_serializes_correctly() {
        let bridge_stdin_input = ControlResponse::allow("req_1".to_string());
        let json = serde_json::to_string(&bridge_stdin_input).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "control_response");
        assert_eq!(parsed["request_id"], "req_1");
        assert_eq!(parsed["response"]["allow"], true);
    }

    #[tokio::test]
    async fn user_message_serializes_for_stdin() {
        let msg = UserMessage::new("What is 2+2?".to_string());
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "user");
        assert_eq!(parsed["message"]["role"], "user");
        assert_eq!(parsed["message"]["content"], "What is 2+2?");
    }

    #[tokio::test]
    async fn handle_can_use_tool_emits_permission_required() {
        let (tx, mut rx) = mpsc::channel::<BridgeOutput>(16);

        let json: serde_json::Value = serde_json::from_str(
            r#"{
                "type": "control_request",
                "request_id": "req_cli_42",
                "request": {
                    "subtype": "can_use_tool",
                    "tool_name": "Bash",
                    "input": { "command": "gh pr list" }
                }
            }"#,
        )
        .unwrap();

        AgentSdkBridge::handle_inbound_control_request(&json, &tx).await;

        let output = rx.recv().await.unwrap();
        match output {
            BridgeOutput::PermissionRequired(req) => {
                assert_eq!(req.request_id, "req_cli_42");
                assert_eq!(req.tool, "Bash");
                assert_eq!(req.command, "gh pr list");
                assert_eq!(req.risk_level, "high");
            }
            other => panic!("Expected PermissionRequired, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn handle_can_use_tool_read_is_low_risk() {
        let (tx, mut rx) = mpsc::channel::<BridgeOutput>(16);

        let json: serde_json::Value = serde_json::from_str(
            r#"{
                "type": "control_request",
                "request_id": "req_cli_43",
                "request": {
                    "subtype": "can_use_tool",
                    "tool_name": "Read",
                    "input": { "file_path": "/tmp/test.txt" }
                }
            }"#,
        )
        .unwrap();

        AgentSdkBridge::handle_inbound_control_request(&json, &tx).await;

        let output = rx.recv().await.unwrap();
        match output {
            BridgeOutput::PermissionRequired(req) => {
                assert_eq!(req.tool, "Read");
                assert_eq!(req.risk_level, "low");
                assert_eq!(req.file_path, Some("/tmp/test.txt".to_string()));
            }
            _ => panic!("Expected PermissionRequired"),
        }
    }

    #[tokio::test]
    async fn handle_write_is_medium_risk() {
        let (tx, mut rx) = mpsc::channel::<BridgeOutput>(16);

        let json: serde_json::Value = serde_json::from_str(
            r#"{
                "type": "control_request",
                "request_id": "req_44",
                "request": {
                    "subtype": "can_use_tool",
                    "tool_name": "Write",
                    "input": { "file_path": "/tmp/out.txt" }
                }
            }"#,
        )
        .unwrap();

        AgentSdkBridge::handle_inbound_control_request(&json, &tx).await;

        let output = rx.recv().await.unwrap();
        match output {
            BridgeOutput::PermissionRequired(req) => {
                assert_eq!(req.risk_level, "medium");
            }
            _ => panic!("Expected PermissionRequired"),
        }
    }
}
