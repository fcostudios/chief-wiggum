//! Terminal session manager (CHI-332).
//! Owns PTY sessions, spawns/kills processes, streams output via Tauri events.

use super::session::TerminalSession;
use crate::{AppError, AppResult};
use portable_pty::{MasterPty, PtySize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};

struct TerminalEntry {
    session: TerminalSession,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
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
        guard
            .remove(terminal_id)
            .ok_or_else(|| AppError::Terminal(format!("Terminal not found: {terminal_id}")))?;
        Ok(())
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
