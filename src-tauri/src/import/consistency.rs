//! Session consistency checker against JSONL ground truth (CHI-306).

use crate::db::{queries, Database};
use crate::import::jsonl::parse_jsonl_file;
use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct TokenDrift {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub thinking_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ConsistencyReport {
    pub session_id: String,
    pub jsonl_message_count: usize,
    pub db_message_count: usize,
    pub missing_from_db: Vec<String>,
    pub extra_in_db: Vec<String>,
    pub token_drift: TokenDrift,
    pub boundary_count: usize,
    pub sidechain_messages: usize,
    pub integrity_score: f64,
}

pub fn check_session_consistency(
    db: &Database,
    session_id: &str,
    jsonl_path: &Path,
) -> AppResult<ConsistencyReport> {
    if !jsonl_path.exists() {
        return Err(AppError::Validation(format!(
            "JSONL path does not exist: {}",
            jsonl_path.display()
        )));
    }
    if !jsonl_path.is_file() {
        return Err(AppError::Validation(format!(
            "JSONL path is not a file: {}",
            jsonl_path.display()
        )));
    }

    let parsed = parse_jsonl_file(jsonl_path)?;
    let session = queries::get_session(db, session_id)?
        .ok_or_else(|| AppError::Validation(format!("Session not found: {}", session_id)))?;
    let db_messages = queries::list_messages(db, session_id)?;

    let jsonl_uuids: BTreeSet<String> = parsed
        .messages
        .iter()
        .filter(|message| !message.is_sidechain)
        .filter_map(|message| message.uuid.clone())
        .filter(|uuid| !uuid.trim().is_empty())
        .collect();
    let db_uuids: BTreeSet<String> = db_messages
        .iter()
        .filter_map(|message| message.uuid.clone())
        .filter(|uuid| !uuid.trim().is_empty())
        .collect();

    let missing_from_db: Vec<String> = jsonl_uuids.difference(&db_uuids).cloned().collect();
    let extra_in_db: Vec<String> = db_uuids.difference(&jsonl_uuids).cloned().collect();

    let jsonl_message_count = parsed
        .messages
        .iter()
        .filter(|msg| !msg.is_sidechain)
        .count();
    let db_message_count = db_messages.len();
    let denominator = jsonl_message_count.max(db_message_count).max(1) as f64;
    let mismatch = (missing_from_db.len() + extra_in_db.len()) as f64;
    let integrity_score = (1.0 - (mismatch / denominator)).clamp(0.0, 1.0);

    let token_drift = TokenDrift {
        input_tokens: parsed.token_totals.input_tokens - session.total_input_tokens.unwrap_or(0),
        output_tokens: parsed.token_totals.output_tokens - session.total_output_tokens.unwrap_or(0),
        thinking_tokens: parsed.token_totals.thinking_tokens
            - session.total_thinking_tokens.unwrap_or(0),
        cache_read_tokens: parsed.token_totals.cache_read_tokens
            - session.total_cache_read_tokens.unwrap_or(0),
        cache_write_tokens: parsed.token_totals.cache_write_tokens
            - session.total_cache_write_tokens.unwrap_or(0),
    };

    Ok(ConsistencyReport {
        session_id: session_id.to_string(),
        jsonl_message_count,
        db_message_count,
        missing_from_db,
        extra_in_db,
        token_drift,
        boundary_count: parsed.boundary_count,
        sidechain_messages: parsed.sidechain_messages,
        integrity_score,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries;
    use tempfile::NamedTempFile;

    fn test_db() -> Database {
        Database::open_in_memory().expect("open in-memory db")
    }

    fn write_temp_jsonl(content: &str) -> NamedTempFile {
        let mut file = NamedTempFile::new().expect("temp file");
        std::io::Write::write_all(&mut file, content.as_bytes()).expect("write");
        file
    }

    #[test]
    fn report_is_perfect_when_no_drift() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("session");
        queries::insert_message(
            &db,
            "m1",
            "s1",
            "user",
            "hello",
            Some("claude-sonnet-4-6"),
            Some(5),
            Some(0),
            Some(0),
            Some(0),
            Some("u1"),
            None,
            None,
            Some(false),
        )
        .expect("m1");
        queries::insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "world",
            Some("claude-sonnet-4-6"),
            Some(5),
            Some(10),
            Some(2),
            Some(0),
            Some("a1"),
            Some("u1"),
            Some("end_turn"),
            Some(false),
        )
        .expect("m2");
        queries::update_session_cost(&db, "s1", 10, 10, 0, 2, 0, 0).expect("totals");

        let jsonl = r#"{"type":"user","uuid":"u1","sessionId":"s1","message":{"role":"user","content":"hello","usage":{"input_tokens":5,"output_tokens":0}}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"s1","message":{"role":"assistant","content":"world","usage":{"input_tokens":5,"output_tokens":10,"thinking_tokens":2},"stop_reason":"end_turn"}}
"#;
        let file = write_temp_jsonl(jsonl);
        let report = check_session_consistency(&db, "s1", file.path()).expect("report");

        assert_eq!(report.jsonl_message_count, 2);
        assert_eq!(report.db_message_count, 2);
        assert!(report.missing_from_db.is_empty());
        assert!(report.extra_in_db.is_empty());
        assert_eq!(report.integrity_score, 1.0);
        assert_eq!(report.token_drift.input_tokens, 0);
        assert_eq!(report.token_drift.output_tokens, 0);
        assert_eq!(report.token_drift.thinking_tokens, 0);
    }

    #[test]
    fn missing_messages_are_reported() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("session");
        queries::insert_message(
            &db,
            "m1",
            "s1",
            "user",
            "hello",
            None,
            None,
            None,
            None,
            None,
            Some("u1"),
            None,
            None,
            Some(false),
        )
        .expect("m1");

        let jsonl = r#"{"type":"user","uuid":"u1","sessionId":"s1","message":{"role":"user","content":"hello"}}
{"type":"assistant","uuid":"a2","sessionId":"s1","message":{"role":"assistant","content":"missing"}}
"#;
        let file = write_temp_jsonl(jsonl);
        let report = check_session_consistency(&db, "s1", file.path()).expect("report");

        assert_eq!(report.missing_from_db, vec!["a2".to_string()]);
        assert!(report.extra_in_db.is_empty());
        assert!(report.integrity_score < 1.0);
    }

    #[test]
    fn sidechain_messages_do_not_count_as_missing() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("session");

        let jsonl = r#"{"type":"assistant","uuid":"a-side","isSidechain":true,"sessionId":"s1","message":{"role":"assistant","content":"not persisted"}}
"#;
        let file = write_temp_jsonl(jsonl);
        let report = check_session_consistency(&db, "s1", file.path()).expect("report");

        assert_eq!(report.sidechain_messages, 1);
        assert!(report.missing_from_db.is_empty());
        assert_eq!(report.jsonl_message_count, 0);
    }
}
