//! JSONL -> DB reconciliation on session reclaim (CHI-350).

use crate::db::{queries, Database};
use crate::import::jsonl::parse_jsonl_file;
use crate::AppResult;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct ReconcileResult {
    pub session_id: String,
    pub imported: usize,
    pub skipped: usize,
    pub last_uuid: Option<String>,
}

#[derive(Default)]
struct TokenDelta {
    input: i64,
    output: i64,
    thinking: i64,
    cache_read: i64,
    cache_write: i64,
}

pub fn reconcile_session(db: &Database, session_id: &str) -> AppResult<ReconcileResult> {
    let (jsonl_path, _last_uuid) = queries::get_session_jsonl_info(db, session_id)?;
    let Some(jsonl_path) = jsonl_path else {
        return Ok(ReconcileResult {
            session_id: session_id.to_string(),
            ..ReconcileResult::default()
        });
    };

    let jsonl_path = Path::new(&jsonl_path);
    if !jsonl_path.exists() {
        return Ok(ReconcileResult {
            session_id: session_id.to_string(),
            ..ReconcileResult::default()
        });
    }

    let parsed = parse_jsonl_file(jsonl_path)?;
    let mut existing = queries::get_message_jsonl_uuids(db, session_id)?;
    let mut result = ReconcileResult {
        session_id: session_id.to_string(),
        ..ReconcileResult::default()
    };
    let mut token_delta = TokenDelta::default();

    for message in parsed.messages {
        if !matches!(message.role.as_str(), "user" | "assistant") {
            result.skipped += 1;
            continue;
        }

        let Some(jsonl_uuid) = message.uuid.clone() else {
            result.skipped += 1;
            continue;
        };

        result.last_uuid = Some(jsonl_uuid.clone());
        if existing.contains(&jsonl_uuid) {
            result.skipped += 1;
            continue;
        }

        let created_at = message
            .timestamp
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
        let usage = message.usage.clone();
        queries::save_message_from_jsonl(
            db,
            session_id,
            &Uuid::new_v4().to_string(),
            &jsonl_uuid,
            &message.role,
            &message.content,
            message.model.as_deref(),
            usage.as_ref().and_then(|value| value.input_tokens),
            usage.as_ref().and_then(|value| value.output_tokens),
            usage.as_ref().and_then(|value| value.thinking_tokens),
            message.stop_reason.as_deref(),
            message.is_error,
            &created_at,
            message.parent_uuid.as_deref(),
        )?;

        token_delta.input += usage
            .as_ref()
            .and_then(|value| value.input_tokens)
            .unwrap_or(0);
        token_delta.output += usage
            .as_ref()
            .and_then(|value| value.output_tokens)
            .unwrap_or(0);
        token_delta.thinking += usage
            .as_ref()
            .and_then(|value| value.thinking_tokens)
            .unwrap_or(0);
        token_delta.cache_read += usage
            .as_ref()
            .and_then(|value| value.cache_read_input_tokens)
            .unwrap_or(0);
        token_delta.cache_write += usage
            .as_ref()
            .and_then(|value| value.cache_creation_input_tokens)
            .unwrap_or(0);

        existing.insert(jsonl_uuid);
        result.imported += 1;
    }

    if token_delta.input != 0
        || token_delta.output != 0
        || token_delta.thinking != 0
        || token_delta.cache_read != 0
        || token_delta.cache_write != 0
    {
        queries::update_session_cost(
            db,
            session_id,
            token_delta.input,
            token_delta.output,
            0,
            token_delta.thinking,
            token_delta.cache_read,
            token_delta.cache_write,
        )?;
    }

    if let Some(last_uuid) = result.last_uuid.as_deref() {
        queries::update_session_jsonl_last_uuid(db, session_id, last_uuid)?;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries;
    use std::io::Write;

    fn test_db_with_session() -> (Database, String) {
        let db = Database::open_in_memory().expect("db");
        let proj_id = "p-rec1";
        queries::insert_project(&db, proj_id, "Proj", "/rec/proj").expect("project");
        let session_id = "s-rec1";
        queries::insert_session(&db, session_id, Some(proj_id), "sonnet").expect("session");
        (db, session_id.to_string())
    }

    #[test]
    fn reconcile_inserts_missing_messages() {
        let (db, session_id) = test_db_with_session();
        let dir = tempfile::tempdir().expect("temp dir");
        let jsonl_path = dir.path().join("session.jsonl");

        let mut file = std::fs::File::create(&jsonl_path).expect("create jsonl");
        writeln!(
            file,
            r#"{{"type":"user","uuid":"u-001","timestamp":"2026-01-01T00:00:00Z","message":{{"role":"user","content":"hello"}}}}"#
        )
        .expect("write");
        writeln!(
            file,
            r#"{{"type":"assistant","uuid":"a-001","timestamp":"2026-01-01T00:00:01Z","message":{{"role":"assistant","content":[{{"type":"text","text":"hi"}}]}}}}"#
        )
        .expect("write");
        drop(file);

        queries::update_session_jsonl_path(&db, &session_id, &jsonl_path.to_string_lossy())
            .expect("store path");

        let result = reconcile_session(&db, &session_id).expect("reconcile");
        assert_eq!(result.imported, 2);

        let result2 = reconcile_session(&db, &session_id).expect("reconcile twice");
        assert_eq!(result2.imported, 0);
    }

    #[test]
    fn reconcile_skips_already_present_messages() {
        let (db, session_id) = test_db_with_session();
        let dir = tempfile::tempdir().expect("temp dir");
        let jsonl_path = dir.path().join("session.jsonl");

        let mut file = std::fs::File::create(&jsonl_path).expect("create jsonl");
        writeln!(
            file,
            r#"{{"type":"user","uuid":"u-002","timestamp":"2026-01-01T00:00:00Z","message":{{"role":"user","content":"test"}}}}"#
        )
        .expect("write");
        drop(file);

        queries::update_session_jsonl_path(&db, &session_id, &jsonl_path.to_string_lossy())
            .expect("store path");
        queries::save_message_from_jsonl(
            &db,
            &session_id,
            "msg-u-002",
            "u-002",
            "user",
            "test",
            None,
            None,
            None,
            None,
            None,
            false,
            "2026-01-01T00:00:00Z",
            None,
        )
        .expect("seed message");

        let result = reconcile_session(&db, &session_id).expect("reconcile");
        assert_eq!(result.imported, 0);
    }
}
