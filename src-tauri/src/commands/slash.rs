//! IPC commands for slash command discovery (CHI-106).

use tauri::State;

use crate::bridge::manager::SessionBridgeMap;
use crate::slash::{scanner, SlashCommand};
use crate::AppError;

fn merge_runtime_commands(
    mut commands: Vec<SlashCommand>,
    runtime_commands: Vec<SlashCommand>,
) -> Vec<SlashCommand> {
    for runtime_cmd in runtime_commands {
        if commands
            .iter()
            .any(|existing| existing.name == runtime_cmd.name)
        {
            continue;
        }
        commands.push(runtime_cmd);
    }
    commands.sort_by(|a, b| a.name.cmp(&b.name));
    commands
}

/// List all available slash commands (built-in + project + user + SDK).
/// Called by frontend to populate autocomplete.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_slash_commands(
    bridge_map: State<'_, SessionBridgeMap>,
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    let commands = scanner::discover_all(path);
    let sdk_commands = bridge_map.get_sdk_commands().await;
    Ok(merge_runtime_commands(commands, sdk_commands))
}

/// Rescan and return all slash commands (forces re-read from filesystem).
/// Called when user switches projects or explicitly refreshes.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_slash_commands(
    bridge_map: State<'_, SessionBridgeMap>,
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    let commands = scanner::discover_all(path);
    let sdk_commands = bridge_map.get_sdk_commands().await;
    Ok(merge_runtime_commands(commands, sdk_commands))
}
