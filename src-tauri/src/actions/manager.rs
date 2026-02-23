//! Manages concurrent action processes per CHI-140.
//! Modeled after bridge/manager.rs SessionBridgeMap.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use super::bridge::{ActionBridge, ActionBridgeConfig, ActionStatus};
use crate::{AppError, AppResult};

/// Maximum number of concurrent action processes.
const DEFAULT_MAX_ACTIONS: usize = 8;

/// Info about a running action (serializable for IPC).
#[derive(Debug, Clone, serde::Serialize)]
pub struct RunningActionInfo {
    pub action_id: String,
    pub status: ActionStatus,
}

/// Tracks concurrent action processes.
#[derive(Clone)]
pub struct ActionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<ActionBridge>>>>,
    max_concurrent: usize,
}

impl ActionBridgeMap {
    pub fn new() -> Self {
        Self {
            bridges: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: DEFAULT_MAX_ACTIONS,
        }
    }

    /// Spawn an action process.
    pub async fn spawn_action(
        &self,
        action_id: &str,
        config: ActionBridgeConfig,
    ) -> AppResult<Arc<ActionBridge>> {
        if self.has(action_id).await {
            self.stop_action(action_id).await?;
        }

        let active = self.active_count().await;
        if active >= self.max_concurrent {
            return Err(AppError::ResourceLimit {
                max: self.max_concurrent,
                active,
            });
        }

        let bridge = Arc::new(ActionBridge::spawn(config)?);
        let mut bridges = self.bridges.write().await;
        bridges.insert(action_id.to_string(), bridge.clone());
        Ok(bridge)
    }

    /// Get a bridge by action ID.
    pub async fn get(&self, action_id: &str) -> Option<Arc<ActionBridge>> {
        let bridges = self.bridges.read().await;
        bridges.get(action_id).cloned()
    }

    /// Check if an action is tracked.
    pub async fn has(&self, action_id: &str) -> bool {
        let bridges = self.bridges.read().await;
        bridges.contains_key(action_id)
    }

    /// Stop a specific action.
    pub async fn stop_action(&self, action_id: &str) -> AppResult<()> {
        let bridge = {
            let mut bridges = self.bridges.write().await;
            bridges.remove(action_id)
        };
        if let Some(bridge) = bridge {
            bridge.stop().await?;
        }
        Ok(())
    }

    /// Count active actions.
    pub async fn active_count(&self) -> usize {
        let bridges = self.bridges.read().await;
        bridges.len()
    }

    /// List all running actions.
    pub async fn list_running(&self) -> Vec<RunningActionInfo> {
        let entries: Vec<(String, Arc<ActionBridge>)> = {
            let bridges = self.bridges.read().await;
            bridges
                .iter()
                .map(|(id, bridge)| (id.clone(), bridge.clone()))
                .collect()
        };

        let mut infos = Vec::with_capacity(entries.len());
        for (id, bridge) in entries {
            infos.push(RunningActionInfo {
                action_id: id,
                status: bridge.status().await,
            });
        }
        infos
    }

    /// Stop all actions (app shutdown).
    pub async fn shutdown_all(&self) -> AppResult<()> {
        let bridges: Vec<(String, Arc<ActionBridge>)> = {
            let mut map = self.bridges.write().await;
            map.drain().collect()
        };
        for (id, bridge) in bridges {
            if let Err(e) = bridge.stop().await {
                tracing::warn!(action_id = %id, error = %e, "Failed to stop action on shutdown");
            }
        }
        Ok(())
    }
}

impl Default for ActionBridgeMap {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workdir() -> String {
        tempfile::tempdir()
            .expect("tempdir")
            .keep()
            .to_string_lossy()
            .to_string()
    }

    fn sleep_command() -> String {
        #[cfg(target_os = "windows")]
        {
            "powershell -NoProfile -Command Start-Sleep -Seconds 60".to_string()
        }
        #[cfg(not(target_os = "windows"))]
        {
            "sleep 60".to_string()
        }
    }

    #[tokio::test]
    async fn spawn_and_track() {
        let map = ActionBridgeMap::new();
        let config = ActionBridgeConfig {
            command: "echo test".to_string(),
            working_dir: temp_workdir(),
            ..Default::default()
        };
        map.spawn_action("test:1", config)
            .await
            .expect("spawn action");
        assert!(map.has("test:1").await);
        assert_eq!(map.active_count().await, 1);
    }

    #[tokio::test]
    async fn stop_removes_from_map() {
        let map = ActionBridgeMap::new();
        let config = ActionBridgeConfig {
            command: sleep_command(),
            working_dir: temp_workdir(),
            ..Default::default()
        };
        map.spawn_action("test:1", config)
            .await
            .expect("spawn action");
        map.stop_action("test:1").await.expect("stop action");
        assert!(!map.has("test:1").await);
    }

    #[tokio::test]
    async fn shutdown_all_clears() {
        let map = ActionBridgeMap::new();
        for i in 0..3 {
            let config = ActionBridgeConfig {
                command: sleep_command(),
                working_dir: temp_workdir(),
                ..Default::default()
            };
            map.spawn_action(&format!("test:{}", i), config)
                .await
                .expect("spawn action");
        }
        assert_eq!(map.active_count().await, 3);
        map.shutdown_all().await.expect("shutdown actions");
        assert_eq!(map.active_count().await, 0);
    }
}
