//! Database connection management.
//!
//! Creates and configures SQLite connections with WAL mode.
//! Location: `~/.chiefwiggum/db/chiefwiggum.sqlite`
//!
//! CHI-288: Database encryption via SQLCipher with OS keychain key storage.
//! CHI-289: File and directory permission hardening for DB artifacts.

use crate::AppError;
use rusqlite::Connection;
use std::collections::BTreeMap;
use std::io::Read;
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
    ///
    /// On first run after CHI-288: detects unencrypted DB and migrates to
    /// encrypted format.
    pub fn open_default() -> Result<Self, AppError> {
        let db_path = Self::default_path()?;
        Self::open(&db_path)
    }

    /// Open or create the database at a specific path.
    ///
    /// If the DB file exists and is unencrypted, migrates it to encrypted format.
    /// If the DB file does not exist, creates a new encrypted DB.
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let db_exists = path.exists();
        let db_is_plaintext = if db_exists {
            is_unencrypted(path)?
        } else {
            false
        };

        let key = if db_exists && !db_is_plaintext {
            resolve_key_for_existing_encrypted_db(path)?
        } else {
            resolve_key_for_new_or_plaintext_db()?
        };

        if db_exists && db_is_plaintext {
            tracing::info!(
                path = ?path,
                "Detected unencrypted database — migrating to encrypted format"
            );
            migrate_to_encrypted(path, &key)?;
            tracing::info!(path = ?path, "Database migration to encrypted format complete");
        }

        let conn = open_with_verified_key(path, &key)?;

        // Enable WAL mode for concurrent reads (SPEC-005 §6, ADR-001 §2.5)
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        conn.pragma_update(None, "wal_autocheckpoint", 500)?;

        let db = Self {
            conn: Mutex::new(conn),
            db_path: path.to_path_buf(),
        };

        // Harden DB file + containing directories (CHI-289)
        if path.to_str() != Some(":memory:") {
            crate::security::permissions::harden_file_permissions(path)?;
            if let Some(parent) = path.parent() {
                crate::security::permissions::harden_directory_permissions(parent)?;
            }
            if let Some(root) = path.parent().and_then(|p| p.parent()) {
                crate::security::permissions::harden_directory_permissions(root)?;
            }
        }

        // Run migrations on open (will create backup if pending).
        db.run_migrations()?;

        Ok(db)
    }

    /// Open an in-memory database (for testing).
    /// In-memory DBs are not encrypted (no keychain access needed in tests).
    pub fn open_in_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "wal_autocheckpoint", 500)?;

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

fn apply_encryption_key(conn: &Connection, key: &str) -> Result<(), AppError> {
    let escaped = key.replace('\'', "''");
    conn.execute_batch(&format!("PRAGMA key = '{}';", escaped))
        .map_err(|e| AppError::DatabaseEncryption(format!("Failed to set encryption key: {}", e)))
}

fn open_with_verified_key(path: &Path, key: &str) -> Result<Connection, AppError> {
    let conn = Connection::open(path)?;
    apply_encryption_key(&conn, key)?;
    verify_encryption(&conn)?;
    Ok(conn)
}

fn resolve_key_for_new_or_plaintext_db() -> Result<String, AppError> {
    if let Some(env_key) = crate::security::keychain::get_env_db_key()
        .filter(|k| crate::security::keychain::is_valid_db_key_format(k))
    {
        crate::security::keychain::set_db_key(&env_key)?;
        return Ok(env_key);
    }

    if let Some(key) = crate::security::keychain::get_db_key()? {
        if crate::security::keychain::is_valid_db_key_format(&key) {
            return Ok(key);
        }
    }

    for key in crate::security::keychain::get_legacy_db_keys()? {
        if crate::security::keychain::is_valid_db_key_format(&key) {
            // Promote recovered key to canonical entry.
            crate::security::keychain::set_db_key(&key)?;
            return Ok(key);
        }
    }

    crate::security::keychain::get_or_create_db_key()
}

fn resolve_key_for_existing_encrypted_db(path: &Path) -> Result<String, AppError> {
    let mut candidates: Vec<String> = Vec::new();

    if let Some(env_key) = crate::security::keychain::get_env_db_key()
        .filter(|k| crate::security::keychain::is_valid_db_key_format(k))
    {
        candidates.push(env_key);
    }

    if let Some(stored_key) = crate::security::keychain::get_db_key()?
        .filter(|k| crate::security::keychain::is_valid_db_key_format(k))
    {
        if !candidates.contains(&stored_key) {
            candidates.push(stored_key);
        }
    }

    for key in crate::security::keychain::get_legacy_db_keys()? {
        if crate::security::keychain::is_valid_db_key_format(&key) && !candidates.contains(&key) {
            candidates.push(key);
        }
    }

    if candidates.is_empty() {
        return Err(AppError::DatabaseEncryption(
            "Encrypted database detected, but no encryption key was found in keychain or CHIEF_WIGGUM_DB_KEY. Restore the original key or restore from backup."
                .to_string(),
        ));
    }

    for key in &candidates {
        match open_with_verified_key(path, key) {
            Ok(_) => {
                // Ensure canonical keychain entry is aligned with the working key.
                crate::security::keychain::set_db_key(key)?;
                return Ok(key.clone());
            }
            Err(_) => continue,
        }
    }

    Err(AppError::DatabaseEncryption(
        "Encrypted database key mismatch: no available key could decrypt the existing database. If you have the old key, set CHIEF_WIGGUM_DB_KEY to recover; otherwise restore a backup or reset ~/.chiefwiggum/db/chiefwiggum.sqlite."
            .to_string(),
    ))
}

fn verify_encryption(conn: &Connection) -> Result<(), AppError> {
    conn.query_row("SELECT COUNT(*) FROM sqlite_master", [], |_| Ok(()))
        .map_err(|e| {
            AppError::DatabaseEncryption(format!("Failed to verify encrypted database: {}", e))
        })
}

/// Check if an existing database file is unencrypted.
/// Unencrypted SQLite files start with the magic header `SQLite format 3\0`.
fn is_unencrypted(path: &Path) -> Result<bool, AppError> {
    let mut file = std::fs::File::open(path).map_err(|e| {
        AppError::DatabaseEncryption(format!("Failed to read DB header at {:?}: {}", path, e))
    })?;
    let mut header = [0u8; 16];
    let read = file.read(&mut header).map_err(|e| {
        AppError::DatabaseEncryption(format!("Failed to read DB header at {:?}: {}", path, e))
    })?;
    Ok(read >= 16 && &header == b"SQLite format 3\0")
}

fn migrate_to_encrypted(path: &Path, key: &str) -> Result<(), AppError> {
    let encrypted_path = path.with_extension("sqlite.enc");
    if encrypted_path.exists() {
        std::fs::remove_file(&encrypted_path)?;
    }

    let plain_conn = Connection::open(path).map_err(|e| {
        AppError::DatabaseEncryption(format!(
            "Failed to open unencrypted DB for migration: {}",
            e
        ))
    })?;
    let original_counts = count_table_rows(&plain_conn)?;

    let escaped_target = encrypted_path
        .to_str()
        .ok_or(AppError::InvalidPath)?
        .replace('\'', "''");
    let escaped_key = key.replace('\'', "''");
    plain_conn
        .execute_batch(&format!(
            "ATTACH DATABASE '{}' AS encrypted KEY '{}';",
            escaped_target, escaped_key
        ))
        .map_err(|e| {
            AppError::DatabaseEncryption(format!("Failed to attach encrypted DB: {}", e))
        })?;
    plain_conn
        .query_row("SELECT sqlcipher_export('encrypted')", [], |_| Ok(()))
        .map_err(|e| AppError::DatabaseEncryption(format!("sqlcipher_export failed: {}", e)))?;
    plain_conn
        .execute_batch("DETACH DATABASE encrypted;")
        .map_err(|e| {
            AppError::DatabaseEncryption(format!("Failed to detach encrypted DB: {}", e))
        })?;
    drop(plain_conn);

    let encrypted_conn = Connection::open(&encrypted_path).map_err(|e| {
        AppError::DatabaseEncryption(format!("Failed to open migrated encrypted DB: {}", e))
    })?;
    apply_encryption_key(&encrypted_conn, key)?;
    let encrypted_counts = count_table_rows(&encrypted_conn)?;
    if original_counts != encrypted_counts {
        return Err(AppError::DatabaseEncryption(
            "Encrypted migration row-count verification failed".to_string(),
        ));
    }
    drop(encrypted_conn);

    let backup_path = path.with_extension("sqlite.pre-encrypt.bak");
    if backup_path.exists() {
        std::fs::remove_file(&backup_path)?;
    }
    std::fs::rename(path, &backup_path)?;
    if let Err(e) = std::fs::rename(&encrypted_path, path) {
        let _ = std::fs::rename(&backup_path, path);
        return Err(AppError::DatabaseEncryption(format!(
            "Failed to swap encrypted DB into place: {}",
            e
        )));
    }

    // Avoid leaving an unencrypted copy around after successful migration.
    if let Err(e) = std::fs::remove_file(&backup_path) {
        tracing::warn!(
            "Could not remove temporary unencrypted backup {:?}: {}",
            backup_path,
            e
        );
    }

    crate::security::permissions::harden_file_permissions(path)?;
    Ok(())
}

fn count_table_rows(conn: &Connection) -> Result<BTreeMap<String, i64>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )?;
    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut counts = BTreeMap::new();
    for name in names {
        let sql = format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\""));
        let count: i64 = conn.query_row(&sql, [], |row| row.get(0))?;
        counts.insert(name, count);
    }
    Ok(counts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn encrypted_db_opens_with_correct_key() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("encrypted.sqlite");
        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        {
            let conn = Connection::open(&db_path).expect("open encrypted db");
            apply_encryption_key(&conn, key).expect("set key");
            conn.execute_batch("CREATE TABLE test (id INTEGER PRIMARY KEY);")
                .expect("create table");
            conn.execute("INSERT INTO test (id) VALUES (42)", [])
                .expect("insert row");
        }

        {
            let conn = Connection::open(&db_path).expect("reopen encrypted db");
            apply_encryption_key(&conn, key).expect("set key");
            let val: i32 = conn
                .query_row("SELECT id FROM test", [], |r| r.get(0))
                .expect("read encrypted row");
            assert_eq!(val, 42);
        }

        {
            let conn = Connection::open(&db_path).expect("open without key");
            let result = conn.query_row("SELECT id FROM test", [], |r| r.get::<_, i32>(0));
            assert!(result.is_err(), "Encrypted DB should fail without key");
        }
    }

    #[test]
    fn unencrypted_to_encrypted_migration() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("plain.sqlite");
        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        {
            let conn = Connection::open(&db_path).expect("open plain db");
            conn.execute_batch(
                "CREATE TABLE sessions (id TEXT PRIMARY KEY, model TEXT);
                 INSERT INTO sessions VALUES ('s1', 'opus');
                 INSERT INTO sessions VALUES ('s2', 'sonnet');",
            )
            .expect("seed plain db");
        }

        migrate_to_encrypted(&db_path, key).expect("migrate to encrypted");

        {
            let conn = Connection::open(&db_path).expect("open migrated db");
            apply_encryption_key(&conn, key).expect("set key");
            let count: i32 = conn
                .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
                .expect("count rows");
            assert_eq!(count, 2);
        }
    }

    #[test]
    fn is_unencrypted_detects_plain_sqlite_header() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("plain.sqlite");
        let conn = Connection::open(&db_path).expect("open plain db");
        conn.execute_batch("CREATE TABLE t (id INTEGER);")
            .expect("create table");
        drop(conn);

        assert!(is_unencrypted(&db_path).expect("is_unencrypted"));
    }
}
