//! Terminal session manager (CHI-332).
//! Owns PTY sessions, spawns/kills processes, streams output via Tauri events.

use super::session::{TerminalSession, TerminalStatus};
use crate::{AppError, AppResult};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

struct TerminalEntry {
    session: TerminalSession,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Clone)]
pub struct TerminalManager {
    inner: Arc<Mutex<HashMap<String, TerminalEntry>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list(&self) -> Vec<TerminalSession> {
        let guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        guard.values().map(|entry| entry.session.clone()).collect()
    }

    /// Spawns a new PTY-backed shell session and starts output streaming.
    pub fn spawn(&self, shell: String, cwd: String, app: AppHandle) -> AppResult<TerminalSession> {
        let terminal_id = Uuid::new_v4().to_string();
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Terminal(format!("Failed to open PTY: {e}")))?;

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Terminal(format!("Failed to spawn shell: {e}")))?;
        let killer = child.clone_killer();
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Terminal(format!("Failed to clone PTY reader: {e}")))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Terminal(format!("Failed to take PTY writer: {e}")))?;

        let session = TerminalSession {
            terminal_id: terminal_id.clone(),
            shell: shell.clone(),
            cwd: cwd.clone(),
            status: TerminalStatus::Running,
            exit_code: None,
            title: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        {
            let mut guard = self
                .inner
                .lock()
                .map_err(|_| AppError::Terminal("Lock poisoned".to_string()))?;
            guard.insert(
                terminal_id.clone(),
                TerminalEntry {
                    session: session.clone(),
                    writer,
                    master: pair.master,
                    killer,
                },
            );
        }

        let output_app = app.clone();
        let output_terminal_id = terminal_id.clone();
        std::thread::Builder::new()
            .name("terminal-reader".to_string())
            .spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            let payload = serde_json::json!({
                                "terminal_id": output_terminal_id,
                                "data": data,
                            });
                            if let Err(e) = output_app.emit("terminal:output", payload) {
                                tracing::warn!(
                                    terminal_id = %output_terminal_id,
                                    error = %e,
                                    "Failed to emit terminal:output"
                                );
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::debug!(
                                terminal_id = %output_terminal_id,
                                error = %e,
                                "Terminal reader stopped"
                            );
                            break;
                        }
                    }
                }
            })
            .map_err(|e| {
                AppError::Terminal(format!("Failed to spawn terminal reader thread: {e}"))
            })?;

        let exit_terminal_id = terminal_id.clone();
        let exit_app = app;
        let inner = self.inner.clone();
        std::thread::Builder::new()
            .name("terminal-wait".to_string())
            .spawn(move || {
                let exit_code = match child.wait() {
                    Ok(status) => Some(status.exit_code() as i32),
                    Err(e) => {
                        tracing::warn!(
                            terminal_id = %exit_terminal_id,
                            error = %e,
                            "Failed while waiting for terminal exit"
                        );
                        None
                    }
                };

                if let Ok(mut guard) = inner.lock() {
                    if let Some(entry) = guard.get_mut(&exit_terminal_id) {
                        entry.session.status = TerminalStatus::Exited;
                        entry.session.exit_code = exit_code;
                    }
                }

                let payload = serde_json::json!({
                    "terminal_id": exit_terminal_id,
                    "exit_code": exit_code,
                });
                if let Err(e) = exit_app.emit("terminal:exit", payload) {
                    tracing::warn!(
                        terminal_id = %exit_terminal_id,
                        error = %e,
                        "Failed to emit terminal:exit"
                    );
                }
            })
            .map_err(|e| {
                AppError::Terminal(format!("Failed to spawn terminal wait thread: {e}"))
            })?;

        Ok(session)
    }

    pub fn write(&self, terminal_id: &str, data: &str) -> AppResult<()> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| AppError::Terminal("Lock poisoned".to_string()))?;
        let entry = guard
            .get_mut(terminal_id)
            .ok_or_else(|| AppError::Terminal(format!("Terminal not found: {terminal_id}")))?;
        entry
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| AppError::Terminal(format!("Write failed: {e}")))?;
        entry
            .writer
            .flush()
            .map_err(|e| AppError::Terminal(format!("Flush failed: {e}")))?;
        Ok(())
    }

    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| AppError::Terminal("Lock poisoned".to_string()))?;
        let entry = guard
            .get(terminal_id)
            .ok_or_else(|| AppError::Terminal(format!("Terminal not found: {terminal_id}")))?;
        entry
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Terminal(format!("Resize failed: {e}")))?;
        Ok(())
    }

    pub fn kill(&self, terminal_id: &str) -> AppResult<()> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| AppError::Terminal("Lock poisoned".to_string()))?;
        let mut entry = guard
            .remove(terminal_id)
            .ok_or_else(|| AppError::Terminal(format!("Terminal not found: {terminal_id}")))?;
        if let Err(e) = entry.killer.kill() {
            tracing::debug!(
                terminal_id = %terminal_id,
                error = %e,
                "Terminal kill returned error"
            );
        }
        Ok(())
    }

    pub fn kill_all(&self) {
        let ids = self
            .list()
            .into_iter()
            .map(|session| session.terminal_id)
            .collect::<Vec<_>>();
        for terminal_id in ids {
            let _ = self.kill(&terminal_id);
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::TerminalManager;

    #[test]
    fn new_manager_starts_empty() {
        let manager = TerminalManager::new();
        assert!(manager.list().is_empty());
    }

    #[test]
    fn missing_terminal_operations_return_errors() {
        let manager = TerminalManager::new();
        assert!(manager.write("missing", "echo hi").is_err());
        assert!(manager.resize("missing", 80, 24).is_err());
        assert!(manager.kill("missing").is_err());
    }
}
