//! Helpers to normalize persisted project paths for filesystem operations.
//!
//! Some persisted paths may arrive as `file://...` URIs from native dialogs.
//! Convert those to filesystem paths so scanner/git/watcher commands work.

use std::path::PathBuf;
use std::str::FromStr;
use tauri_plugin_dialog::FilePath;

/// Normalize a persisted path string into an OS filesystem path.
///
/// - Plain paths are returned as-is.
/// - `file://...` URIs are converted to local filesystem paths.
/// - If conversion fails, the raw string is used as a best-effort fallback.
pub fn normalize_project_path(raw: &str) -> PathBuf {
    let parsed = match FilePath::from_str(raw) {
        Ok(path) => path,
        Err(never) => match never {},
    };

    parsed.into_path().unwrap_or_else(|_| PathBuf::from(raw))
}

#[cfg(test)]
mod tests {
    use super::normalize_project_path;
    use std::path::PathBuf;

    #[test]
    fn keeps_plain_paths() {
        let raw = "/tmp/chief-wiggum";
        assert_eq!(normalize_project_path(raw), PathBuf::from(raw));
    }

    #[test]
    fn converts_file_url_to_path() {
        let raw = "file:///tmp/chief%20wiggum";
        let expected = if cfg!(windows) {
            PathBuf::from(raw)
        } else {
            PathBuf::from("/tmp/chief wiggum")
        };
        assert_eq!(normalize_project_path(raw), expected);
    }
}
