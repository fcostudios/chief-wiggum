//! IPC commands for conversation export save/open operations.

use crate::AppError;

/// Save exported content to a user-selected path.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_export_file(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
    extension: String,
) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;

    let ext = extension.trim().to_lowercase();
    if !matches!(ext.as_str(), "md" | "html" | "txt") {
        return Err(AppError::Validation(format!(
            "Unsupported export extension: {}",
            extension
        )));
    }

    let filter_label = match ext.as_str() {
        "md" => "Markdown",
        "html" => "HTML",
        "txt" => "Plain Text",
        _ => "Export",
    };

    let selected = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(filter_label, &[ext.as_str()])
        .blocking_save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let path_string = path.to_string();
    std::fs::write(&path_string, content.as_bytes())?;
    tracing::info!(
        target: "commands/export",
        path = %path_string,
        bytes = content.len(),
        "Saved conversation export"
    );
    Ok(Some(path_string))
}

/// Open a path in the default system application.
#[tauri::command(rename_all = "snake_case")]
#[allow(deprecated)]
pub async fn open_path_in_shell(app: tauri::AppHandle, path: String) -> Result<(), AppError> {
    use tauri_plugin_shell::ShellExt;

    if path.trim().is_empty() {
        return Err(AppError::Validation("Path cannot be empty".to_string()));
    }

    app.shell()
        .open(&path, None)
        .map_err(|e| AppError::Other(format!("Failed to open path: {}", e)))?;
    Ok(())
}
