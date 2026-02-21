//! IPC command handlers (one file per domain).
//! Command handlers are thin: validate input -> call business logic -> format output.
//! Per GUIDE-001 §2.3 and SPEC-004 §4.1.

pub mod session;
