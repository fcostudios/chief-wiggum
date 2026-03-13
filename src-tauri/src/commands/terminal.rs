//! Terminal IPC commands (CHI-332).

use crate::terminal::{
    manager::TerminalManager,
    session::TerminalSession,
    shells::{self, ShellInfo},
};
use crate::AppResult;
use tauri::State;

#[tauri::command]
pub async fn list_terminals(
    manager: State<'_, TerminalManager>,
) -> AppResult<Vec<TerminalSession>> {
    Ok(manager.list())
}

#[tauri::command]
pub async fn terminal_write(
    terminal_id: String,
    data: String,
    manager: State<'_, TerminalManager>,
) -> AppResult<()> {
    manager.write(&terminal_id, &data)
}

#[tauri::command]
pub async fn terminal_resize(
    terminal_id: String,
    cols: u16,
    rows: u16,
    manager: State<'_, TerminalManager>,
) -> AppResult<()> {
    manager.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub async fn kill_terminal(
    terminal_id: String,
    manager: State<'_, TerminalManager>,
) -> AppResult<()> {
    manager.kill(&terminal_id)
}

#[tauri::command]
pub async fn list_shells() -> AppResult<Vec<ShellInfo>> {
    Ok(shells::list_available_shells())
}

// spawn_terminal added in Task 2 (requires AppHandle for event emission)
