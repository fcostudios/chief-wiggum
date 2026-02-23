//! IPC commands for frontend log forwarding (CHI-97).

use std::collections::HashMap;

/// Forward a log message from the frontend into the Rust tracing pipeline.
///
/// Frontend calls this fire-and-forget — it should never block the UI.
/// Logs appear in the ring buffer, rolling file, and console alongside Rust-origin logs.
#[tauri::command(rename_all = "snake_case")]
pub async fn log_from_frontend(
    level: String,
    target: String,
    message: String,
    fields: Option<HashMap<String, String>>,
) -> Result<(), crate::AppError> {
    // Build structured fields string for the log message
    let fields_display = fields
        .as_ref()
        .map(|f| {
            f.iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    let full_message = if fields_display.is_empty() {
        message
    } else {
        format!("{} [{}]", message, fields_display)
    };

    match level.as_str() {
        "error" => tracing::error!(target: "ui", origin = %target, "{}", full_message),
        "warn" => tracing::warn!(target: "ui", origin = %target, "{}", full_message),
        "info" => tracing::info!(target: "ui", origin = %target, "{}", full_message),
        "debug" => tracing::debug!(target: "ui", origin = %target, "{}", full_message),
        "trace" => tracing::trace!(target: "ui", origin = %target, "{}", full_message),
        _ => tracing::info!(target: "ui", origin = %target, "{}", full_message),
    }

    Ok(())
}
