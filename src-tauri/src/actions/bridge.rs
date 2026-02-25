//! PTY process runner for project actions (CHI-140).
//!
//! Simplified version of bridge/process.rs — runs arbitrary shell commands
//! with streaming line output. No stream-json parsing needed.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use tokio::sync::{mpsc, watch, Mutex, RwLock};

use crate::{AppError, AppResult};

/// Read buffer size for PTY output.
const PTY_BUFFER_SIZE: usize = 4096;

/// Action process status.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    Starting,
    Running,
    Completed,
    Failed,
    Stopped,
}

/// A line of output from an action process.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActionOutput {
    /// The output line content (may include ANSI escapes).
    pub line: String,
    /// Whether this line came from stderr (heuristic — PTY merges streams).
    pub is_error: bool,
}

/// Messages from the action bridge to consumers.
#[derive(Debug, Clone)]
pub enum ActionBridgeOutput {
    /// A line of output.
    Output(ActionOutput),
    /// Process has exited.
    Exited { exit_code: Option<i32> },
}

/// Configuration for spawning an action process.
#[derive(Debug, Clone)]
pub struct ActionBridgeConfig {
    /// Shell command to execute.
    pub command: String,
    /// Working directory.
    pub working_dir: String,
    /// Environment variables.
    pub env_vars: HashMap<String, String>,
    /// PTY dimensions.
    pub pty_cols: u16,
    pub pty_rows: u16,
}

impl Default for ActionBridgeConfig {
    fn default() -> Self {
        Self {
            command: String::new(),
            working_dir: String::new(),
            env_vars: HashMap::new(),
            pty_cols: 120,
            pty_rows: 40,
        }
    }
}

/// PTY-based process runner for actions.
pub struct ActionBridge {
    /// Reserved for future stdin support (restart/interactive actions).
    #[allow(dead_code)]
    input_tx: mpsc::Sender<String>,
    /// Channel to receive output lines.
    output_rx: Mutex<mpsc::Receiver<ActionBridgeOutput>>,
    /// Current status.
    status: Arc<RwLock<ActionStatus>>,
    /// Shutdown signal.
    shutdown_tx: watch::Sender<bool>,
}

impl ActionBridge {
    /// Spawn a new action process on a PTY.
    pub fn spawn(config: ActionBridgeConfig) -> AppResult<Self> {
        use portable_pty::PtySize;

        let pty_system = portable_pty::native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: config.pty_rows,
                cols: config.pty_cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Bridge(format!("Failed to open PTY: {}", e)))?;

        let mut cmd = shell_command_builder(&config.command);
        cmd.cwd(&config.working_dir);
        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Bridge(format!("Failed to spawn action: {}", e)))?;

        drop(pair.slave);

        let mut reader: Box<dyn Read + Send> = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Bridge(format!("Failed to clone PTY reader: {}", e)))?;

        let mut writer: Box<dyn Write + Send> = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Bridge(format!("Failed to take PTY writer: {}", e)))?;

        let (output_tx, output_rx) = mpsc::channel::<ActionBridgeOutput>(256);
        let (input_tx, mut input_rx) = mpsc::channel::<String>(32);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let status = Arc::new(RwLock::new(ActionStatus::Starting));

        let reader_output_tx = output_tx.clone();
        let reader_shutdown = shutdown_rx.clone();
        std::thread::Builder::new()
            .name("action-reader".to_string())
            .spawn(move || {
                let mut buf = [0u8; PTY_BUFFER_SIZE];
                let mut line_buf = String::new();

                loop {
                    if *reader_shutdown.borrow() {
                        break;
                    }

                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let chunk = String::from_utf8_lossy(&buf[..n]);
                            line_buf.push_str(&chunk);

                            while let Some(newline_pos) = line_buf.find('\n') {
                                let line = line_buf[..newline_pos].to_string();
                                let remainder = line_buf[newline_pos + 1..].to_string();
                                line_buf = remainder;

                                let output = ActionOutput {
                                    line,
                                    is_error: false,
                                };
                                if reader_output_tx
                                    .blocking_send(ActionBridgeOutput::Output(output))
                                    .is_err()
                                {
                                    return;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }

                if !line_buf.is_empty() {
                    let _ =
                        reader_output_tx.blocking_send(ActionBridgeOutput::Output(ActionOutput {
                            line: line_buf,
                            is_error: false,
                        }));
                }
            })
            .map_err(|e| {
                AppError::Bridge(format!("Failed to spawn action reader thread: {}", e))
            })?;

        std::thread::Builder::new()
            .name("action-writer".to_string())
            .spawn(move || {
                while let Some(input) = input_rx.blocking_recv() {
                    if writer.write_all(input.as_bytes()).is_err() {
                        break;
                    }
                    if writer.flush().is_err() {
                        break;
                    }
                }
            })
            .map_err(|e| {
                AppError::Bridge(format!("Failed to spawn action writer thread: {}", e))
            })?;

        let monitor_status = status.clone();
        let monitor_output_tx = output_tx;
        let mut monitor_shutdown = shutdown_rx;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(200)) => {
                        match child.try_wait() {
                            Ok(Some(exit_status)) => {
                                let code = exit_status.exit_code() as i32;
                                {
                                    let mut s = monitor_status.write().await;
                                    if *s != ActionStatus::Stopped {
                                        *s = if code == 0 {
                                            ActionStatus::Completed
                                        } else {
                                            ActionStatus::Failed
                                        };
                                    }
                                }
                                let _ = monitor_output_tx.send(ActionBridgeOutput::Exited {
                                    exit_code: Some(code),
                                }).await;
                                break;
                            }
                            Ok(None) => {
                                let mut s = monitor_status.write().await;
                                if *s == ActionStatus::Starting {
                                    *s = ActionStatus::Running;
                                }
                            }
                            Err(e) => {
                                tracing::error!(error = %e, "Action process monitor failed");
                                let mut s = monitor_status.write().await;
                                if *s != ActionStatus::Stopped {
                                    *s = ActionStatus::Failed;
                                }
                                drop(s);
                                let _ = monitor_output_tx.send(ActionBridgeOutput::Exited {
                                    exit_code: None,
                                }).await;
                                break;
                            }
                        }
                    }
                    _ = monitor_shutdown.changed() => {
                        if *monitor_shutdown.borrow() {
                            let _ = child.kill();
                            {
                                let mut s = monitor_status.write().await;
                                *s = ActionStatus::Stopped;
                            }
                            let _ = monitor_output_tx.send(ActionBridgeOutput::Exited {
                                exit_code: None,
                            }).await;
                            break;
                        }
                    }
                }
            }

            drop(pair.master);
        });

        Ok(Self {
            input_tx,
            output_rx: Mutex::new(output_rx),
            status,
            shutdown_tx,
        })
    }

    /// Receive the next output from the action.
    pub async fn receive(&self) -> AppResult<Option<ActionBridgeOutput>> {
        let mut rx = self.output_rx.lock().await;
        Ok(rx.recv().await)
    }

    /// Get current status.
    pub async fn status(&self) -> ActionStatus {
        self.status.read().await.clone()
    }

    /// Stop the action process.
    pub async fn stop(&self) -> AppResult<()> {
        {
            let mut s = self.status.write().await;
            *s = ActionStatus::Stopped;
        }
        let _ = self.shutdown_tx.send(true);
        Ok(())
    }
}

fn shell_command_builder(command: &str) -> portable_pty::CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = portable_pty::CommandBuilder::new("cmd");
        cmd.arg("/C");
        cmd.arg(command);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = portable_pty::CommandBuilder::new("sh");
        cmd.arg("-c");
        cmd.arg(command);
        cmd
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workdir() -> String {
        tempfile::tempdir()
            .expect("tempdir")
            .keep()
            .to_string_lossy()
            .to_string()
    }

    fn sleep_command() -> String {
        #[cfg(target_os = "windows")]
        {
            "powershell -NoProfile -Command Start-Sleep -Seconds 60".to_string()
        }
        #[cfg(not(target_os = "windows"))]
        {
            "sleep 60".to_string()
        }
    }

    #[tokio::test]
    async fn spawn_simple_command() {
        let config = ActionBridgeConfig {
            command: "echo hello".to_string(),
            working_dir: temp_workdir(),
            ..Default::default()
        };
        let bridge = ActionBridge::spawn(config).expect("spawn action");

        let mut lines = Vec::new();
        while let Ok(Some(output)) = bridge.receive().await {
            match output {
                ActionBridgeOutput::Output(o) => lines.push(o.line),
                ActionBridgeOutput::Exited { .. } => break,
            }
        }

        assert!(lines.iter().any(|l| l.contains("hello")));
    }

    #[tokio::test]
    async fn exit_code_captured() {
        let config = ActionBridgeConfig {
            command: {
                #[cfg(target_os = "windows")]
                {
                    "exit 42".to_string()
                }
                #[cfg(not(target_os = "windows"))]
                {
                    "exit 42".to_string()
                }
            },
            working_dir: temp_workdir(),
            ..Default::default()
        };
        let bridge = ActionBridge::spawn(config).expect("spawn action");

        let mut exit_code = None;
        while let Ok(Some(output)) = bridge.receive().await {
            if let ActionBridgeOutput::Exited { exit_code: code } = output {
                exit_code = code;
                break;
            }
        }

        assert_eq!(exit_code, Some(42));
    }

    #[tokio::test]
    async fn stop_sets_status() {
        let config = ActionBridgeConfig {
            command: sleep_command(),
            working_dir: temp_workdir(),
            ..Default::default()
        };
        let bridge = ActionBridge::spawn(config).expect("spawn action");

        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        bridge.stop().await.expect("stop action");

        assert_eq!(bridge.status().await, ActionStatus::Stopped);
    }
}
