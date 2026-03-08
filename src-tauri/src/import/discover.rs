//! Session discovery scanner for `~/.claude/projects/` (CHI-303).

use crate::import::jsonl::JsonlLine;
use crate::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use tracing::warn;

/// Metadata for an importable JSONL session file discovered on disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscoveredSession {
    pub file_path: String,
    pub project_path: String,
    pub cli_session_id: String,
    pub file_size_bytes: u64,
    pub line_count: u64,
    pub model: Option<String>,
    pub first_timestamp: Option<String>,
    pub already_imported: bool,
}

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

            let cli_session_id = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default()
                .to_string();
            if cli_session_id.is_empty() {
                continue;
            }

            let metadata = match std::fs::metadata(&path) {
                Ok(value) => value,
                Err(err) => {
                    warn!("Skipping {:?} due to metadata error: {}", path, err);
                    continue;
                }
            };

            let (line_count, model, first_timestamp) = read_first_line_metadata(&path);
            sessions.push(DiscoveredSession {
                file_path: path.to_string_lossy().to_string(),
                project_path: decoded_project.clone(),
                cli_session_id,
                file_size_bytes: metadata.len(),
                line_count,
                model,
                first_timestamp,
                already_imported: false,
            });
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

fn read_first_line_metadata(path: &Path) -> (u64, Option<String>, Option<String>) {
    let file = match File::open(path) {
        Ok(value) => value,
        Err(_) => return (0, None, None),
    };
    let reader = BufReader::new(file);
    let mut line_count = 0_u64;
    let mut model: Option<String> = None;
    let mut first_timestamp: Option<String> = None;
    let mut first_non_blank_seen = false;

    for line in reader.lines() {
        let line = match line {
            Ok(value) => value,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        line_count += 1;

        if !first_non_blank_seen {
            first_non_blank_seen = true;
            if let Ok(parsed) = serde_json::from_str::<JsonlLine>(&line) {
                model = parsed
                    .model
                    .or_else(|| parsed.message.and_then(|msg| msg.model));
                first_timestamp = parsed.timestamp;
            }
        }
    }

    (line_count, model, first_timestamp)
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
