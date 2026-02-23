//! PTY process spawning and lifecycle management for Claude Code CLI.
//!
//! Implements CHI-13: PTY process spawning.
//! Architecture: SPEC-004 §2 (bridge/process.rs), §5.1, §9.2
//! Standards: GUIDE-001 §2.4 (errors), §2.5 (async), §2.7 (testing)

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use tokio::sync::{mpsc, watch, Mutex, RwLock};

use super::parser::StreamParser;
use super::BridgeOutput;
use crate::{AppError, AppResult};

/// PTY read buffer size per SPEC-004 §9.2: "reads PTY output in 4KB chunks"
const PTY_BUFFER_SIZE: usize = 4096;

/// Maximum output buffer per agent per SPEC-004 §9.2: 10MB
const MAX_OUTPUT_BUFFER_BYTES: usize = 10 * 1024 * 1024;

/// Health check interval in milliseconds.
const HEALTH_CHECK_INTERVAL_MS: u64 = 5000;

/// Process status states per SPEC-003 §6 (agent lifecycle state machine).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ProcessStatus {
    /// Process has not been started yet.
    NotStarted,
    /// Process is starting (PTY allocated, waiting for first output).
    Starting,
    /// Process is running and responsive.
    Running,
    /// Process is shutting down gracefully.
    ShuttingDown,
    /// Process has exited with an optional exit code.
    Exited(Option<i32>),
    /// Process is in an error state.
    Error(String),
}

/// Configuration for spawning a Claude Code CLI process.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BridgeConfig {
    /// Path to the Claude Code CLI binary.
    pub cli_path: String,
    /// Model to use (passed as --model flag).
    pub model: Option<String>,
    /// Output format (default: stream-json for structured parsing).
    pub output_format: String,
    /// Working directory for the CLI process.
    pub working_dir: Option<String>,
    /// Additional CLI arguments.
    pub extra_args: Vec<String>,
    /// Environment variables to pass to the process.
    pub env_vars: HashMap<String, String>,
    /// PTY dimensions (columns, rows).
    pub pty_cols: u16,
    pub pty_rows: u16,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            cli_path: "claude".to_string(),
            model: None,
            output_format: "stream-json".to_string(),
            working_dir: None,
            extra_args: Vec::new(),
            env_vars: HashMap::new(),
            pty_cols: 120,
            pty_rows: 40,
        }
    }
}

/// Trait for bridge implementations per SPEC-004 §11.1.
/// Enables MockBridge for testing without the real CLI.
#[async_trait::async_trait]
pub trait BridgeInterface: Send + Sync {
    /// Whether this bridge supports the Agent SDK bidirectional control protocol.
    fn supports_sdk_protocol(&self) -> bool {
        false
    }

    /// Send input text to the CLI process (stdin).
    async fn send(&self, input: &str) -> AppResult<()>;

    /// Send a control protocol request to the CLI (SDK mode only).
    async fn send_control_request(
        &self,
        _request: crate::bridge::control::ControlRequest,
    ) -> AppResult<()> {
        Err(AppError::Bridge(
            "Control protocol requests are not supported by this bridge".to_string(),
        ))
    }

    /// Send a control protocol permission response to the CLI (SDK mode only).
    ///
    /// Legacy PTY bridges do not support the bidirectional SDK control protocol
    /// and return an error by default.
    async fn send_control_response(
        &self,
        _request_id: &str,
        _allow: bool,
        _reason: Option<String>,
        _updated_input: Option<serde_json::Map<String, serde_json::Value>>,
    ) -> AppResult<()> {
        Err(AppError::Bridge(
            "Control protocol responses are not supported by this bridge".to_string(),
        ))
    }

    /// Receive the next output from the CLI process.
    async fn receive(&self) -> AppResult<Option<BridgeOutput>>;

    /// Get the current process status.
    async fn status(&self) -> ProcessStatus;

    /// Gracefully shut down the CLI process.
    async fn shutdown(&self) -> AppResult<()>;

    /// Force kill the CLI process.
    async fn kill(&self) -> AppResult<()>;
}

/// Live bridge implementation using a real PTY process.
pub struct CliBridge {
    /// Channel to send input to the PTY writer thread.
    input_tx: mpsc::Sender<String>,
    /// Channel to receive parsed output from the PTY reader thread.
    output_rx: Mutex<mpsc::Receiver<BridgeOutput>>,
    /// Current process status, observable by multiple consumers.
    status: Arc<RwLock<ProcessStatus>>,
    /// Watch channel to signal shutdown to background threads.
    shutdown_tx: watch::Sender<bool>,
    /// Configuration used to spawn this process.
    #[allow(dead_code)]
    config: BridgeConfig,
}

impl CliBridge {
    /// Spawn a new Claude Code CLI process on a PTY.
    ///
    /// Uses a pseudo-terminal so Node.js uses line-buffered stdout (not full
    /// buffering as with pipes). The `-p` flag prevents TUI rendering even
    /// though stdout is a TTY, giving us immediate streaming JSON output.
    ///
    /// # Errors
    ///
    /// Returns `AppError::Bridge` if:
    /// - PTY allocation fails
    /// - CLI binary cannot be found or executed
    /// - Thread spawning fails
    pub async fn spawn(config: BridgeConfig) -> AppResult<Self> {
        let status = Arc::new(RwLock::new(ProcessStatus::Starting));

        // Allocate a PTY pair. The slave side becomes the child's stdin/stdout/stderr.
        // Using a PTY ensures Node.js sees a TTY and uses line buffering, so we get
        // streaming JSON output immediately instead of buffered silence.
        let pty_system = portable_pty::native_pty_system();
        let pair = pty_system
            .openpty(portable_pty::PtySize {
                rows: config.pty_rows,
                cols: config.pty_cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Bridge(format!("Failed to create PTY: {}", e)))?;

        // Build CLI command via CommandBuilder
        let mut cmd = portable_pty::CommandBuilder::new(&config.cli_path);

        // Add output format flag for structured parsing
        cmd.args(["--output-format", &config.output_format]);

        // Add model flag if specified
        if let Some(ref model) = config.model {
            cmd.args(["--model", model]);
        }

        // Add extra arguments
        for arg in &config.extra_args {
            cmd.arg(arg);
        }

        // Set working directory
        if let Some(ref dir) = config.working_dir {
            cmd.cwd(dir);
        }

        // Set environment variables
        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }

        // Clear CLAUDECODE env var to prevent "nested session" detection.
        // Empty string is falsy in JS, bypassing the truthiness check.
        cmd.env("CLAUDECODE", "");

        // Spawn the child process on the slave side of the PTY
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Bridge(format!("Failed to spawn CLI process: {}", e)))?;

        let pid = child.process_id();
        tracing::info!(
            "Spawned Claude Code CLI (pid: {:?}) via PTY | cmd: {} --output-format {} --model {:?} {:?} | cwd: {:?}",
            pid,
            config.cli_path,
            config.output_format,
            config.model,
            config.extra_args,
            config.working_dir
        );

        // Drop the slave — the child process holds its own handle to it
        drop(pair.slave);

        // Set up channels
        let (output_tx, output_rx) = mpsc::channel::<BridgeOutput>(256);
        let (input_tx, input_rx) = mpsc::channel::<String>(64);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        // Clone reader from PTY master (dup'd file descriptor — independent of master lifetime)
        let reader: Box<dyn Read + Send> = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Bridge(format!("Failed to get PTY reader: {}", e)))?;

        let reader_status = Arc::clone(&status);
        let reader_shutdown = shutdown_rx.clone();
        let reader_output_tx = output_tx.clone();

        std::thread::Builder::new()
            .name("cli-reader".to_string())
            .spawn(move || {
                Self::pty_reader_loop(reader, reader_output_tx, reader_status, reader_shutdown);
            })
            .map_err(|e| AppError::Bridge(format!("Failed to spawn reader thread: {}", e)))?;

        // Take writer from PTY master (moved out — independent of master lifetime)
        let writer: Box<dyn Write + Send> = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Bridge(format!("Failed to get PTY writer: {}", e)))?;

        let writer_shutdown = shutdown_rx.clone();

        std::thread::Builder::new()
            .name("cli-writer".to_string())
            .spawn(move || {
                Self::pty_writer_loop(writer, input_rx, writer_shutdown);
            })
            .map_err(|e| AppError::Bridge(format!("Failed to spawn writer thread: {}", e)))?;

        // Spawn process monitor task
        let monitor_status = Arc::clone(&status);
        let monitor_output_tx = output_tx;
        let monitor_shutdown = shutdown_rx;

        tokio::spawn(async move {
            Self::pty_process_monitor(child, monitor_status, monitor_output_tx, monitor_shutdown)
                .await;
        });

        // Mark as running
        *status.write().await = ProcessStatus::Running;

        Ok(Self {
            input_tx,
            output_rx: Mutex::new(output_rx),
            status,
            shutdown_tx,
            config,
        })
    }

    /// Background thread: reads PTY stdout in chunks and sends parsed output.
    /// Per SPEC-004 §9.2: reads in 4KB chunks, parser operates on chunks.
    fn pty_reader_loop(
        mut reader: Box<dyn Read + Send>,
        output_tx: mpsc::Sender<BridgeOutput>,
        status: Arc<RwLock<ProcessStatus>>,
        shutdown_rx: watch::Receiver<bool>,
    ) {
        let mut buffer = vec![0u8; PTY_BUFFER_SIZE];
        let mut parser = StreamParser::new();
        let mut total_bytes: usize = 0;

        loop {
            // Check shutdown signal (non-blocking in sync context)
            if *shutdown_rx.borrow() {
                tracing::debug!("PTY reader: shutdown signal received");
                break;
            }

            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF — process has closed stdout
                    tracing::info!("PTY reader: EOF reached");
                    break;
                }
                Ok(n) => {
                    total_bytes += n;

                    // Enforce memory limit per SPEC-004 §9.2
                    if total_bytes > MAX_OUTPUT_BUFFER_BYTES {
                        tracing::warn!(
                            "CLI reader: output buffer exceeded {}MB limit, flushing older data",
                            MAX_OUTPUT_BUFFER_BYTES / (1024 * 1024)
                        );
                        total_bytes = n;
                    }

                    let chunk = &buffer[..n];
                    let raw_text = String::from_utf8_lossy(chunk);

                    // Log raw data for debugging
                    tracing::debug!("CLI reader: received {} bytes (total: {})", n, total_bytes);
                    // Log first 1500 chars of each chunk for visibility.
                    // Error results from the CLI can be very long — we need
                    // enough to see the error message, not just the usage block.
                    let preview: String = raw_text.chars().take(1500).collect();
                    if raw_text.len() > 1500 {
                        tracing::info!(
                            "CLI stdout (truncated {}/{}): {}",
                            1500,
                            raw_text.len(),
                            preview
                        );
                    } else {
                        tracing::info!("CLI stdout: {}", preview);
                    }

                    // Parse the chunk into events
                    let events = parser.feed(&raw_text);

                    if events.is_empty() {
                        tracing::debug!("CLI reader: no events parsed from chunk");
                    }

                    for event in events {
                        let output = match event {
                            super::parser::ParsedOutput::Chunk(ref chunk) => {
                                tracing::info!(
                                    "CLI parsed: Chunk (content len: {})",
                                    chunk.content.len()
                                );
                                BridgeOutput::Chunk(chunk.clone())
                            }
                            super::parser::ParsedOutput::Event(ref evt) => {
                                tracing::info!("CLI parsed: Event {:?}", evt);
                                BridgeOutput::Event(evt.clone())
                            }
                            super::parser::ParsedOutput::PermissionRequest(ref req) => {
                                tracing::info!("CLI parsed: PermissionRequest {:?}", req);
                                BridgeOutput::PermissionRequired(req.clone())
                            }
                        };

                        if output_tx.blocking_send(output).is_err() {
                            tracing::debug!("CLI reader: output channel closed");
                            return;
                        }
                    }
                }
                Err(e) => {
                    // On Windows, a broken pipe is expected when the process exits
                    if e.kind() == std::io::ErrorKind::BrokenPipe
                        || e.kind() == std::io::ErrorKind::UnexpectedEof
                    {
                        tracing::info!("PTY reader: pipe closed (process likely exited)");
                    } else {
                        tracing::error!("PTY reader error: {}", e);
                        // Update status to error (best-effort from sync context)
                        let status_clone = Arc::clone(&status);
                        let _ = std::thread::spawn(move || {
                            let rt = tokio::runtime::Handle::try_current();
                            if let Ok(handle) = rt {
                                handle.block_on(async {
                                    *status_clone.write().await =
                                        ProcessStatus::Error(e.to_string());
                                });
                            }
                        });
                    }
                    break;
                }
            }
        }

        tracing::debug!(
            "PTY reader thread exiting (total bytes read: {})",
            total_bytes
        );
    }

    /// Background thread: writes user input to PTY stdin.
    fn pty_writer_loop(
        mut writer: Box<dyn Write + Send>,
        mut input_rx: mpsc::Receiver<String>,
        shutdown_rx: watch::Receiver<bool>,
    ) {
        loop {
            // Use blocking recv since we're on a dedicated OS thread
            match input_rx.blocking_recv() {
                Some(input) => {
                    if *shutdown_rx.borrow() {
                        tracing::debug!("CLI writer: shutdown signal received");
                        break;
                    }

                    tracing::info!("CLI writer: sending {} bytes to stdin", input.len());
                    if let Err(e) = writer.write_all(input.as_bytes()) {
                        tracing::error!("CLI writer error: {}", e);
                        break;
                    }
                    if let Err(e) = writer.flush() {
                        tracing::error!("CLI writer flush error: {}", e);
                        break;
                    }
                    tracing::info!("CLI writer: flushed successfully");
                }
                None => {
                    tracing::debug!("PTY writer: input channel closed");
                    break;
                }
            }
        }

        tracing::debug!("PTY writer thread exiting");
    }

    /// Async task: monitors process health and detects exit.
    async fn pty_process_monitor(
        mut child: Box<dyn portable_pty::Child + Send + Sync>,
        status: Arc<RwLock<ProcessStatus>>,
        output_tx: mpsc::Sender<BridgeOutput>,
        mut shutdown_rx: watch::Receiver<bool>,
    ) {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(HEALTH_CHECK_INTERVAL_MS)) => {
                    match child.try_wait() {
                        Ok(Some(exit_status)) => {
                            let exit_code = if exit_status.success() { Some(0) } else { Some(1) };
                            tracing::info!("Claude Code CLI exited with status: {:?} (success: {})", exit_code, exit_status.success());

                            *status.write().await = ProcessStatus::Exited(exit_code);
                            let _ = output_tx.send(BridgeOutput::ProcessExited { exit_code }).await;
                            return;
                        }
                        Ok(None) => {
                            // Still running — continue monitoring
                        }
                        Err(e) => {
                            tracing::error!("Process monitor: failed to check status: {}", e);
                            *status.write().await = ProcessStatus::Error(e.to_string());
                            return;
                        }
                    }
                }
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        tracing::info!("Process monitor: shutdown signal, killing process");
                        let _ = child.kill();
                        *status.write().await = ProcessStatus::Exited(None);
                        let _ = output_tx.send(BridgeOutput::ProcessExited { exit_code: None }).await;
                        return;
                    }
                }
            }
        }
    }
}

#[async_trait::async_trait]
impl BridgeInterface for CliBridge {
    fn supports_sdk_protocol(&self) -> bool {
        false
    }

    async fn send(&self, input: &str) -> AppResult<()> {
        self.input_tx
            .send(input.to_string())
            .await
            .map_err(|e| AppError::Bridge(format!("Failed to send input: {}", e)))
    }

    async fn receive(&self) -> AppResult<Option<BridgeOutput>> {
        let mut rx = self.output_rx.lock().await;
        Ok(rx.recv().await)
    }

    async fn status(&self) -> ProcessStatus {
        self.status.read().await.clone()
    }

    async fn shutdown(&self) -> AppResult<()> {
        tracing::info!("Initiating graceful shutdown of Claude Code CLI");
        *self.status.write().await = ProcessStatus::ShuttingDown;

        // Send Ctrl+C equivalent
        self.input_tx
            .send("\x03".to_string())
            .await
            .map_err(|e| AppError::Bridge(format!("Failed to send interrupt: {}", e)))?;

        // Wait a bit for graceful exit
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        // If still running, force kill
        let current_status = self.status.read().await.clone();
        if matches!(current_status, ProcessStatus::ShuttingDown) {
            tracing::warn!("Graceful shutdown timed out, forcing kill");
            self.kill().await?;
        }

        Ok(())
    }

    async fn kill(&self) -> AppResult<()> {
        tracing::info!("Force killing Claude Code CLI process");
        // Signal shutdown to all background threads
        let _ = self.shutdown_tx.send(true);
        *self.status.write().await = ProcessStatus::Exited(None);
        Ok(())
    }
}

/// Mock bridge for testing without the real Claude Code CLI.
/// Per SPEC-004 §11.1: replays recorded CLI interactions.
pub struct MockBridge {
    /// Pre-loaded outputs to replay.
    outputs: Mutex<Vec<BridgeOutput>>,
    /// Captured inputs for assertion.
    inputs: Mutex<Vec<String>>,
    /// Current status.
    status: RwLock<ProcessStatus>,
}

impl MockBridge {
    /// Create a new mock bridge with pre-loaded outputs.
    pub fn new(outputs: Vec<BridgeOutput>) -> Self {
        Self {
            outputs: Mutex::new(outputs),
            inputs: Mutex::new(Vec::new()),
            status: RwLock::new(ProcessStatus::Running),
        }
    }

    /// Get all captured inputs for test assertions.
    pub async fn captured_inputs(&self) -> Vec<String> {
        self.inputs.lock().await.clone()
    }
}

#[async_trait::async_trait]
impl BridgeInterface for MockBridge {
    fn supports_sdk_protocol(&self) -> bool {
        false
    }

    async fn send(&self, input: &str) -> AppResult<()> {
        self.inputs.lock().await.push(input.to_string());
        Ok(())
    }

    async fn receive(&self) -> AppResult<Option<BridgeOutput>> {
        let mut outputs = self.outputs.lock().await;
        if outputs.is_empty() {
            Ok(None)
        } else {
            Ok(Some(outputs.remove(0)))
        }
    }

    async fn status(&self) -> ProcessStatus {
        self.status.read().await.clone()
    }

    async fn shutdown(&self) -> AppResult<()> {
        *self.status.write().await = ProcessStatus::Exited(Some(0));
        Ok(())
    }

    async fn kill(&self) -> AppResult<()> {
        *self.status.write().await = ProcessStatus::Exited(None);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::parser::MessageChunk;
    use super::*;

    #[tokio::test]
    async fn mock_bridge_replays_outputs() {
        let outputs = vec![
            BridgeOutput::Chunk(MessageChunk {
                session_id: "test-session".to_string(),
                content: "Hello".to_string(),
                token_count: Some(1),
            }),
            BridgeOutput::ProcessExited { exit_code: Some(0) },
        ];

        let bridge = MockBridge::new(outputs);

        // First receive should return the chunk
        let first = bridge.receive().await.unwrap();
        assert!(matches!(first, Some(BridgeOutput::Chunk(_))));

        // Second receive should return process exited
        let second = bridge.receive().await.unwrap();
        assert!(matches!(second, Some(BridgeOutput::ProcessExited { .. })));

        // Third should return None (exhausted)
        let third = bridge.receive().await.unwrap();
        assert!(third.is_none());
    }

    #[tokio::test]
    async fn mock_bridge_captures_inputs() {
        let bridge = MockBridge::new(vec![]);

        bridge.send("Hello Claude").await.unwrap();
        bridge.send("What is 2+2?").await.unwrap();

        let inputs = bridge.captured_inputs().await;
        assert_eq!(inputs.len(), 2);
        assert_eq!(inputs[0], "Hello Claude");
        assert_eq!(inputs[1], "What is 2+2?");
    }

    #[tokio::test]
    async fn mock_bridge_shutdown_changes_status() {
        let bridge = MockBridge::new(vec![]);

        assert_eq!(bridge.status().await, ProcessStatus::Running);

        bridge.shutdown().await.unwrap();
        assert_eq!(bridge.status().await, ProcessStatus::Exited(Some(0)));
    }

    #[tokio::test]
    async fn mock_bridge_kill_changes_status() {
        let bridge = MockBridge::new(vec![]);

        bridge.kill().await.unwrap();
        assert_eq!(bridge.status().await, ProcessStatus::Exited(None));
    }

    #[test]
    fn bridge_config_default_values() {
        let config = BridgeConfig::default();
        assert_eq!(config.cli_path, "claude");
        assert_eq!(config.output_format, "stream-json");
        assert_eq!(config.pty_cols, 120);
        assert_eq!(config.pty_rows, 40);
        assert!(config.model.is_none());
        assert!(config.extra_args.is_empty());
    }

    #[test]
    fn process_status_serializes() {
        let status = ProcessStatus::Running;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"Running\"");

        let status = ProcessStatus::Exited(Some(0));
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("Exited"));
    }
}
