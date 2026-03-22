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

/// Encode an absolute project path to the flat directory name used by Claude CLI.
pub fn encode_project_path(path: &str) -> String {
    path.replace('/', "-")
}

#[cfg(test)]
mod tests {
    use super::{encode_project_path, normalize_project_path};
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

    #[test]
    fn encode_project_path_replaces_slashes_with_dashes() {
        assert_eq!(
            encode_project_path("/Users/alice/my-project"),
            "-Users-alice-my-project"
        );
    }

    #[test]
    fn encode_project_path_handles_empty_string() {
        assert_eq!(encode_project_path(""), "");
    }
}
