//! IPC commands for diagnostic bundle export (CHI-96).

use crate::logging::bundle::{BundleExportResult, export_bundle};
use crate::AppError;

/// Export a diagnostic ZIP bundle containing redacted logs and system metadata.
#[tauri::command(rename_all = "snake_case")]
pub async fn export_diagnostic_bundle() -> Result<BundleExportResult, AppError> {
    tokio::task::spawn_blocking(export_bundle)
        .await
        .map_err(|e| AppError::Other(format!("Bundle export task failed: {}", e)))?
}
