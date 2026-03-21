//! Session handover via `claude remote-control --resume` (CHI-344).

use crate::{AppError, AppResult};
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

fn relay_url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"https://claude\.ai/code/[A-Za-z0-9_-]+").expect("valid relay URL regex")
    })
}

fn extract_relay_url(line: &str) -> Option<String> {
    relay_url_regex()
        .find(line)
        .map(|matched| matched.as_str().to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct HandoverState {
    pub session_id: String,
    pub cli_session_id: String,
    pub relay_url: String,
    pub started_at: String,
}

pub struct HandoverProcess {
    pub state: HandoverState,
    child: Arc<Mutex<Child>>,
    stdout_task: JoinHandle<()>,
    stderr_task: JoinHandle<()>,
}

#[derive(Clone)]
pub struct HandoverMap(Arc<Mutex<HashMap<String, HandoverProcess>>>);

impl HandoverMap {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }

    pub fn inner(&self) -> Self {
        self.clone()
    }

    pub async fn get_state(&self, session_id: &str) -> Option<HandoverState> {
        self.0
            .lock()
            .await
            .get(session_id)
            .map(|process| process.state.clone())
    }

    pub async fn start(
        &self,
        cli_path: &str,
        session_id: String,
        cli_session_id: String,
        cwd: Option<&str>,
    ) -> AppResult<HandoverState> {
        if let Some(existing) = self.get_state(&session_id).await {
            return Ok(existing);
        }

        let mut command = Command::new(cli_path);
        command
            .arg("remote-control")
            .arg("--resume")
            .arg(&cli_session_id)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(cwd) = cwd {
            command.current_dir(cwd);
        }

        let mut child = command
            .spawn()
            .map_err(|e| AppError::Bridge(format!("Failed to start handover process: {}", e)))?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AppError::Bridge("Failed to capture handover stdout from claude".to_string())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            AppError::Bridge("Failed to capture handover stderr from claude".to_string())
        })?;

        let (url_tx, url_rx) = oneshot::channel();
        let stdout_task = tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            let mut url_sender = Some(url_tx);
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("handover stdout: {}", line);
                if let Some(sender) = url_sender.take() {
                    if let Some(url) = extract_relay_url(&line) {
                        let _ = sender.send(url);
                    } else {
                        url_sender = Some(sender);
                    }
                }
            }
        });

        let stderr_task = tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("handover stderr: {}", line);
            }
        });

        let relay_url = timeout(Duration::from_secs(20), url_rx)
            .await
            .map_err(|_| {
                AppError::Bridge(
                    "Timed out waiting for relay URL from `claude remote-control`".to_string(),
                )
            })?
            .map_err(|_| {
                AppError::Bridge(
                    "Handover process exited before publishing a relay URL".to_string(),
                )
            })?;

        let state = HandoverState {
            session_id: session_id.clone(),
            cli_session_id,
            relay_url,
            started_at: chrono::Utc::now().to_rfc3339(),
        };

        self.0.lock().await.insert(
            session_id,
            HandoverProcess {
                state: state.clone(),
                child: Arc::new(Mutex::new(child)),
                stdout_task,
                stderr_task,
            },
        );

        Ok(state)
    }

    pub async fn stop(&self, session_id: &str) -> AppResult<()> {
        let process = self.0.lock().await.remove(session_id);
        if let Some(process) = process {
            process.stdout_task.abort();
            process.stderr_task.abort();
            let mut child = process.child.lock().await;
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        Ok(())
    }

    pub async fn shutdown_all(&self) {
        let session_ids = self.0.lock().await.keys().cloned().collect::<Vec<_>>();
        for session_id in session_ids {
            let _ = self.stop(&session_id).await;
        }
    }
}

impl Default for HandoverMap {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::extract_relay_url;

    #[test]
    fn extracts_relay_url_from_stdout_line() {
        let line = "Open this link on your phone: https://claude.ai/code/abc_DEF-123";
        assert_eq!(
            extract_relay_url(line).as_deref(),
            Some("https://claude.ai/code/abc_DEF-123")
        );
    }

    #[test]
    fn ignores_lines_without_relay_url() {
        assert!(extract_relay_url("waiting for tunnel").is_none());
    }
}
