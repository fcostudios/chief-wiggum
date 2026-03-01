//! Typed query functions for all database operations.
//!
//! All SQL lives here — no raw queries in command handlers (GUIDE-001 §2.6).
//! Every function takes &Database and uses parameterized queries.

use super::Database;
use crate::AppError;
use serde::{Deserialize, Serialize};

// ── Projects ───────────────────────────────────────────────────

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn insert_project(db: &Database, id: &str, name: &str, path: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name, path],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn get_project(db: &Database, id: &str) -> Result<Option<ProjectRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, path, default_model, default_effort, created_at, last_opened_at
             FROM projects WHERE id = ?1",
        )?;
        let row = stmt.query_row(rusqlite::params![id], |row| {
            Ok(ProjectRow {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                default_model: row.get(3)?,
                default_effort: row.get(4)?,
                created_at: row.get(5)?,
                last_opened_at: row.get(6)?,
            })
        });
        match row {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn list_projects(db: &Database) -> Result<Vec<ProjectRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, path, default_model, default_effort, created_at, last_opened_at
             FROM projects ORDER BY last_opened_at DESC NULLS LAST",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ProjectRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    default_model: row.get(3)?,
                    default_effort: row.get(4)?,
                    created_at: row.get(5)?,
                    last_opened_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

// ── Sessions ───────────────────────────────────────────────────

#[tracing::instrument(target = "db/queries", level = "info", skip(db, model))]
pub fn insert_session(
    db: &Database,
    id: &str,
    project_id: Option<&str>,
    model: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO sessions (id, project_id, model) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, project_id, model],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn get_session(db: &Database, id: &str) -> Result<Option<SessionRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, model, status, parent_session_id,
                    context_tokens, total_input_tokens, total_output_tokens, total_cost_cents,
                    created_at, updated_at, cli_session_id, pinned
             FROM sessions WHERE id = ?1",
        )?;
        let row = stmt.query_row(rusqlite::params![id], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                model: row.get(3)?,
                status: row.get(4)?,
                parent_session_id: row.get(5)?,
                context_tokens: row.get(6)?,
                total_input_tokens: row.get(7)?,
                total_output_tokens: row.get(8)?,
                total_cost_cents: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                cli_session_id: row.get(12)?,
                pinned: row.get(13)?,
            })
        });
        match row {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_session_cost(
    db: &Database,
    session_id: &str,
    input_tokens: i64,
    output_tokens: i64,
    cost_cents: i64,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET
                total_input_tokens = total_input_tokens + ?2,
                total_output_tokens = total_output_tokens + ?3,
                total_cost_cents = total_cost_cents + ?4,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            rusqlite::params![session_id, input_tokens, output_tokens, cost_cents],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn list_sessions(db: &Database) -> Result<Vec<SessionRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, model, status, parent_session_id,
                    context_tokens, total_input_tokens, total_output_tokens, total_cost_cents,
                    created_at, updated_at, cli_session_id, pinned
             FROM sessions ORDER BY updated_at DESC NULLS LAST, rowid DESC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SessionRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    model: row.get(3)?,
                    status: row.get(4)?,
                    parent_session_id: row.get(5)?,
                    context_tokens: row.get(6)?,
                    total_input_tokens: row.get(7)?,
                    total_output_tokens: row.get(8)?,
                    total_cost_cents: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    cli_session_id: row.get(12)?,
                    pinned: row.get(13)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn delete_session(db: &Database, id: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        // Delete child records first (no ON DELETE CASCADE in schema)
        conn.execute(
            "DELETE FROM cost_events WHERE session_id = ?1",
            rusqlite::params![id],
        )?;
        conn.execute(
            "DELETE FROM agents WHERE session_id = ?1",
            rusqlite::params![id],
        )?;
        conn.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            rusqlite::params![id],
        )?;
        conn.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn count_session_messages(db: &Database, session_id: &str) -> Result<i64, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn duplicate_session_metadata_only(
    db: &Database,
    source_id: &str,
    new_id: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        let inserted = conn.execute(
            r#"
            INSERT INTO sessions (id, project_id, title, model, status, parent_session_id)
            SELECT
                ?2,
                project_id,
                CASE
                    WHEN title IS NULL OR trim(title) = '' THEN 'New Session (Copy)'
                    ELSE title || ' (Copy)'
                END,
                model,
                'active',
                id
            FROM sessions
            WHERE id = ?1
            "#,
            rusqlite::params![source_id, new_id],
        )?;

        if inserted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db, title))]
pub fn update_session_title(db: &Database, id: &str, title: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET title = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id, title],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_session_model(db: &Database, id: &str, model: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET model = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id, model],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_session_cli_id(
    db: &Database,
    id: &str,
    cli_session_id: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET cli_session_id = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id, cli_session_id],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(conn))]
pub fn update_session_pinned(
    conn: &rusqlite::Connection,
    session_id: &str,
    pinned: bool,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE sessions SET pinned = ?1 WHERE id = ?2",
        rusqlite::params![pinned, session_id],
    )?;
    Ok(())
}

// ── Messages ───────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
#[tracing::instrument(target = "db/queries", level = "info", skip(db, content, model))]
pub fn insert_message(
    db: &Database,
    id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    model: Option<&str>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cost_cents: Option<i64>,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, model, input_tokens, output_tokens, cost_cents)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, session_id, role, content, model, input_tokens, output_tokens, cost_cents],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn list_messages(db: &Database, session_id: &str) -> Result<Vec<MessageRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, model, input_tokens, output_tokens,
                    thinking_tokens, cost_cents, is_compacted, created_at
             FROM messages WHERE session_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok(MessageRow {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    model: row.get(4)?,
                    input_tokens: row.get(5)?,
                    output_tokens: row.get(6)?,
                    thinking_tokens: row.get(7)?,
                    cost_cents: row.get(8)?,
                    is_compacted: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn delete_messages_after(
    db: &Database,
    session_id: &str,
    after_message_id: &str,
) -> Result<usize, AppError> {
    db.with_conn(|conn| {
        let anchor_rowid: i64 = conn.query_row(
            "SELECT rowid FROM messages WHERE id = ?1 AND session_id = ?2",
            rusqlite::params![after_message_id, session_id],
            |row| row.get(0),
        )?;

        let deleted = conn.execute(
            "DELETE FROM messages WHERE session_id = ?1 AND rowid > ?2",
            rusqlite::params![session_id, anchor_rowid],
        )?;
        Ok(deleted)
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn delete_single_message(
    db: &Database,
    session_id: &str,
    message_id: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        let deleted = conn.execute(
            "DELETE FROM messages WHERE id = ?1 AND session_id = ?2",
            rusqlite::params![message_id, session_id],
        )?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn fork_session_up_to(
    db: &Database,
    source_session_id: &str,
    new_session_id: &str,
    up_to_message_id: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        let anchor_rowid: i64 = conn.query_row(
            "SELECT rowid FROM messages WHERE id = ?1 AND session_id = ?2",
            rusqlite::params![up_to_message_id, source_session_id],
            |row| row.get(0),
        )?;

        let inserted = conn.execute(
            r#"
            INSERT INTO sessions (id, project_id, title, model, status, parent_session_id)
            SELECT
                ?2,
                project_id,
                CASE
                    WHEN title IS NULL OR trim(title) = '' THEN 'New Session (Fork)'
                    ELSE title || ' (Fork)'
                END,
                model,
                'active',
                id
            FROM sessions
            WHERE id = ?1
            "#,
            rusqlite::params![source_session_id, new_session_id],
        )?;
        if inserted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        conn.execute(
            r#"
            INSERT INTO messages (
                id, session_id, role, content, model, input_tokens, output_tokens, cost_cents, is_compacted, created_at
            )
            SELECT
                lower(hex(randomblob(16))),
                ?2,
                role,
                content,
                model,
                input_tokens,
                output_tokens,
                cost_cents,
                is_compacted,
                created_at
            FROM messages
            WHERE session_id = ?1 AND rowid <= ?3
            ORDER BY rowid ASC
            "#,
            rusqlite::params![source_session_id, new_session_id, anchor_rowid],
        )?;

        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db, new_content))]
pub fn update_message_content(
    db: &Database,
    message_id: &str,
    new_content: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        let updated = conn.execute(
            "UPDATE messages SET content = ?1 WHERE id = ?2",
            rusqlite::params![new_content, message_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    })
}

// ── Cost Events ────────────────────────────────────────────────

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
#[allow(clippy::too_many_arguments)]
pub fn insert_cost_event(
    db: &Database,
    session_id: &str,
    agent_id: Option<&str>,
    model: &str,
    input_tokens: i64,
    output_tokens: i64,
    cost_cents: i64,
    event_type: Option<&str>,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO cost_events (session_id, agent_id, model, input_tokens, output_tokens, cost_cents, event_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![session_id, agent_id, model, input_tokens, output_tokens, cost_cents, event_type],
        )?;
        Ok(())
    })
}

// ── Action History ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionHistoryInsert {
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub action_name: String,
    pub command: String,
    pub category: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub output_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionHistoryEntry {
    pub id: i64,
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub action_name: String,
    pub command: String,
    pub category: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub output_preview: Option<String>,
    pub created_at: String,
}

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn insert_action_history(db: &Database, entry: &ActionHistoryInsert) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO action_history (
                action_id, project_id, project_name, action_name, command, category,
                started_at, ended_at, exit_code, duration_ms, output_preview
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                entry.action_id,
                entry.project_id,
                entry.project_name,
                entry.action_name,
                entry.command,
                entry.category,
                entry.started_at,
                entry.ended_at,
                entry.exit_code,
                entry.duration_ms,
                entry.output_preview
            ],
        )?;
        Ok(())
    })
}

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn get_action_history(
    db: &Database,
    project_id: &str,
    limit: u32,
) -> Result<Vec<ActionHistoryEntry>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, action_id, project_id, project_name, action_name, command, category,
                    started_at, ended_at, exit_code, duration_ms, output_preview, created_at
             FROM action_history
             WHERE project_id = ?1
             ORDER BY started_at DESC, id DESC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![project_id, i64::from(limit)], |row| {
                Ok(ActionHistoryEntry {
                    id: row.get(0)?,
                    action_id: row.get(1)?,
                    project_id: row.get(2)?,
                    project_name: row.get(3)?,
                    action_name: row.get(4)?,
                    command: row.get(5)?,
                    category: row.get(6)?,
                    started_at: row.get(7)?,
                    ended_at: row.get(8)?,
                    exit_code: row.get(9)?,
                    duration_ms: row.get(10)?,
                    output_preview: row.get(11)?,
                    created_at: row.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

// ── Row types ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub default_model: Option<String>,
    pub default_effort: Option<String>,
    pub created_at: Option<String>,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRow {
    pub id: String,
    pub project_id: Option<String>,
    pub title: Option<String>,
    pub model: String,
    pub status: Option<String>,
    pub parent_session_id: Option<String>,
    pub context_tokens: Option<i64>,
    pub total_input_tokens: Option<i64>,
    pub total_output_tokens: Option<i64>,
    pub total_cost_cents: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub cli_session_id: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRow {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub thinking_tokens: Option<i64>,
    pub cost_cents: Option<i64>,
    pub is_compacted: Option<bool>,
    pub created_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().unwrap()
    }

    #[test]
    fn crud_project() {
        let db = test_db();
        insert_project(&db, "p1", "My Project", "/home/user/project").unwrap();

        let proj = get_project(&db, "p1").unwrap().unwrap();
        assert_eq!(proj.name, "My Project");
        assert_eq!(proj.path, "/home/user/project");
    }

    #[test]
    fn list_projects_ordered_by_last_opened() {
        let db = test_db();
        insert_project(&db, "p1", "Alpha", "/alpha").unwrap();
        insert_project(&db, "p2", "Beta", "/beta").unwrap();

        let projects = list_projects(&db).unwrap();
        assert_eq!(projects.len(), 2);
    }

    #[test]
    fn crud_session() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.model, "claude-sonnet-4-6");
        assert_eq!(session.status.as_deref(), Some("active"));
    }

    #[test]
    fn session_cost_accumulates() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        update_session_cost(&db, "s1", 100, 200, 5).unwrap();
        update_session_cost(&db, "s1", 50, 100, 3).unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.total_input_tokens, Some(150));
        assert_eq!(session.total_output_tokens, Some(300));
        assert_eq!(session.total_cost_cents, Some(8));
    }

    #[test]
    fn crud_messages() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();
        insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Hi there!",
            Some("claude-sonnet-4-6"),
            Some(10),
            Some(20),
            Some(1),
        )
        .unwrap();

        let messages = list_messages(&db, "s1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn insert_cost_event_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        insert_cost_event(
            &db,
            "s1",
            None,
            "claude-sonnet-4-6",
            100,
            200,
            5,
            Some("message"),
        )
        .unwrap();
    }

    #[test]
    fn duplicate_project_path_fails() {
        let db = test_db();
        insert_project(&db, "p1", "Proj A", "/same/path").unwrap();
        let result = insert_project(&db, "p2", "Proj B", "/same/path");
        assert!(
            result.is_err(),
            "Duplicate path should fail UNIQUE constraint"
        );
    }

    #[test]
    fn list_sessions_ordered_by_updated() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
        insert_session(&db, "s2", Some("p1"), "claude-opus-4-6").unwrap();

        let sessions = list_sessions(&db).unwrap();
        assert_eq!(sessions.len(), 2);
        // s2 was inserted last, so it should be first (most recently updated)
        assert_eq!(sessions[0].id, "s2");
    }

    #[test]
    fn delete_session_cascades() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();

        delete_session(&db, "s1").unwrap();

        assert!(get_session(&db, "s1").unwrap().is_none());
        assert!(list_messages(&db, "s1").unwrap().is_empty());
    }

    #[test]
    fn update_session_title_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        update_session_title(&db, "s1", "My Chat").unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.title.as_deref(), Some("My Chat"));
    }

    #[test]
    fn update_session_model_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        update_session_model(&db, "s1", "claude-opus-4-6").unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.model, "claude-opus-4-6");
    }

    #[test]
    fn list_sessions_empty_when_none() {
        let db = test_db();
        let sessions = list_sessions(&db).unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn update_session_cli_id_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert!(session.cli_session_id.is_none());

        update_session_cli_id(&db, "s1", "cli-abc-123").unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert_eq!(session.cli_session_id.as_deref(), Some("cli-abc-123"));
    }

    #[test]
    fn update_session_pinned_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert!(!session.pinned.unwrap_or(false));

        db.with_conn(|conn| update_session_pinned(conn, "s1", true))
            .unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert!(session.pinned.unwrap_or(false));

        db.with_conn(|conn| update_session_pinned(conn, "s1", false))
            .unwrap();

        let session = get_session(&db, "s1").unwrap().unwrap();
        assert!(!session.pinned.unwrap_or(false));
    }

    #[test]
    fn duplicate_session_metadata_only_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
        update_session_title(&db, "s1", "Alpha").unwrap();
        update_session_cost(&db, "s1", 100, 200, 5).unwrap();
        update_session_cli_id(&db, "s1", "cli-abc").unwrap();
        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();

        let new_id = "s2";
        duplicate_session_metadata_only(&db, "s1", new_id).unwrap();

        let dup = get_session(&db, new_id).unwrap().unwrap();
        assert_eq!(dup.project_id.as_deref(), Some("p1"));
        assert_eq!(dup.model, "claude-sonnet-4-6");
        assert_eq!(dup.title.as_deref(), Some("Alpha (Copy)"));
        assert_eq!(dup.parent_session_id.as_deref(), Some("s1"));
        assert_eq!(dup.total_input_tokens, Some(0));
        assert_eq!(dup.total_output_tokens, Some(0));
        assert_eq!(dup.total_cost_cents, Some(0));
        assert!(dup.cli_session_id.is_none());
        assert_eq!(list_messages(&db, new_id).unwrap().len(), 0);
    }

    #[test]
    fn count_session_messages_works() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();
        insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

        assert_eq!(count_session_messages(&db, "s1").unwrap(), 0);

        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();
        assert_eq!(count_session_messages(&db, "s1").unwrap(), 1);
    }

    #[test]
    fn delete_single_message_removes_only_target() {
        let db = test_db();
        insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        insert_message(&db, "m1", "s1", "user", "First", None, None, None, None).unwrap();
        insert_message(
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
        .unwrap();
        insert_message(&db, "m3", "s1", "user", "Third", None, None, None, None).unwrap();

        delete_single_message(&db, "s1", "m2").unwrap();
        let messages = list_messages(&db, "s1").unwrap();
        assert_eq!(messages.len(), 2);
        let ids: Vec<&str> = messages.iter().map(|m| m.id.as_str()).collect();
        assert!(ids.contains(&"m1"));
        assert!(ids.contains(&"m3"));
        assert!(!ids.contains(&"m2"));
    }

    #[test]
    fn delete_single_message_wrong_session_returns_error() {
        let db = test_db();
        insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();

        let result = delete_single_message(&db, "wrong-session", "m1");
        assert!(result.is_err());
    }

    #[test]
    fn fork_session_up_to_copies_messages_and_metadata() {
        let db = test_db();
        insert_project(&db, "proj1", "Project 1", "/tmp/proj1").unwrap();
        insert_session(&db, "s1", Some("proj1"), "claude-sonnet-4-6").unwrap();
        update_session_title(&db, "s1", "Original Session").unwrap();
        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();
        insert_message(
            &db,
            "m2",
            "s1",
            "assistant",
            "Hi there",
            Some("claude-sonnet-4-6"),
            Some(100),
            Some(50),
            Some(5),
        )
        .unwrap();
        insert_message(&db, "m3", "s1", "user", "Follow up", None, None, None, None).unwrap();
        insert_message(
            &db,
            "m4",
            "s1",
            "assistant",
            "More info",
            None,
            None,
            None,
            None,
        )
        .unwrap();

        let new_id = "s2";
        fork_session_up_to(&db, "s1", new_id, "m2").unwrap();

        let new_session = get_session(&db, new_id).unwrap().unwrap();
        assert_eq!(new_session.project_id, Some("proj1".to_string()));
        assert_eq!(new_session.parent_session_id, Some("s1".to_string()));
        assert_eq!(
            new_session.title,
            Some("Original Session (Fork)".to_string())
        );

        let messages = list_messages(&db, new_id).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "Hello");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Hi there");
    }

    #[test]
    fn fork_session_up_to_bad_message_id_returns_error() {
        let db = test_db();
        insert_session(&db, "s1", None, "claude-sonnet-4-6").unwrap();
        insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();

        let result = fork_session_up_to(&db, "s1", "s2", "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn insert_and_list_action_history_ordered_desc() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();

        insert_action_history(
            &db,
            &ActionHistoryInsert {
                action_id: "a1".to_string(),
                project_id: "p1".to_string(),
                project_name: "Proj".to_string(),
                action_name: "build".to_string(),
                command: "npm run build".to_string(),
                category: "build".to_string(),
                started_at: "2026-03-01T10:00:00Z".to_string(),
                ended_at: Some("2026-03-01T10:01:00Z".to_string()),
                exit_code: Some(0),
                duration_ms: Some(60_000),
                output_preview: Some("ok".to_string()),
            },
        )
        .unwrap();

        insert_action_history(
            &db,
            &ActionHistoryInsert {
                action_id: "a2".to_string(),
                project_id: "p1".to_string(),
                project_name: "Proj".to_string(),
                action_name: "test".to_string(),
                command: "npm test".to_string(),
                category: "test".to_string(),
                started_at: "2026-03-01T11:00:00Z".to_string(),
                ended_at: Some("2026-03-01T11:00:30Z".to_string()),
                exit_code: Some(1),
                duration_ms: Some(30_000),
                output_preview: Some("fail".to_string()),
            },
        )
        .unwrap();

        let rows = get_action_history(&db, "p1", 50).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].action_id, "a2");
        assert_eq!(rows[1].action_id, "a1");
        assert_eq!(rows[0].project_id, "p1");
    }

    #[test]
    fn get_action_history_respects_limit() {
        let db = test_db();
        insert_project(&db, "p1", "Proj", "/proj").unwrap();

        for i in 0..3 {
            insert_action_history(
                &db,
                &ActionHistoryInsert {
                    action_id: format!("a{}", i),
                    project_id: "p1".to_string(),
                    project_name: "Proj".to_string(),
                    action_name: "build".to_string(),
                    command: "npm run build".to_string(),
                    category: "build".to_string(),
                    started_at: format!("2026-03-01T1{}:00:00Z", i),
                    ended_at: None,
                    exit_code: None,
                    duration_ms: None,
                    output_preview: None,
                },
            )
            .unwrap();
        }

        let rows = get_action_history(&db, "p1", 2).unwrap();
        assert_eq!(rows.len(), 2);
    }
}
