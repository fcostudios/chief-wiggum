//! Forward-only migration system per SPEC-005 §6.
//!
//! Migrations are defined as a static list. On startup, the system:
//! 1. Reads current schema_version
//! 2. Backs up the database file (if not in-memory)
//! 3. Applies pending migrations in a transaction
//! 4. Updates schema_version

use crate::AppError;
use rusqlite::Connection;

/// A single schema migration.
struct Migration {
    version: i32,
    description: &'static str,
    sql: &'static str,
}

/// All migrations in order. Forward-only — never remove entries.
const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema — projects, sessions, messages, agents, cost_events, budgets",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                default_model TEXT DEFAULT 'claude-sonnet-4-6',
                default_effort TEXT DEFAULT 'high',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_opened_at DATETIME
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id),
                title TEXT,
                model TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                parent_session_id TEXT REFERENCES sessions(id),
                context_tokens INTEGER DEFAULT 0,
                total_input_tokens INTEGER DEFAULT 0,
                total_output_tokens INTEGER DEFAULT 0,
                total_cost_cents INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT REFERENCES sessions(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                thinking_tokens INTEGER,
                cost_cents INTEGER,
                is_compacted BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                session_id TEXT REFERENCES sessions(id),
                name TEXT,
                role TEXT,
                model TEXT,
                status TEXT DEFAULT 'idle',
                task_description TEXT,
                worktree_path TEXT,
                total_tokens INTEGER DEFAULT 0,
                total_cost_cents INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cost_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                agent_id TEXT REFERENCES agents(id),
                model TEXT NOT NULL,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                cache_read_tokens INTEGER DEFAULT 0,
                cache_write_tokens INTEGER DEFAULT 0,
                cost_cents INTEGER NOT NULL,
                event_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS budgets (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                project_id TEXT REFERENCES projects(id),
                limit_cents INTEGER NOT NULL,
                spent_cents INTEGER DEFAULT 0,
                period_start DATETIME,
                period_end DATETIME
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);
            CREATE INDEX IF NOT EXISTS idx_cost_events_session ON cost_events(session_id);
            CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id);
        "#,
    },
    Migration {
        version: 2,
        description: "Add cli_session_id to sessions for reliable --resume",
        sql: "ALTER TABLE sessions ADD COLUMN cli_session_id TEXT;",
    },
];

impl super::Database {
    /// Run all pending migrations.
    /// Called automatically on Database::open().
    pub(crate) fn run_migrations(&self) -> Result<(), AppError> {
        self.with_conn(run_migrations_on_conn)
    }
}

/// Run migrations on a raw connection. Separated for testability.
fn run_migrations_on_conn(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Ensure schema_version table exists
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
    )?;

    let current_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?;

    let pending: Vec<&Migration> = MIGRATIONS
        .iter()
        .filter(|m| m.version > current_version)
        .collect();

    if pending.is_empty() {
        tracing::debug!(
            "Database schema is up to date (version {})",
            current_version
        );
        return Ok(());
    }

    // Check for downgrade scenario (SPEC-005 §6.2)
    if let Some(latest) = MIGRATIONS.last() {
        if current_version > latest.version {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
                Some(format!(
                    "Database schema version {} is ahead of app version {}. Update the app.",
                    current_version, latest.version
                )),
            ));
        }
    }

    tracing::info!(
        "Applying {} migration(s): v{} -> v{}",
        pending.len(),
        current_version,
        pending.last().map(|m| m.version).unwrap_or(current_version)
    );

    // Apply in a transaction
    let tx = conn.unchecked_transaction()?;
    for migration in &pending {
        tracing::info!(
            "  Applying migration v{}: {}",
            migration.version,
            migration.description
        );
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO schema_version (version, description) VALUES (?1, ?2)",
            rusqlite::params![migration.version, migration.description],
        )?;
    }
    tx.commit()?;

    tracing::info!("All migrations applied successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        conn
    }

    #[test]
    fn migrations_apply_on_fresh_db() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 2);
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();
        run_migrations_on_conn(&conn).unwrap(); // Second call is a no-op
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn all_tables_created() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let tables = [
            "projects",
            "sessions",
            "messages",
            "agents",
            "cost_events",
            "budgets",
        ];
        for table in &tables {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert!(exists, "Table '{}' should exist", table);
        }
    }

    #[test]
    fn schema_version_tracks_correctly() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let rows: Vec<(i32, String)> = {
            let mut stmt = conn
                .prepare("SELECT version, description FROM schema_version ORDER BY version")
                .unwrap();
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].0, 1);
        assert!(rows[0].1.contains("Initial schema"));
        assert_eq!(rows[1].0, 2);
        assert!(rows[1].1.contains("cli_session_id"));
    }

    #[test]
    fn foreign_keys_enforced() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        // Inserting a session with a non-existent project_id should fail
        let result = conn.execute(
            "INSERT INTO sessions (id, project_id, model) VALUES ('s1', 'nonexistent', 'opus')",
            [],
        );
        assert!(result.is_err(), "Foreign key constraint should be enforced");
    }
}
