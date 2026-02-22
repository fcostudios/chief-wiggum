//! In-memory ring buffer layer for tracing.
//! Captures the last ~36,000 log entries (~10 min at 60 events/sec, ~15MB budget).
//! Uses parking_lot::Mutex for non-poisoning, fast locking.

use std::collections::VecDeque;
use std::fmt;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

/// Maximum entries in the ring buffer (~10 min at 60 events/sec).
const DEFAULT_MAX_ENTRIES: usize = 36_000;

/// A single captured log entry.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields: Vec<(String, String)>,
}

/// Visitor that extracts the message and fields from a tracing event.
struct FieldVisitor {
    message: String,
    fields: Vec<(String, String)>,
}

impl FieldVisitor {
    fn new() -> Self {
        Self {
            message: String::new(),
            fields: Vec::new(),
        }
    }
}

impl Visit for FieldVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{:?}", value);
        } else {
            self.fields
                .push((field.name().to_string(), format!("{:?}", value)));
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else {
            self.fields
                .push((field.name().to_string(), value.to_string()));
        }
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields
            .push((field.name().to_string(), value.to_string()));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields
            .push((field.name().to_string(), value.to_string()));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields
            .push((field.name().to_string(), value.to_string()));
    }
}

/// Shared handle to the ring buffer's inner storage.
pub type RingBufferHandle = Arc<Mutex<VecDeque<LogEntry>>>;

/// A tracing layer that captures events into a bounded ring buffer.
pub struct RingBufferLayer {
    buffer: RingBufferHandle,
    max_entries: usize,
}

impl RingBufferLayer {
    /// Create a new ring buffer layer with default capacity.
    pub fn new() -> (Self, RingBufferHandle) {
        Self::with_capacity(DEFAULT_MAX_ENTRIES)
    }

    /// Create a new ring buffer layer with a specific capacity.
    pub fn with_capacity(max_entries: usize) -> (Self, RingBufferHandle) {
        let buffer = Arc::new(Mutex::new(VecDeque::with_capacity(max_entries.min(1024))));
        let handle = buffer.clone();
        (
            Self {
                buffer,
                max_entries,
            },
            handle,
        )
    }
}

impl<S: Subscriber> Layer<S> for RingBufferLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        let level = *metadata.level();

        let mut visitor = FieldVisitor::new();
        event.record(&mut visitor);

        let entry = LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: level_str(level),
            target: metadata.target().to_string(),
            message: visitor.message,
            fields: visitor.fields,
        };

        let mut buf = self.buffer.lock();
        if buf.len() >= self.max_entries {
            buf.pop_front();
        }
        buf.push_back(entry);
    }
}

fn level_str(level: Level) -> String {
    match level {
        Level::ERROR => "ERROR".to_string(),
        Level::WARN => "WARN".to_string(),
        Level::INFO => "INFO".to_string(),
        Level::DEBUG => "DEBUG".to_string(),
        Level::TRACE => "TRACE".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::prelude::*;

    #[test]
    fn ring_buffer_captures_events() {
        let (layer, handle) = RingBufferLayer::new();
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("hello world");
            tracing::warn!("something happened");
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 2);
        assert_eq!(buf[0].level, "INFO");
        assert!(buf[0].message.contains("hello world"));
        assert_eq!(buf[1].level, "WARN");
    }

    #[test]
    fn ring_buffer_evicts_oldest_on_overflow() {
        let (layer, handle) = RingBufferLayer::with_capacity(3);
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("one");
            tracing::info!("two");
            tracing::info!("three");
            tracing::info!("four");
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 3);
        assert!(buf[0].message.contains("two"));
        assert!(buf[2].message.contains("four"));
    }

    #[test]
    fn ring_buffer_captures_fields() {
        let (layer, handle) = RingBufferLayer::new();
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(session_id = "s1", tokens = 42, "processing");
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 1);
        assert!(buf[0].fields.iter().any(|(k, _)| k == "session_id"));
        assert!(buf[0].fields.iter().any(|(k, _)| k == "tokens"));
    }

    #[test]
    fn empty_buffer_drain() {
        let (layer, handle) = RingBufferLayer::new();
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            // No events
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 0);
    }
}
