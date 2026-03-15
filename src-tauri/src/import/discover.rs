//! Session discovery scanner for `~/.claude/projects/` (CHI-303).

use crate::import::review::inspect_jsonl_file;
use crate::AppResult;
use std::collections::HashSet;
use std::path::Path;
use tracing::warn;

pub use crate::import::review::ImportReviewItem as DiscoveredSession;

/// Decode Claude's encoded folder naming (`-home-user-proj`) to a path (`/home/user/proj`).
pub fn decode_project_path(encoded: &str) -> String {
    if let Some(rest) = encoded.strip_prefix('-') {
        format!("/{}", rest.replace('-', "/"))
    } else {
        encoded.replace('-', "/")
    }
}

/// Scan the `~/.claude/projects` directory for importable `.jsonl` transcripts.
pub fn scan_projects_dir(base_dir: &Path) -> AppResult<Vec<DiscoveredSession>> {
    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    for entry in std::fs::read_dir(base_dir)? {
        let entry = match entry {
            Ok(value) => value,
            Err(err) => {
                warn!("Skipping unreadable projects entry: {}", err);
                continue;
            }
        };

        let project_dir = entry.path();
        if !project_dir.is_dir() {
            continue;
        }

        let encoded = project_dir
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        let decoded_project = decode_project_path(encoded);

        let jsonl_entries = match std::fs::read_dir(&project_dir) {
            Ok(value) => value,
            Err(err) => {
                warn!(
                    "Skipping unreadable project directory {:?}: {}",
                    project_dir, err
                );
                continue;
            }
        };

        for item in jsonl_entries {
            let item = match item {
                Ok(value) => value,
                Err(err) => {
                    warn!(
                        "Skipping unreadable transcript entry in {:?}: {}",
                        project_dir, err
                    );
                    continue;
                }
            };
            let path = item.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                continue;
            }

            sessions.push(inspect_jsonl_file(
                &path,
                "scanned",
                decoded_project.clone(),
            ));
        }
    }

    sessions.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    Ok(sessions)
}

/// Mark discovered sessions already present in local DB by `cli_session_id`.
pub fn mark_already_imported(
    sessions: &mut [DiscoveredSession],
    imported_cli_ids: &HashSet<String>,
) {
    for session in sessions {
        session.already_imported = imported_cli_ids.contains(&session.cli_session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_fake_project(root: &TempDir, encoded_path: &str, session_id: &str, content: &str) {
        let dir = root.path().join(encoded_path);
        fs::create_dir_all(&dir).expect("create project dir");
        fs::write(dir.join(format!("{}.jsonl", session_id)), content).expect("write jsonl");
    }

    #[test]
    fn decode_path_replaces_leading_dash_with_slash() {
        assert_eq!(decode_project_path("-home-user-proj"), "/home/user/proj");
    }

    #[test]
    fn scan_returns_empty_when_dir_missing() {
        let result = scan_projects_dir(std::path::Path::new("/nonexistent/path/xyz"));
        assert!(result.is_ok());
        assert!(result.expect("scan should succeed").is_empty());
    }

    #[test]
    fn scan_finds_jsonl_files() {
        let root = TempDir::new().expect("temp dir");
        let line =
            r#"{"type":"system","subtype":"init","sessionId":"abc-123","model":"claude-opus-4-5"}"#;
        make_fake_project(&root, "-home-user-myproject", "abc-123", line);
        let results = scan_projects_dir(root.path()).expect("scan should pass");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].cli_session_id, "abc-123");
        assert_eq!(results[0].project_path, "/home/user/myproject");
    }

    #[test]
    fn scan_sets_already_imported_false_by_default() {
        let root = TempDir::new().expect("temp dir");
        let line =
            r#"{"type":"system","subtype":"init","sessionId":"xyz","model":"claude-opus-4-5"}"#;
        make_fake_project(&root, "-tmp-test", "xyz", line);
        let results = scan_projects_dir(root.path()).expect("scan should pass");
        assert!(!results[0].already_imported);
    }
}
