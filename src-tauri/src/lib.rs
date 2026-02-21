//! Chief Wiggum — Cross-platform desktop GUI for Claude Code
//!
//! This crate contains the Rust backend for the Tauri v2 application.
//! Module layout follows SPEC-004 §2.

pub mod bridge;
pub mod commands;
pub mod db;

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

    #[error("Budget exceeded: {scope} limit of {limit_cents} cents reached")]
    BudgetExceeded { scope: String, limit_cents: i64 },

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

/// Convenience alias used across the crate.
pub type AppResult<T> = Result<T, AppError>;
