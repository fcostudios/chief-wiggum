// IPC commands for CLI detection and status.

use crate::bridge::CliLocation;
use crate::AppError;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct CliInfo {
    pub path_override: Option<String>,
    pub resolved_path: Option<String>,
    pub version: Option<String>,
    pub supports_sdk: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_cli_info(cli: State<'_, CliLocation>) -> Result<CliInfo, AppError> {
    let loc = cli.inner();
    Ok(CliInfo {
        path_override: loc.path_override.clone(),
        resolved_path: loc.resolved_path.clone(),
        version: loc.version.clone(),
        supports_sdk: loc.supports_sdk(),
    })
}
