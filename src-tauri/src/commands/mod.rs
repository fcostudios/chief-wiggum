//! IPC command handlers (one file per domain).
//! Command handlers are thin: validate input -> call business logic -> format output.
//! Per GUIDE-001 §2.3 and SPEC-004 §4.1.

pub mod actions;
pub mod bridge;
pub mod cli;
pub mod diagnostic;
pub mod export;
pub mod files;
pub mod logging;
pub mod project;
pub mod session;
pub mod settings;
pub mod slash;
