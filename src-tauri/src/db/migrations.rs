//! Forward-only migration system per SPEC-005 §6.
//!
//! Migrations are defined as a static list. On startup, the system:
//! 1. Reads current schema_version
//! 2. Backs up the database file (if not in-memory)
//! 3. Applies pending migrations in a transaction
//! 4. Updates schema_version

use crate::AppError;
use rusqlite::Connection;
use std::path::Path;
use std::time::{Duration, SystemTime};

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
    Migration {
        version: 3,
        description: "Add pinned column to sessions for section grouping",
        sql: "ALTER TABLE sessions ADD COLUMN pinned BOOLEAN DEFAULT 0;",
    },
    Migration {
        version: 4,
        description: "Add action_history table for Actions Center runtime history",
        sql: r#"
            CREATE TABLE IF NOT EXISTS action_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_id TEXT NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(id),
                project_name TEXT NOT NULL,
                action_name TEXT NOT NULL,
                command TEXT NOT NULL,
                category TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                exit_code INTEGER,
                duration_ms INTEGER,
                output_preview TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );

            CREATE INDEX IF NOT EXISTS idx_action_history_project
                ON action_history (project_id, started_at DESC);
        "#,
    },
    Migration {
        version: 5,
        description: "Add artifacts table for session artifact index (CHI-225)",
        sql: r#"
            CREATE TABLE IF NOT EXISTS artifacts (
                id            TEXT PRIMARY KEY,
                session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                message_id    TEXT NOT NULL,
                message_index INTEGER NOT NULL,
                block_index   INTEGER NOT NULL DEFAULT 0,
                type          TEXT NOT NULL CHECK(type IN ('code','file','plan','diagram','data')),
                language      TEXT,
                title         TEXT NOT NULL,
                preview       TEXT NOT NULL,
                content       TEXT NOT NULL,
                line_count    INTEGER NOT NULL DEFAULT 0,
                created_at    INTEGER NOT NULL,
                UNIQUE(message_id, block_index)
            );
            CREATE INDEX IF NOT EXISTS idx_artifacts_session
                ON artifacts(session_id, created_at DESC);
        "#,
    },
    Migration {
        version: 6,
        description:
            "Add message threading fields, stop_reason/is_error, and session cli/token totals",
        sql: r#"
            ALTER TABLE messages ADD COLUMN uuid TEXT;
            ALTER TABLE messages ADD COLUMN parent_uuid TEXT;
            ALTER TABLE messages ADD COLUMN stop_reason TEXT;
            ALTER TABLE messages ADD COLUMN is_error BOOLEAN DEFAULT FALSE;

            CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(uuid);
            CREATE INDEX IF NOT EXISTS idx_messages_parent_uuid ON messages(parent_uuid);

            ALTER TABLE sessions ADD COLUMN cli_version TEXT;
            ALTER TABLE sessions ADD COLUMN total_thinking_tokens INTEGER DEFAULT 0;
            ALTER TABLE sessions ADD COLUMN total_cache_read_tokens INTEGER DEFAULT 0;
            ALTER TABLE sessions ADD COLUMN total_cache_write_tokens INTEGER DEFAULT 0;
        "#,
    },
    Migration {
        version: 7,
        description: "Add performance indexes for messages and sessions (CHI-292)",
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
                ON messages(session_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
                ON sessions(updated_at DESC);
        "#,
    },
    Migration {
        version: 8,
        description: "Add prompt_templates table (CHI-259)",
        sql: r#"
            CREATE TABLE IF NOT EXISTS prompt_templates (
                id          TEXT PRIMARY KEY NOT NULL,
                name        TEXT NOT NULL,
                content     TEXT NOT NULL,
                variables   TEXT NOT NULL DEFAULT '[]',
                created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                usage_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_templates_usage
                ON prompt_templates(usage_count DESC);
        "#,
    },
    Migration {
        version: 9,
        description:
            "Add handover columns — jsonl_path/jsonl_last_uuid on sessions, jsonl_uuid on messages (CHI-345)",
        sql: r#"
            ALTER TABLE sessions ADD COLUMN jsonl_path TEXT;
            ALTER TABLE sessions ADD COLUMN jsonl_last_uuid TEXT;
            ALTER TABLE messages ADD COLUMN jsonl_uuid TEXT;
            CREATE INDEX IF NOT EXISTS idx_messages_jsonl_uuid ON messages(jsonl_uuid);
        "#,
    },
];

impl super::Database {
    /// Run all pending migrations.
    /// Called automatically on Database::open().
    pub(crate) fn run_migrations(&self) -> Result<(), AppError> {
        if self.path().to_str() != Some(":memory:") && self.path().exists() {
            let (current_version, has_user_tables) = self.with_conn(|conn| {
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
                let has_user_tables: bool = conn.query_row(
                    "SELECT EXISTS(
                        SELECT 1
                        FROM sqlite_master
                        WHERE type='table'
                          AND name NOT LIKE 'sqlite_%'
                          AND name != 'schema_version'
                    )",
                    [],
                    |row| row.get(0),
                )?;
                Ok((current_version, has_user_tables))
            })?;

            let latest_version = MIGRATIONS.last().map(|m| m.version).unwrap_or(0);
            if has_user_tables && current_version < latest_version {
                let backup_dir = self.path().parent().unwrap_or(self.path()).join("backups");
                self.with_conn(|conn| {
                    create_backup_from_conn(conn, self.path(), &backup_dir, current_version)
                        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                    Ok(())
                })?;
            }
        }

        self.with_conn(run_migrations_on_conn)
    }
}

/// Create a timestamped backup before applying migrations.
/// Prunes backups older than 30 days.
#[cfg(test)]
pub(crate) fn create_backup_if_needed(
    db_path: &Path,
    backup_dir: &Path,
    current_version: i32,
) -> Result<(), AppError> {
    if !db_path.exists() || db_path.to_str() == Some(":memory:") {
        return Ok(());
    }

    std::fs::create_dir_all(backup_dir)?;
    let _ = crate::security::permissions::harden_directory_permissions(backup_dir);

    let src_conn = Connection::open(db_path)?;
    create_backup_from_conn(&src_conn, db_path, backup_dir, current_version)?;
    Ok(())
}

fn create_backup_from_conn(
    src_conn: &Connection,
    db_path: &Path,
    backup_dir: &Path,
    current_version: i32,
) -> Result<(), AppError> {
    std::fs::create_dir_all(backup_dir)?;
    let _ = crate::security::permissions::harden_directory_permissions(backup_dir);

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_name = format!("chiefwiggum_v{}_{}.sqlite", current_version, timestamp);
    let backup_path = backup_dir.join(backup_name);

    let backup_attempt = (|| -> Result<(), rusqlite::Error> {
        let mut dst_conn = Connection::open(&backup_path)?;
        let backup = rusqlite::backup::Backup::new(src_conn, &mut dst_conn)?;
        backup.run_to_completion(100, Duration::from_millis(50), None)?;
        Ok(())
    })();

    if let Err(err) = backup_attempt {
        let msg = err.to_string();
        if msg.contains("backup is not supported with encrypted databases") {
            tracing::warn!(
                "SQLite backup API unavailable for encrypted DB, using file snapshot fallback: {}",
                msg
            );
            // Flush WAL into main DB file before taking encrypted snapshot.
            let _ = src_conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            std::fs::copy(db_path, &backup_path)?;
        } else if msg.contains("not an error") || msg.contains("file is not a database") {
            return Err(AppError::DatabaseEncryption(format!(
                "Failed to create migration backup from encrypted database (key may be missing): {}",
                msg
            )));
        } else {
            return Err(AppError::Database(err));
        }
    }

    crate::security::permissions::harden_file_permissions(&backup_path)?;
    tracing::info!("Created pre-migration backup: {:?}", backup_path);

    prune_old_backups(backup_dir, 30)?;
    Ok(())
}

fn prune_old_backups(backup_dir: &Path, max_age_days: u64) -> Result<(), AppError> {
    let cutoff = SystemTime::now() - Duration::from_secs(max_age_days * 24 * 60 * 60);
    let entries = match std::fs::read_dir(backup_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("sqlite") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        if modified < cutoff {
            tracing::info!("Pruning old backup: {:?}", path);
            let _ = std::fs::remove_file(&path);
        }
    }

    Ok(())
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
        assert_eq!(version, 9);
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();
        run_migrations_on_conn(&conn).unwrap(); // Second call is a no-op
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 9);
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
            "action_history",
            "artifacts",
            "prompt_templates",
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

        assert_eq!(rows.len(), 9);
        assert_eq!(rows[0].0, 1);
        assert!(rows[0].1.contains("Initial schema"));
        assert_eq!(rows[1].0, 2);
        assert!(rows[1].1.contains("cli_session_id"));
        assert_eq!(rows[2].0, 3);
        assert!(rows[2].1.contains("pinned"));
        assert_eq!(rows[3].0, 4);
        assert!(rows[3].1.contains("action_history"));
        assert_eq!(rows[4].0, 5);
        assert!(rows[4].1.contains("artifacts"));
        assert_eq!(rows[5].0, 6);
        assert!(rows[5].1.contains("threading"));
        assert_eq!(rows[6].0, 7);
        assert!(rows[6].1.contains("performance indexes"));
        assert_eq!(rows[7].0, 8);
        assert!(rows[7].1.contains("prompt_templates"));
        assert_eq!(rows[8].0, 9);
        assert!(rows[8].1.contains("jsonl_path"));
    }

    #[test]
    fn migration_v9_adds_handover_columns() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let sess_cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(sessions)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };
        assert!(sess_cols.contains(&"jsonl_path".to_string()));
        assert!(sess_cols.contains(&"jsonl_last_uuid".to_string()));

        let msg_cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(messages)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };
        assert!(msg_cols.contains(&"jsonl_uuid".to_string()));

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 9);
    }

    #[test]
    fn migration_v6_adds_all_columns() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let msg_cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(messages)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };
        assert!(msg_cols.contains(&"uuid".to_string()));
        assert!(msg_cols.contains(&"parent_uuid".to_string()));
        assert!(msg_cols.contains(&"stop_reason".to_string()));
        assert!(msg_cols.contains(&"is_error".to_string()));

        let sess_cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(sessions)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };
        assert!(sess_cols.contains(&"cli_version".to_string()));
        assert!(sess_cols.contains(&"total_thinking_tokens".to_string()));
        assert!(sess_cols.contains(&"total_cache_read_tokens".to_string()));
        assert!(sess_cols.contains(&"total_cache_write_tokens".to_string()));
    }

    #[test]
    fn migration_v7_adds_performance_indexes() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let indexes: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='index'")
                .unwrap();
            stmt.query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };

        assert!(indexes.contains(&"idx_messages_session_created_at".to_string()));
        assert!(indexes.contains(&"idx_sessions_updated_at".to_string()));
    }

    #[test]
    fn migration_v8_adds_prompt_templates() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='prompt_templates'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(table_exists);
    }

    #[test]
    fn migration_v6_has_correct_indexes() {
        let conn = fresh_conn();
        run_migrations_on_conn(&conn).unwrap();

        let indexes: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages'",
                )
                .unwrap();
            stmt.query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };

        assert!(indexes.iter().any(|i| i == "idx_messages_uuid"));
        assert!(indexes.iter().any(|i| i == "idx_messages_parent_uuid"));
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

    #[test]
    fn backup_created_before_migration() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.sqlite");
        let backup_dir = dir.path().join("backups");

        let conn = Connection::open(&db_path).expect("open db path");
        conn.execute_batch(
            "CREATE TABLE sessions (id TEXT PRIMARY KEY, model TEXT);
             INSERT INTO sessions VALUES ('s1', 'sonnet');",
        )
        .expect("seed db");
        drop(conn);

        create_backup_if_needed(&db_path, &backup_dir, 0).expect("create backup");

        let backups: Vec<_> = std::fs::read_dir(&backup_dir)
            .expect("read backup dir")
            .filter_map(Result::ok)
            .collect();
        assert_eq!(backups.len(), 1);
        let backup_name = backups[0].file_name().to_string_lossy().to_string();
        assert!(backup_name.starts_with("chiefwiggum_v0_"));
        assert!(backup_name.ends_with(".sqlite"));
    }
}
