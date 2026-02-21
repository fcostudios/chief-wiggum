//! Database connection management.
//!
//! Creates and configures SQLite connections with WAL mode.
//! Location: `~/.chiefwiggum/db/chiefwiggum.sqlite`

use crate::AppError;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Thread-safe database wrapper.
/// Uses Mutex because rusqlite::Connection is not Send+Sync.
pub struct Database {
    conn: Mutex<Connection>,
    db_path: PathBuf,
}

impl Database {
    /// Open or create the database at the default location.
    /// Creates parent directories if needed.
    /// Enables WAL mode and runs pending migrations.
    pub fn open_default() -> Result<Self, AppError> {
        let db_path = Self::default_path()?;
        Self::open(&db_path)
    }

    /// Open or create the database at a specific path.
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;

        // Enable WAL mode for concurrent reads (SPEC-005 §6, ADR-001 §2.5)
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;

        let db = Self {
            conn: Mutex::new(conn),
            db_path: path.to_path_buf(),
        };

        // Run migrations on open
        db.run_migrations()?;

        Ok(db)
    }

    /// Open an in-memory database (for testing).
    pub fn open_in_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        let db = Self {
            conn: Mutex::new(conn),
            db_path: PathBuf::from(":memory:"),
        };

        db.run_migrations()?;

        Ok(db)
    }

    /// Execute a closure with access to the connection.
    /// All database operations go through this method.
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Other(format!("Database mutex poisoned: {}", e)))?;
        Ok(f(&conn)?)
    }

    /// Get the database file path.
    pub fn path(&self) -> &Path {
        &self.db_path
    }

    /// Default database path: ~/.chiefwiggum/db/chiefwiggum.sqlite
    fn default_path() -> Result<PathBuf, AppError> {
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::Other("Could not determine home directory".to_string()))?;
        Ok(home
            .join(".chiefwiggum")
            .join("db")
            .join("chiefwiggum.sqlite"))
    }
}
