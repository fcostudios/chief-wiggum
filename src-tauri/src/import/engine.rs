//! JSONL import engine with session-level conflict resolution (CHI-304).

use crate::db::{queries, Database};
use crate::import::jsonl::{parse_jsonl_file, MessageInsert};
use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportOutcome {
    Created,
    Merged,
    Preserved,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub session_id: String,
    pub cli_session_id: Option<String>,
    pub outcome: ImportOutcome,
    pub messages_imported: usize,
    pub messages_skipped: usize,
    pub warnings: Vec<String>,
}

/// Import one JSONL file into the selected project.
pub fn import_session_file(
    db: &Database,
    path: &Path,
    project_id: &str,
) -> AppResult<ImportResult> {
    if project_id.trim().is_empty() {
        return Err(AppError::Validation(
            "project_id cannot be empty".to_string(),
        ));
    }
    if !path.exists() || !path.is_file() {
        return Err(AppError::Validation(format!(
            "JSONL path is invalid: {}",
            path.display()
        )));
    }

    let parsed = parse_jsonl_file(path)?;
    let cli_session_id = parsed
        .metadata
        .cli_session_id
        .clone()
        .or(parsed.session_id.clone());
    let warnings = parsed
        .warnings
        .iter()
        .map(|warning| warning.message.clone())
        .collect::<Vec<_>>();

    let existing = if let Some(cli_id) = cli_session_id.as_deref() {
        queries::get_session_by_cli_id(db, cli_id)?
    } else {
        None
    };

    if let Some(existing_session) = existing {
        return import_into_existing(
            db,
            existing_session.id,
            cli_session_id,
            parsed.messages,
            warnings,
        );
    }

    import_as_new(
        db,
        project_id,
        cli_session_id,
        parsed.metadata.model,
        parsed.metadata.cli_version,
        parsed.messages,
        warnings,
    )
}

fn import_into_existing(
    db: &Database,
    session_id: String,
    cli_session_id: Option<String>,
    parsed_messages: Vec<MessageInsert>,
    warnings: Vec<String>,
) -> AppResult<ImportResult> {
    let db_count = queries::count_session_messages(db, &session_id)? as usize;
    let jsonl_count = parsed_messages.len();

    if jsonl_count == db_count {
        return Ok(ImportResult {
            session_id,
            cli_session_id,
            outcome: ImportOutcome::Skipped,
            messages_imported: 0,
            messages_skipped: jsonl_count,
            warnings,
        });
    }

    if jsonl_count < db_count {
        return Ok(ImportResult {
            session_id,
            cli_session_id,
            outcome: ImportOutcome::Preserved,
            messages_imported: 0,
            messages_skipped: jsonl_count,
            warnings,
        });
    }

    let mut imported = 0_usize;
    let mut skipped = db_count;
    let mut token_delta = TokenDelta::default();
    for message in parsed_messages.iter().skip(db_count) {
        if message_already_present(db, &session_id, message)? {
            skipped += 1;
            continue;
        }
        persist_message(db, &session_id, message, &mut token_delta)?;
        imported += 1;
    }

    if imported > 0 {
        apply_token_delta(db, &session_id, &token_delta)?;
    }

    Ok(ImportResult {
        session_id,
        cli_session_id,
        outcome: ImportOutcome::Merged,
        messages_imported: imported,
        messages_skipped: skipped,
        warnings,
    })
}

#[allow(clippy::too_many_arguments)]
fn import_as_new(
    db: &Database,
    project_id: &str,
    cli_session_id: Option<String>,
    model: Option<String>,
    cli_version: Option<String>,
    parsed_messages: Vec<MessageInsert>,
    warnings: Vec<String>,
) -> AppResult<ImportResult> {
    let session_id = Uuid::new_v4().to_string();
    let session_model = model.as_deref().unwrap_or("claude-sonnet-4-6");
    queries::insert_session(db, &session_id, Some(project_id), session_model)?;

    if let Some(cli_id) = cli_session_id.as_deref() {
        queries::update_session_cli_id(db, &session_id, cli_id)?;
    }
    if let Some(version) = cli_version.as_deref() {
        queries::update_session_cli_version(db, &session_id, version)?;
    }

    let mut imported = 0_usize;
    let mut token_delta = TokenDelta::default();
    for message in &parsed_messages {
        persist_message(db, &session_id, message, &mut token_delta)?;
        imported += 1;
    }
    if imported > 0 {
        apply_token_delta(db, &session_id, &token_delta)?;
    }

    Ok(ImportResult {
        session_id,
        cli_session_id,
        outcome: ImportOutcome::Created,
        messages_imported: imported,
        messages_skipped: 0,
        warnings,
    })
}

fn message_already_present(
    db: &Database,
    session_id: &str,
    message: &MessageInsert,
) -> AppResult<bool> {
    if let Some(uuid) = message.uuid.as_deref() {
        return queries::message_uuid_exists(db, session_id, uuid);
    }
    Ok(false)
}

#[derive(Default)]
struct TokenDelta {
    input: i64,
    output: i64,
    cost: i64,
    thinking: i64,
    cache_read: i64,
    cache_write: i64,
}

fn apply_token_delta(db: &Database, session_id: &str, delta: &TokenDelta) -> AppResult<()> {
    queries::update_session_cost(
        db,
        session_id,
        delta.input,
        delta.output,
        delta.cost,
        delta.thinking,
        delta.cache_read,
        delta.cache_write,
    )
}

fn persist_message(
    db: &Database,
    session_id: &str,
    message: &MessageInsert,
    token_delta: &mut TokenDelta,
) -> AppResult<()> {
    let message_id = Uuid::new_v4().to_string();
    let input_tokens = message.usage.as_ref().and_then(|usage| usage.input_tokens);
    let output_tokens = message.usage.as_ref().and_then(|usage| usage.output_tokens);
    let thinking_tokens = message
        .usage
        .as_ref()
        .and_then(|usage| usage.thinking_tokens);
    let cache_read_tokens = message
        .usage
        .as_ref()
        .and_then(|usage| usage.cache_read_input_tokens);
    let cache_write_tokens = message
        .usage
        .as_ref()
        .and_then(|usage| usage.cache_creation_input_tokens);

    queries::insert_message(
        db,
        &message_id,
        session_id,
        &message.role,
        &message.content,
        message.model.as_deref(),
        input_tokens,
        output_tokens,
        thinking_tokens,
        None,
        message.uuid.as_deref(),
        message.parent_uuid.as_deref(),
        message.stop_reason.as_deref(),
        Some(message.is_error),
    )?;

    token_delta.input += input_tokens.unwrap_or(0);
    token_delta.output += output_tokens.unwrap_or(0);
    token_delta.thinking += thinking_tokens.unwrap_or(0);
    token_delta.cache_read += cache_read_tokens.unwrap_or(0);
    token_delta.cache_write += cache_write_tokens.unwrap_or(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries;

    fn make_db() -> Database {
        Database::open_in_memory().expect("in-memory db")
    }

    #[test]
    fn import_result_contains_session_id() {
        let db = make_db();
        queries::insert_project(&db, "proj-1", "Project 1", "/tmp/proj-1").expect("project");

        let line =
            r#"{"type":"system","subtype":"init","sessionId":"cli-abc","model":"claude-opus-4-5"}"#;
        let jsonl = r#"{"type":"user","message":{"role":"user","content":"hi"}}"#;
        let content = format!("{}\n{}", line, jsonl);
        let tmp = tempfile::NamedTempFile::new().expect("temp file");
        std::fs::write(tmp.path(), content).expect("write");

        let result = import_session_file(&db, tmp.path(), "proj-1").expect("import should work");
        assert_eq!(result.outcome, ImportOutcome::Created);
        assert!(!result.session_id.is_empty());
        assert_eq!(result.messages_imported, 1);
    }

    #[test]
    fn duplicate_import_returns_skipped() {
        let db = make_db();
        queries::insert_project(&db, "proj-1", "Project 1", "/tmp/proj-1").expect("project");

        let line =
            r#"{"type":"system","subtype":"init","sessionId":"cli-dup","model":"claude-opus-4-5"}"#;
        let content = format!("{}\n", line);
        let tmp = tempfile::NamedTempFile::new().expect("temp file");
        std::fs::write(tmp.path(), &content).expect("write");

        import_session_file(&db, tmp.path(), "proj-1").expect("first import");
        let result2 = import_session_file(&db, tmp.path(), "proj-1").expect("second import");
        assert_eq!(result2.outcome, ImportOutcome::Skipped);
        assert_eq!(result2.messages_imported, 0);
    }
}
