//! Session and message IPC commands per SPEC-004 §4.1.
//! All commands return `Result<T, AppError>` — AppError serializes as a string.

use crate::db::queries::{self, MessageRow, SessionRow};
use crate::db::Database;
use crate::AppError;
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub fn create_session(
    db: State<'_, Database>,
    model: String,
    project_id: Option<String>,
) -> Result<SessionRow, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    queries::insert_session(&db, &id, project_id.as_deref(), &model)?;
    queries::get_session(&db, &id)?
        .ok_or_else(|| AppError::Other("Session not found after creation".to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_all_sessions(db: State<'_, Database>) -> Result<Vec<SessionRow>, AppError> {
    queries::list_sessions(&db)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_session(db: State<'_, Database>, session_id: String) -> Result<SessionRow, AppError> {
    queries::get_session(&db, &session_id)?
        .ok_or_else(|| AppError::Other(format!("Session {} not found", session_id)))
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_session(db: State<'_, Database>, session_id: String) -> Result<(), AppError> {
    queries::delete_session(&db, &session_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_session_title(
    db: State<'_, Database>,
    session_id: String,
    title: String,
) -> Result<(), AppError> {
    queries::update_session_title(&db, &session_id, &title)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub fn save_message(
    db: State<'_, Database>,
    session_id: String,
    id: String,
    role: String,
    content: String,
    model: Option<String>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cost_cents: Option<i64>,
) -> Result<(), AppError> {
    queries::insert_message(
        &db,
        &id,
        &session_id,
        &role,
        &content,
        model.as_deref(),
        input_tokens,
        output_tokens,
        cost_cents,
    )?;

    // Accumulate cost on the session row (CHI-53).
    if input_tokens.is_some() || output_tokens.is_some() || cost_cents.is_some() {
        queries::update_session_cost(
            &db,
            &session_id,
            input_tokens.unwrap_or(0),
            output_tokens.unwrap_or(0),
            cost_cents.unwrap_or(0),
        )?;
    }

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_messages(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<MessageRow>, AppError> {
    queries::list_messages(&db, &session_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_session_model(
    db: State<'_, Database>,
    session_id: String,
    model: String,
) -> Result<(), AppError> {
    queries::update_session_model(&db, &session_id, &model)
}

/// Get session cost/token totals for display (CHI-53).
#[tauri::command(rename_all = "snake_case")]
pub fn get_session_cost(
    db: State<'_, Database>,
    session_id: String,
) -> Result<SessionRow, AppError> {
    queries::get_session(&db, &session_id)?
        .ok_or_else(|| AppError::Other(format!("Session {} not found", session_id)))
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_session_cli_id(
    db: State<'_, Database>,
    session_id: String,
    cli_session_id: String,
) -> Result<(), AppError> {
    queries::update_session_cli_id(&db, &session_id, &cli_session_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn toggle_session_pinned(
    db: State<'_, Database>,
    session_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    db.with_conn(|conn| queries::update_session_pinned(conn, &session_id, pinned))
}
