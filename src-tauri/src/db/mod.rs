//! SQLite database layer for Chief Wiggum.
//!
//! Handles connection management, schema migrations, and typed queries.
//! Architecture: SPEC-004 §2 (db/), SPEC-005 §6
//! Schema: SPEC-001 §9

pub mod connection;
pub mod migrations;
pub mod queries;

pub use connection::Database;
