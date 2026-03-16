use crate::import::jsonl::{JsonlContent, JsonlLine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportReviewItem {
    pub source: String,
    pub file_path: String,
    pub project_path: String,
    pub cli_session_id: String,
    pub file_size_bytes: u64,
    pub line_count: u64,
    pub model: Option<String>,
    pub first_timestamp: Option<String>,
    pub last_modified_timestamp: Option<String>,
    pub first_user_preview: Option<String>,
    pub already_imported: bool,
    pub is_valid_jsonl: bool,
    pub warning: Option<String>,
}

pub fn inspect_jsonl_file(path: &Path, source: &str, project_path: String) -> ImportReviewItem {
    let file_path = path.to_string_lossy().to_string();
    let fallback_session_id = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .to_string();

    let metadata = std::fs::metadata(path);
    let file_size_bytes = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
    let last_modified_timestamp = metadata
        .as_ref()
        .ok()
        .and_then(|value| value.modified().ok())
        .map(format_system_time);

    let mut item = ImportReviewItem {
        source: source.to_string(),
        file_path,
        project_path,
        cli_session_id: fallback_session_id.clone(),
        file_size_bytes,
        line_count: 0,
        model: None,
        first_timestamp: None,
        last_modified_timestamp,
        first_user_preview: None,
        already_imported: false,
        is_valid_jsonl: false,
        warning: metadata
            .as_ref()
            .err()
            .map(|err| format!("Could not read file metadata: {}", err)),
    };

    let file = match File::open(path) {
        Ok(file) => file,
        Err(err) => {
            item.warning = Some(format!("Could not read JSONL file: {}", err));
            return item;
        }
    };

    let mut parsed_lines = 0_u64;
    let mut malformed_lines = 0_u64;
    let mut first_error: Option<String> = None;

    for line in BufReader::new(file).lines() {
        let line = match line {
            Ok(value) => value,
            Err(err) => {
                malformed_lines += 1;
                if first_error.is_none() {
                    first_error = Some(err.to_string());
                }
                continue;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        item.line_count += 1;

        let parsed = match serde_json::from_str::<JsonlLine>(trimmed) {
            Ok(parsed) => parsed,
            Err(err) => {
                malformed_lines += 1;
                if first_error.is_none() {
                    first_error = Some(err.to_string());
                }
                continue;
            }
        };

        parsed_lines += 1;
        if item.cli_session_id.is_empty() {
            if let Some(cli_session_id) = parsed
                .cli_session_id
                .clone()
                .or_else(|| parsed.session_id.clone())
            {
                item.cli_session_id = cli_session_id;
            }
        } else if item.cli_session_id == fallback_session_id {
            if let Some(cli_session_id) = parsed
                .cli_session_id
                .clone()
                .or_else(|| parsed.session_id.clone())
            {
                item.cli_session_id = cli_session_id;
            }
        }

        if item.model.is_none() {
            item.model = parsed.model.clone().or_else(|| {
                parsed
                    .message
                    .as_ref()
                    .and_then(|message| message.model.clone())
            });
        }
        if item.first_timestamp.is_none() {
            item.first_timestamp = parsed.timestamp.clone();
        }
        if item.first_user_preview.is_none() {
            item.first_user_preview = extract_first_user_preview(&parsed);
        }
    }

    item.is_valid_jsonl = parsed_lines > 0;
    item.warning = match (parsed_lines, malformed_lines, first_error) {
        (0, _, Some(err)) => Some(format!("Invalid JSONL preview: {}", err)),
        (0, _, None) if item.line_count == 0 => Some("File is empty".to_string()),
        (_, 0, _) => item.warning,
        (_, malformed, Some(err)) => Some(format!(
            "Skipped {} malformed line(s) while building preview: {}",
            malformed, err
        )),
        (_, malformed, None) => Some(format!(
            "Skipped {} malformed line(s) while building preview",
            malformed
        )),
    };

    item
}

pub fn inspect_selected_files(file_paths: &[String]) -> Vec<ImportReviewItem> {
    file_paths
        .iter()
        .map(|file_path| {
            let path = Path::new(file_path);
            let project_path = path
                .parent()
                .map(|parent| parent.to_string_lossy().to_string())
                .unwrap_or_default();
            inspect_jsonl_file(path, "picked", project_path)
        })
        .collect()
}

fn format_system_time(value: std::time::SystemTime) -> String {
    let timestamp: DateTime<Utc> = value.into();
    timestamp.to_rfc3339()
}

fn extract_first_user_preview(parsed: &JsonlLine) -> Option<String> {
    let role = parsed
        .message
        .as_ref()
        .and_then(|message| message.role.as_deref())
        .or(match parsed.event_type.as_str() {
            "user" => Some("user"),
            "assistant" | "result" => Some("assistant"),
            _ => None,
        });
    if role != Some("user") {
        return None;
    }

    let content = parsed
        .message
        .as_ref()
        .and_then(|message| message.content.clone())
        .or_else(|| parsed.content.clone())?;
    normalize_preview(content_to_text(content))
}

fn content_to_text(content: JsonlContent) -> String {
    match content {
        JsonlContent::Text(text) => text,
        JsonlContent::Blocks(blocks) => blocks
            .into_iter()
            .filter_map(|block| match block.block_type.as_str() {
                "text" => block.text,
                "thinking" => block.thinking,
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn normalize_preview(value: String) -> Option<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    let max_chars = 180;
    let truncated = if normalized.chars().count() > max_chars {
        let shortened = normalized.chars().take(max_chars - 3).collect::<String>();
        format!("{}...", shortened)
    } else {
        normalized
    };
    Some(truncated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_temp_jsonl(root: &TempDir, name: &str, content: &str) -> std::path::PathBuf {
        let path = root.path().join(name);
        fs::write(&path, content).expect("write temp jsonl");
        path
    }

    #[test]
    fn inspect_jsonl_file_extracts_model_timestamp_and_preview() {
        let root = TempDir::new().expect("temp dir");
        let path = write_temp_jsonl(
            &root,
            "session.jsonl",
            concat!(
                "{\"type\":\"system\",\"subtype\":\"init\",\"sessionId\":\"abc-123\",\"model\":\"claude-sonnet-4-6\",\"timestamp\":\"2026-03-14T10:00:00Z\"}\n",
                "{\"type\":\"user\",\"timestamp\":\"2026-03-14T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":\"Need to import the right file\"}}\n",
            ),
        );

        let item = inspect_jsonl_file(&path, "picked", "/tmp/project".to_string());

        assert_eq!(item.cli_session_id, "abc-123");
        assert_eq!(item.model.as_deref(), Some("claude-sonnet-4-6"));
        assert_eq!(
            item.first_timestamp.as_deref(),
            Some("2026-03-14T10:00:00Z")
        );
        assert_eq!(
            item.first_user_preview.as_deref(),
            Some("Need to import the right file")
        );
        assert!(item.is_valid_jsonl);
    }

    #[test]
    fn inspect_jsonl_file_returns_invalid_state_for_bad_jsonl() {
        let root = TempDir::new().expect("temp dir");
        let path = write_temp_jsonl(&root, "broken.jsonl", "{ definitely-not-json }\n");

        let item = inspect_jsonl_file(&path, "picked", "/tmp/project".to_string());

        assert!(!item.is_valid_jsonl);
        assert!(item.warning.is_some());
    }

    #[test]
    fn inspect_jsonl_file_reports_last_modified_and_file_stats() {
        let root = TempDir::new().expect("temp dir");
        let path = write_temp_jsonl(
            &root,
            "stats.jsonl",
            "{\"type\":\"system\",\"subtype\":\"init\",\"sessionId\":\"stats-1\"}\n",
        );

        let item = inspect_jsonl_file(&path, "scanned", "/tmp/project".to_string());

        assert!(item.file_size_bytes > 0);
        assert_eq!(item.line_count, 1);
        assert!(item.last_modified_timestamp.is_some());
    }

    #[test]
    fn inspect_selected_files_marks_invalid_and_valid_rows() {
        let root = TempDir::new().expect("temp dir");
        let valid = write_temp_jsonl(
            &root,
            "valid.jsonl",
            "{\"type\":\"system\",\"subtype\":\"init\",\"sessionId\":\"valid-1\"}\n",
        );
        let invalid = write_temp_jsonl(&root, "invalid.jsonl", "{ nope }\n");

        let items = inspect_selected_files(&[
            valid.to_string_lossy().to_string(),
            invalid.to_string_lossy().to_string(),
        ]);

        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|item| item.is_valid_jsonl));
        assert!(items.iter().any(|item| !item.is_valid_jsonl));
    }
}
