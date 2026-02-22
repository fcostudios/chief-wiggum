// Session-to-process manager: maps session IDs to CliBridge instances.
// Per CHI-44: central piece for multi-session CLI process management.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use super::event_loop::{
    ChunkPayload, CliExitedPayload, CliInitPayload, MessageCompletePayload,
    PermissionRequestPayload, ThinkingPayload, ToolResultPayload, ToolUsePayload,
};
use super::process::{BridgeConfig, BridgeInterface, CliBridge};
use crate::{AppError, AppResult};

/// Default maximum number of concurrent CLI sessions.
const DEFAULT_MAX_CONCURRENT: usize = 4;

/// Maximum buffered events per session. Oldest events are evicted when full.
const MAX_EVENT_BUFFER: usize = 200;

/// A buffered copy of a Tauri event for replay after frontend reconnect.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BufferedEvent {
    Chunk(ChunkPayload),
    MessageComplete(MessageCompletePayload),
    CliInit(CliInitPayload),
    CliExited(CliExitedPayload),
    ToolUse(ToolUsePayload),
    ToolResult(ToolResultPayload),
    Thinking(ThinkingPayload),
    PermissionRequest(PermissionRequestPayload),
}

/// Runtime state for a session's CLI process.
#[derive(Debug, Clone, Serialize)]
pub struct SessionRuntime {
    pub session_id: String,
    pub process_status: String,
    pub cli_session_id: Option<String>,
    pub model: Option<String>,
    #[serde(skip)]
    event_buffer: VecDeque<BufferedEvent>,
    #[serde(skip)]
    pub last_event_at: Option<Instant>,
}

impl SessionRuntime {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            process_status: "starting".to_string(),
            cli_session_id: None,
            model: None,
            event_buffer: VecDeque::with_capacity(MAX_EVENT_BUFFER),
            last_event_at: None,
        }
    }

    /// Buffer an event for potential frontend replay. Coalesces consecutive chunks.
    pub fn buffer_event(&mut self, event: BufferedEvent) {
        // Coalesce consecutive chunks to save space
        if let BufferedEvent::Chunk(ref new_chunk) = event {
            if let Some(BufferedEvent::Chunk(ref mut last)) = self.event_buffer.back_mut() {
                last.content.push_str(&new_chunk.content);
                self.last_event_at = Some(Instant::now());
                return;
            }
        }
        if self.event_buffer.len() >= MAX_EVENT_BUFFER {
            self.event_buffer.pop_front();
        }
        self.event_buffer.push_back(event);
        self.last_event_at = Some(Instant::now());
    }

    /// Drain all buffered events (called by frontend on reconnect).
    pub fn drain_buffer(&mut self) -> Vec<BufferedEvent> {
        self.event_buffer.drain(..).collect()
    }

    /// Check if there are buffered events waiting for replay.
    pub fn has_buffered_events(&self) -> bool {
        !self.event_buffer.is_empty()
    }
}

/// IPC-serializable info about an active bridge.
#[derive(Debug, Clone, Serialize)]
pub struct ActiveBridgeInfo {
    pub session_id: String,
    pub process_status: String,
    pub cli_session_id: Option<String>,
    pub model: Option<String>,
    pub has_buffered_events: bool,
}

/// Maps session IDs to their active CLI bridge processes.
/// Registered as Tauri managed state.
#[derive(Clone)]
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
    /// Cached MCP server prefixes for --allowedTools (e.g., "mcp__plugin_context7_context7").
    /// Populated from the CLI's system:init event. Shared across sessions since MCP
    /// servers are user-level, not session-level.
    mcp_server_prefixes: Arc<RwLock<HashSet<String>>>,
    /// Per-session runtime state including event buffers for HMR resilience.
    session_runtimes: Arc<RwLock<HashMap<String, SessionRuntime>>>,
    /// Maximum number of concurrent CLI sessions allowed.
    max_concurrent: usize,
}

impl SessionBridgeMap {
    /// Create an empty bridge map.
    pub fn new() -> Self {
        Self {
            bridges: Arc::new(RwLock::new(HashMap::new())),
            mcp_server_prefixes: Arc::new(RwLock::new(HashSet::new())),
            session_runtimes: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: DEFAULT_MAX_CONCURRENT,
        }
    }

    /// Get a clone of the MCP server prefix cache for passing to event loops.
    pub fn mcp_cache(&self) -> Arc<RwLock<HashSet<String>>> {
        self.mcp_server_prefixes.clone()
    }

    /// Get the current cached MCP server prefixes as --allowedTools entries.
    pub async fn mcp_allowed_tools(&self) -> Vec<String> {
        self.mcp_server_prefixes
            .read()
            .await
            .iter()
            .cloned()
            .collect()
    }

    /// Spawn a new CLI bridge for a session.
    /// If the session already has a bridge, returns an error.
    pub async fn spawn_for_session(&self, session_id: &str, config: BridgeConfig) -> AppResult<()> {
        let mut bridges = self.bridges.write().await;
        if bridges.contains_key(session_id) {
            return Err(AppError::Bridge(format!(
                "Session {} already has an active CLI process",
                session_id
            )));
        }

        let bridge = CliBridge::spawn(config).await?;
        bridges.insert(session_id.to_string(), Arc::new(bridge));
        drop(bridges);
        self.create_runtime(session_id).await;
        tracing::info!("Spawned CLI bridge for session {}", session_id);
        Ok(())
    }

    /// Get the bridge for a session, if one exists.
    pub async fn get(&self, session_id: &str) -> Option<Arc<dyn BridgeInterface>> {
        self.bridges.read().await.get(session_id).cloned()
    }

    /// Check if a session has an active bridge.
    pub async fn has(&self, session_id: &str) -> bool {
        self.bridges.read().await.contains_key(session_id)
    }

    /// Remove and shut down a session's bridge.
    pub async fn remove(&self, session_id: &str) -> AppResult<()> {
        let bridge = self.bridges.write().await.remove(session_id);
        if let Some(bridge) = bridge {
            bridge.shutdown().await?;
            tracing::info!("Removed CLI bridge for session {}", session_id);
        }
        self.remove_runtime(session_id).await;
        Ok(())
    }

    /// Shut down all active bridges. Called on app exit.
    pub async fn shutdown_all(&self) -> AppResult<()> {
        let mut bridges = self.bridges.write().await;
        for (session_id, bridge) in bridges.drain() {
            tracing::info!("Shutting down CLI bridge for session {}", session_id);
            if let Err(e) = bridge.shutdown().await {
                tracing::warn!("Failed to shut down bridge for {}: {}", session_id, e);
            }
        }
        drop(bridges);
        let mut runtimes = self.session_runtimes.write().await;
        runtimes.clear();
        Ok(())
    }

    /// Get count of active bridges.
    pub async fn active_count(&self) -> usize {
        self.bridges.read().await.len()
    }

    /// Check if a new session can be spawned (under the concurrent limit).
    pub async fn can_spawn(&self) -> bool {
        self.active_count().await < self.max_concurrent
    }

    /// Get the maximum concurrent session limit.
    pub fn max_concurrent(&self) -> usize {
        self.max_concurrent
    }

    /// Get a clone of the runtimes map for passing to event loops.
    pub fn runtimes(&self) -> Arc<RwLock<HashMap<String, SessionRuntime>>> {
        self.session_runtimes.clone()
    }

    /// List all sessions that have active bridges (for reconnection).
    pub async fn list_active_sessions(&self) -> Vec<ActiveBridgeInfo> {
        let bridges = self.bridges.read().await;
        let runtimes = self.session_runtimes.read().await;
        bridges
            .keys()
            .map(|id| {
                let runtime = runtimes.get(id);
                ActiveBridgeInfo {
                    session_id: id.clone(),
                    process_status: runtime
                        .map(|r| r.process_status.clone())
                        .unwrap_or_else(|| "unknown".to_string()),
                    cli_session_id: runtime.and_then(|r| r.cli_session_id.clone()),
                    model: runtime.and_then(|r| r.model.clone()),
                    has_buffered_events: runtime.map(|r| r.has_buffered_events()).unwrap_or(false),
                }
            })
            .collect()
    }

    /// Drain buffered events for a session (called by frontend on reconnect).
    pub async fn drain_session_buffer(&self, session_id: &str) -> Vec<BufferedEvent> {
        let mut runtimes = self.session_runtimes.write().await;
        runtimes
            .get_mut(session_id)
            .map(|r| r.drain_buffer())
            .unwrap_or_default()
    }

    /// Create a runtime entry for a session.
    pub async fn create_runtime(&self, session_id: &str) {
        let mut runtimes = self.session_runtimes.write().await;
        runtimes.insert(
            session_id.to_string(),
            SessionRuntime::new(session_id.to_string()),
        );
    }

    /// Remove a runtime entry (on session bridge removal).
    pub async fn remove_runtime(&self, session_id: &str) {
        let mut runtimes = self.session_runtimes.write().await;
        runtimes.remove(session_id);
    }

    /// Insert a pre-built bridge (for testing with MockBridge).
    #[cfg(test)]
    pub async fn insert_mock(&self, session_id: &str, bridge: Arc<dyn BridgeInterface>) {
        self.bridges
            .write()
            .await
            .insert(session_id.to_string(), bridge);
    }
}

impl Default for SessionBridgeMap {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::process::MockBridge;
    use crate::bridge::BridgeOutput;

    #[tokio::test]
    async fn new_map_is_empty() {
        let map = SessionBridgeMap::new();
        assert_eq!(map.active_count().await, 0);
        assert!(!map.has("session-1").await);
    }

    #[tokio::test]
    async fn insert_and_get_mock_bridge() {
        let map = SessionBridgeMap::new();
        let bridge = Arc::new(MockBridge::new(vec![]));
        map.insert_mock("session-1", bridge).await;

        assert!(map.has("session-1").await);
        assert!(!map.has("session-2").await);
        assert_eq!(map.active_count().await, 1);

        let retrieved = map.get("session-1").await;
        assert!(retrieved.is_some());
    }

    #[tokio::test]
    async fn remove_shuts_down_bridge() {
        let map = SessionBridgeMap::new();
        let bridge = Arc::new(MockBridge::new(vec![]));
        map.insert_mock("session-1", bridge.clone()).await;

        map.remove("session-1").await.unwrap();
        assert!(!map.has("session-1").await);
        assert_eq!(map.active_count().await, 0);
    }

    #[tokio::test]
    async fn remove_nonexistent_is_ok() {
        let map = SessionBridgeMap::new();
        map.remove("nonexistent").await.unwrap();
    }

    #[tokio::test]
    async fn shutdown_all_clears_map() {
        let map = SessionBridgeMap::new();
        map.insert_mock("s1", Arc::new(MockBridge::new(vec![])))
            .await;
        map.insert_mock("s2", Arc::new(MockBridge::new(vec![])))
            .await;
        assert_eq!(map.active_count().await, 2);

        map.shutdown_all().await.unwrap();
        assert_eq!(map.active_count().await, 0);
    }

    #[tokio::test]
    async fn get_nonexistent_returns_none() {
        let map = SessionBridgeMap::new();
        assert!(map.get("nope").await.is_none());
    }

    #[tokio::test]
    async fn send_via_retrieved_bridge() {
        let map = SessionBridgeMap::new();
        let mock = Arc::new(MockBridge::new(vec![BridgeOutput::ProcessExited {
            exit_code: Some(0),
        }]));
        map.insert_mock("session-1", mock.clone()).await;

        let bridge = map.get("session-1").await.unwrap();
        bridge.send("hello").await.unwrap();

        let inputs = mock.captured_inputs().await;
        assert_eq!(inputs, vec!["hello"]);
    }

    // --- SessionRuntime & BufferedEvent tests ---

    #[tokio::test]
    async fn session_runtime_buffers_events() {
        let mut runtime = SessionRuntime::new("s1".to_string());
        assert!(!runtime.has_buffered_events());

        runtime.buffer_event(BufferedEvent::Chunk(ChunkPayload {
            session_id: "s1".to_string(),
            content: "hello ".to_string(),
            token_count: None,
        }));
        assert!(runtime.has_buffered_events());

        let events = runtime.drain_buffer();
        assert_eq!(events.len(), 1);
        assert!(!runtime.has_buffered_events());
    }

    #[tokio::test]
    async fn chunk_coalescing_works() {
        let mut runtime = SessionRuntime::new("s1".to_string());
        runtime.buffer_event(BufferedEvent::Chunk(ChunkPayload {
            session_id: "s1".to_string(),
            content: "hello ".to_string(),
            token_count: None,
        }));
        runtime.buffer_event(BufferedEvent::Chunk(ChunkPayload {
            session_id: "s1".to_string(),
            content: "world".to_string(),
            token_count: None,
        }));
        let events = runtime.drain_buffer();
        assert_eq!(events.len(), 1); // Coalesced into one
        if let BufferedEvent::Chunk(ref c) = events[0] {
            assert_eq!(c.content, "hello world");
        } else {
            panic!("Expected Chunk");
        }
    }

    #[tokio::test]
    async fn buffer_evicts_oldest_when_full() {
        let mut runtime = SessionRuntime::new("s1".to_string());
        // Fill buffer with non-chunk events to avoid coalescing
        for i in 0..MAX_EVENT_BUFFER + 10 {
            runtime.buffer_event(BufferedEvent::CliExited(CliExitedPayload {
                session_id: "s1".to_string(),
                exit_code: Some(i as i32),
            }));
        }
        let events = runtime.drain_buffer();
        assert_eq!(events.len(), MAX_EVENT_BUFFER);
    }

    #[tokio::test]
    async fn list_active_sessions_returns_active_only() {
        let map = SessionBridgeMap::new();
        let bridge = Arc::new(MockBridge::new(vec![]));
        map.insert_mock("s1", bridge).await;
        map.create_runtime("s1").await;

        let active = map.list_active_sessions().await;
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].session_id, "s1");

        map.remove("s1").await.unwrap();
        let active = map.list_active_sessions().await;
        assert_eq!(active.len(), 0);
    }

    #[tokio::test]
    async fn can_spawn_respects_limit() {
        let map = SessionBridgeMap::new(); // default limit = 4
        assert!(map.can_spawn().await);

        // Fill up to limit
        for i in 0..4 {
            map.insert_mock(&format!("s{}", i), Arc::new(MockBridge::new(vec![])))
                .await;
        }
        assert!(!map.can_spawn().await);
        assert_eq!(map.active_count().await, 4);

        // Remove one -> can spawn again
        map.remove("s0").await.unwrap();
        assert!(map.can_spawn().await);
    }

    #[tokio::test]
    async fn max_concurrent_default_is_four() {
        let map = SessionBridgeMap::new();
        assert_eq!(map.max_concurrent(), 4);
    }

    #[tokio::test]
    async fn drain_session_buffer_clears_events() {
        let map = SessionBridgeMap::new();
        map.create_runtime("s1").await;
        {
            let runtimes_arc = map.runtimes();
            let mut runtimes = runtimes_arc.write().await;
            if let Some(runtime) = runtimes.get_mut("s1") {
                runtime.buffer_event(BufferedEvent::Chunk(ChunkPayload {
                    session_id: "s1".to_string(),
                    content: "test".to_string(),
                    token_count: None,
                }));
            }
        }
        let events = map.drain_session_buffer("s1").await;
        assert_eq!(events.len(), 1);
        let events2 = map.drain_session_buffer("s1").await;
        assert_eq!(events2.len(), 0);
    }
}
