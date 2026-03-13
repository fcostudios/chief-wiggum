//! Chief Wiggum — Cross-platform desktop GUI for Claude Code
//!
//! This crate contains the Rust backend for the Tauri v2 application.
//! Module layout follows SPEC-004 §2.

pub mod actions;
pub mod bridge;
pub mod commands;
pub mod db;
pub mod files;
pub mod git;
pub mod import;
pub mod logging;
pub mod paths;
pub mod security;
pub mod settings;
pub mod slash;
pub mod terminal;

/// Unified application error type per GUIDE-001 §2.4 and SPEC-004 §7.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Claude Code process error: {0}")]
    Bridge(String),

    #[error("Parser error: {0}")]
    Parser(String),

    #[error("Permission error: {0}")]
    Permission(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("File already exists: {0}")]
    FileAlreadyExists(String),

    #[error("Path traversal attempt: {0}")]
    PathTraversal(String),

    #[error("Invalid file path")]
    InvalidPath,

    #[error("Invalid filename: {0}")]
    InvalidFileName(String),

    #[error("Trash operation failed: {0}")]
    TrashError(String),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Budget exceeded: {scope} limit of {limit_cents} cents reached")]
    BudgetExceeded { scope: String, limit_cents: i64 },

    #[error("Resource limit: maximum {max} concurrent sessions reached ({active} active)")]
    ResourceLimit { max: usize, active: usize },

    #[error("Database encryption error: {0}")]
    DatabaseEncryption(String),

    #[error("Keychain error: {0}")]
    Keychain(String),

    #[error("Git error: {0}")]
    Git(String),

    #[error("Terminal error: {0}")]
    Terminal(String),

    #[error("{0}")]
    Other(String),
}

// Serialize for Tauri IPC boundary (SPEC-004 §7.1)
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        AppError::Git(e.message().to_string())
    }
}

/// Convenience alias used across the crate.
pub type AppResult<T> = Result<T, AppError>;
