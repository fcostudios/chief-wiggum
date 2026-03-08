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
pub async fn delete_session(
    db: State<'_, Database>,
    bridge_map: State<'_, crate::bridge::manager::SessionBridgeMap>,
    session_id: String,
) -> Result<(), AppError> {
    bridge_map.cleanup_session(&session_id).await;
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
pub fn delete_messages_after(
    db: State<'_, Database>,
    session_id: String,
    after_message_id: String,
) -> Result<usize, AppError> {
    queries::delete_messages_after(&db, &session_id, &after_message_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_single_message(
    db: State<'_, Database>,
    session_id: String,
    message_id: String,
) -> Result<(), AppError> {
    queries::delete_single_message(&db, &session_id, &message_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_message_content(
    db: State<'_, Database>,
    message_id: String,
    new_content: String,
) -> Result<(), AppError> {
    queries::update_message_content(&db, &message_id, &new_content)
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

#[tauri::command(rename_all = "snake_case")]
pub fn duplicate_session(
    db: State<'_, Database>,
    session_id: String,
) -> Result<SessionRow, AppError> {
    let new_id = uuid::Uuid::new_v4().to_string();
    queries::duplicate_session_metadata_only(&db, &session_id, &new_id)?;
    queries::get_session(&db, &new_id)?
        .ok_or_else(|| AppError::Other("Duplicated session not found".to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn fork_session(
    db: State<'_, Database>,
    session_id: String,
    up_to_message_id: String,
) -> Result<SessionRow, AppError> {
    let new_id = uuid::Uuid::new_v4().to_string();
    queries::fork_session_up_to(&db, &session_id, &new_id, &up_to_message_id)?;
    queries::get_session(&db, &new_id)?
        .ok_or_else(|| AppError::Other("Forked session not found".to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn session_has_messages(db: State<'_, Database>, session_id: String) -> Result<bool, AppError> {
    Ok(queries::count_session_messages(&db, &session_id)? > 0)
}

/// Extract code blocks from all assistant messages in a session and persist
/// them to the artifacts table. Idempotent. Returns the full artifact list.
#[tauri::command(rename_all = "snake_case")]
pub fn extract_session_artifacts(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<queries::ArtifactRow>, AppError> {
    queries::extract_and_save_artifacts(&db, &session_id)?;
    queries::get_session_artifacts(&db, &session_id)
}

/// Return cached artifact list for a session (no re-extraction).
#[tauri::command(rename_all = "snake_case")]
pub fn get_session_artifacts(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<queries::ArtifactRow>, AppError> {
    queries::get_session_artifacts(&db, &session_id)
}

/// Return aggregate session stats: message count, tool count, artifact count,
/// duration, models used.
#[tauri::command(rename_all = "snake_case")]
pub fn get_session_summary(
    db: State<'_, Database>,
    session_id: String,
) -> Result<queries::SessionSummaryRow, AppError> {
    queries::query_session_summary(&db, &session_id)
}

#[cfg(test)]
mod tests {
    use crate::db::queries;
    use crate::db::Database;

    fn test_db() -> Database {
        Database::open_in_memory().expect("open in-memory db")
    }

    #[test]
    fn create_and_get_session() {
        let db = test_db();
        let id = uuid::Uuid::new_v4().to_string();
        queries::insert_session(&db, &id, None, "claude-sonnet-4-6").expect("insert session");

        let session = queries::get_session(&db, &id)
            .expect("get session")
            .expect("session exists");
        assert_eq!(session.id, id);
        assert_eq!(session.model, "claude-sonnet-4-6");
        assert!(session.title.is_none() || session.title == Some(String::new()));
    }

    #[test]
    fn list_sessions_returns_all() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert s1");
        queries::insert_session(&db, "s2", None, "claude-opus-4-6").expect("insert s2");

        let sessions = queries::list_sessions(&db).expect("list sessions");
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn delete_session_removes_it() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");
        queries::delete_session(&db, "s1").expect("delete session");

        let result = queries::get_session(&db, "s1").expect("get session after delete");
        assert!(result.is_none());
    }

    #[test]
    fn update_session_title_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");
        queries::update_session_title(&db, "s1", "My Session").expect("update title");

        let session = queries::get_session(&db, "s1")
            .expect("get session")
            .expect("session exists");
        assert_eq!(session.title, Some("My Session".to_string()));
    }

    #[test]
    fn save_message_and_list() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");

        queries::insert_message(&db, "m1", "s1", "user", "Hello!", None, None, None, None)
            .expect("insert m1");
        queries::insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Hi there!",
            Some("claude-sonnet-4-6"),
            Some(10),
            Some(5),
            Some(1),
        )
        .expect("insert m2");

        let messages = queries::list_messages(&db, "s1").expect("list messages");
        assert_eq!(messages.len(), 2);
        let roles: Vec<&str> = messages.iter().map(|m| m.role.as_str()).collect();
        assert!(roles.contains(&"user"));
        assert!(roles.contains(&"assistant"));
    }

    #[test]
    fn save_message_accumulates_session_cost() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");

        queries::insert_message(
            &db,
            "m1",
            "s1",
            "assistant",
            "Response 1",
            Some("claude-sonnet-4-6"),
            Some(100),
            Some(50),
            Some(5),
        )
        .expect("insert m1");
        queries::update_session_cost(&db, "s1", 100, 50, 5).expect("update cost 1");

        queries::insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Response 2",
            Some("claude-sonnet-4-6"),
            Some(200),
            Some(100),
            Some(10),
        )
        .expect("insert m2");
        queries::update_session_cost(&db, "s1", 200, 100, 10).expect("update cost 2");

        let session = queries::get_session(&db, "s1")
            .expect("get session")
            .expect("session exists");
        assert_eq!(session.total_input_tokens, Some(300));
        assert_eq!(session.total_output_tokens, Some(150));
        assert_eq!(session.total_cost_cents, Some(15));
    }

    #[test]
    fn delete_messages_after_removes_subsequent() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");

        queries::insert_message(&db, "m1", "s1", "user", "First", None, None, None, None)
            .expect("insert m1");
        queries::insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Second",
            None,
            None,
            None,
            None,
        )
        .expect("insert m2");
        queries::insert_message(&db, "m3", "s1", "user", "Third", None, None, None, None)
            .expect("insert m3");

        let deleted = queries::delete_messages_after(&db, "s1", "m1").expect("delete after m1");
        assert_eq!(deleted, 2);

        let remaining = queries::list_messages(&db, "s1").expect("list remaining");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "m1");
    }

    #[test]
    fn delete_single_message_removes_target() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");

        queries::insert_message(&db, "m1", "s1", "user", "First", None, None, None, None)
            .expect("insert m1");
        queries::insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Second",
            None,
            None,
            None,
            None,
        )
        .expect("insert m2");

        queries::delete_single_message(&db, "s1", "m2").expect("delete single message");
        let messages = queries::list_messages(&db, "s1").expect("list messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, "m1");
    }

    #[test]
    fn update_message_content_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");
        queries::insert_message(&db, "m1", "s1", "user", "Original", None, None, None, None)
            .expect("insert m1");

        queries::update_message_content(&db, "m1", "Edited content").expect("update content");

        let messages = queries::list_messages(&db, "s1").expect("list messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "Edited content");
    }

    #[test]
    fn update_session_model_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");
        queries::update_session_model(&db, "s1", "claude-opus-4-6").expect("update model");

        let session = queries::get_session(&db, "s1")
            .expect("get session")
            .expect("session exists");
        assert_eq!(session.model, "claude-opus-4-6");
    }

    #[test]
    fn toggle_session_pinned_works() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");

        db.with_conn(|conn| queries::update_session_pinned(conn, "s1", true))
            .expect("pin session");
        let session = queries::get_session(&db, "s1")
            .expect("get pinned session")
            .expect("session exists");
        assert_eq!(session.pinned, Some(true));

        db.with_conn(|conn| queries::update_session_pinned(conn, "s1", false))
            .expect("unpin session");
        let session = queries::get_session(&db, "s1")
            .expect("get unpinned session")
            .expect("session exists");
        assert_eq!(session.pinned, Some(false));
    }

    #[test]
    fn duplicate_session_creates_copy() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert original");
        queries::update_session_title(&db, "s1", "Original Title").expect("title original");

        queries::duplicate_session_metadata_only(&db, "s1", "s2").expect("duplicate metadata");

        let original = queries::get_session(&db, "s1")
            .expect("get original")
            .expect("original exists");
        let copy = queries::get_session(&db, "s2")
            .expect("get copy")
            .expect("copy exists");
        assert_eq!(copy.model, original.model);
        assert_ne!(copy.id, original.id);
        assert_eq!(copy.parent_session_id, Some("s1".to_string()));
        assert_eq!(copy.title, Some("Original Title (Copy)".to_string()));
    }

    #[test]
    fn fork_session_copies_messages_up_to_point() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");
        queries::insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None)
            .expect("insert m1");
        queries::insert_message(&db, "m2", "s1", "assistant", "Hi", None, None, None, None)
            .expect("insert m2");
        queries::insert_message(&db, "m3", "s1", "user", "More", None, None, None, None)
            .expect("insert m3");

        let new_id = uuid::Uuid::new_v4().to_string();
        queries::fork_session_up_to(&db, "s1", &new_id, "m2").expect("fork session");
        let forked_msgs = queries::list_messages(&db, &new_id).expect("forked messages");
        assert_eq!(forked_msgs.len(), 2);

        let orig_msgs = queries::list_messages(&db, "s1").expect("orig messages");
        assert_eq!(orig_msgs.len(), 3);
    }

    #[test]
    fn session_has_messages_checks_correctly() {
        let db = test_db();
        queries::insert_session(&db, "s1", None, "claude-sonnet-4-6").expect("insert session");

        assert_eq!(
            queries::count_session_messages(&db, "s1").expect("count empty messages"),
            0
        );

        queries::insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None)
            .expect("insert message");
        assert!(
            queries::count_session_messages(&db, "s1").expect("count messages") > 0,
            "message count should be positive after insert"
        );
    }
}
