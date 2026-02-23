//! Structured logging with 3 layers: console, rolling file, in-memory ring buffer.
//! Replaces the previous single-layer tracing setup in main.rs.
//!
//! Architecture: SPEC-004 §2, CHI-94

pub mod bundle;
pub mod init;
pub mod redactor;
pub mod ring_buffer;

pub use bundle::{BundleExportResult, export_bundle};
pub use init::{get_ring_buffer, init_logging};
pub use redactor::{LogRedactor, RedactionSummary};
pub use ring_buffer::{LogEntry, RingBufferHandle};
