//! IPC commands for slash command discovery (CHI-106).

use tauri::State;

use crate::bridge::manager::SessionBridgeMap;
use crate::slash::{scanner, SlashCommand};
use crate::AppError;

/// List all available slash commands (built-in + project + user + SDK).
/// Called by frontend to populate autocomplete.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_slash_commands(
    bridge_map: State<'_, SessionBridgeMap>,
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    let mut commands = scanner::discover_all(path);
    let sdk_commands = bridge_map.get_sdk_commands().await;
    for sdk_cmd in sdk_commands {
        commands.retain(|c| c.name != sdk_cmd.name);
        commands.push(sdk_cmd);
    }
    Ok(commands)
}

/// Rescan and return all slash commands (forces re-read from filesystem).
/// Called when user switches projects or explicitly refreshes.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_slash_commands(
    bridge_map: State<'_, SessionBridgeMap>,
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    let mut commands = scanner::discover_all(path);
    let sdk_commands = bridge_map.get_sdk_commands().await;
    for sdk_cmd in sdk_commands {
        commands.retain(|c| c.name != sdk_cmd.name);
        commands.push(sdk_cmd);
    }
    Ok(commands)
}
