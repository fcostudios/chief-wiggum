//! IPC commands for slash command discovery (CHI-106).

use crate::slash::{scanner, SlashCommand};
use crate::AppError;

/// List all available slash commands (built-in + project + user).
/// Called by frontend to populate autocomplete.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_slash_commands(
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    Ok(scanner::discover_all(path))
}

/// Rescan and return all slash commands (forces re-read from filesystem).
/// Called when user switches projects or explicitly refreshes.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_slash_commands(
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    Ok(scanner::discover_all(path))
}
