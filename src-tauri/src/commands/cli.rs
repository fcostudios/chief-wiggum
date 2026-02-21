// IPC commands for CLI detection and status.

use crate::bridge::CliLocation;
use crate::AppError;
use tauri::State;

#[tauri::command]
pub fn get_cli_info(cli: State<'_, CliLocation>) -> Result<CliLocation, AppError> {
    Ok(cli.inner().clone())
}
