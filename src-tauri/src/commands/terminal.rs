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
pub async fn spawn_terminal(
    shell: Option<String>,
    cwd: Option<String>,
    app: tauri::AppHandle,
    manager: State<'_, TerminalManager>,
) -> AppResult<TerminalSession> {
    let resolved_shell = shell.unwrap_or_else(shells::detect_default_shell);
    let resolved_cwd = cwd.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|home| home.to_string_lossy().to_string())
            .unwrap_or_else(|| "/".to_string())
    });
    manager.spawn(resolved_shell, resolved_cwd, app)
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
