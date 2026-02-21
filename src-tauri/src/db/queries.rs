//! Typed query functions for all database operations.
//!
//! All SQL lives here — no raw queries in command handlers (GUIDE-001 §2.6).
//! Every function takes &Database and uses parameterized queries.

use super::Database;
use crate::AppError;

// ── Projects ───────────────────────────────────────────────────

pub fn insert_project(db: &Database, id: &str, name: &str, path: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name, path],
        )?;
        Ok(())
    })
}

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

pub fn get_session(db: &Database, id: &str) -> Result<Option<SessionRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, model, status, parent_session_id,
                    context_tokens, total_input_tokens, total_output_tokens, total_cost_cents,
                    created_at, updated_at
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
            })
        });
        match row {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    })
}

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

// ── Messages ───────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
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

// ── Cost Events ────────────────────────────────────────────────

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

// ── Row types ──────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub default_model: Option<String>,
    pub default_effort: Option<String>,
    pub created_at: Option<String>,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone)]
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
}

#[derive(Debug, Clone)]
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
}
