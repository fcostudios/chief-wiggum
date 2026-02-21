// Session-to-process manager: maps session IDs to CliBridge instances.
// Per CHI-44: central piece for multi-session CLI process management.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use super::process::{BridgeConfig, BridgeInterface, CliBridge};
use crate::{AppError, AppResult};

/// Maps session IDs to their active CLI bridge processes.
/// Registered as Tauri managed state.
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
}

impl SessionBridgeMap {
    /// Create an empty bridge map.
    pub fn new() -> Self {
        Self {
            bridges: Arc::new(RwLock::new(HashMap::new())),
        }
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
        Ok(())
    }

    /// Get count of active bridges.
    pub async fn active_count(&self) -> usize {
        self.bridges.read().await.len()
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
}
