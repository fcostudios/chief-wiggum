//! Manages concurrent action processes per CHI-140.
//! Modeled after bridge/manager.rs SessionBridgeMap.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;

use super::bridge::{ActionBridge, ActionBridgeConfig, ActionStatus};
use super::ActionCategory;
use crate::{AppError, AppResult};

/// Maximum number of concurrent action processes.
const DEFAULT_MAX_ACTIONS: usize = 8;

/// Info about a running action (serializable for IPC).
#[derive(Debug, Clone, serde::Serialize)]
pub struct RunningActionInfo {
    pub action_id: String,
    pub status: ActionStatus,
}

/// Metadata provided at action spawn time for cross-project visibility/history.
#[derive(Debug, Clone)]
pub struct ActionRuntimeMetadata {
    pub action_name: String,
    pub project_id: String,
    pub project_name: String,
    pub category: ActionCategory,
    pub is_long_running: bool,
}

impl Default for ActionRuntimeMetadata {
    fn default() -> Self {
        Self {
            action_name: String::new(),
            project_id: String::new(),
            project_name: String::new(),
            category: ActionCategory::Custom,
            is_long_running: false,
        }
    }
}

#[derive(Clone)]
struct ActionRuntime {
    bridge: Arc<ActionBridge>,
    command: String,
    working_dir: String,
    action_name: String,
    project_id: String,
    project_name: String,
    category: ActionCategory,
    is_long_running: bool,
    started_at: Instant,
    last_output_line: Option<String>,
    output_tail: VecDeque<String>,
}

/// Snapshot of action runtime metadata for event loop persistence.
#[derive(Debug, Clone)]
pub struct ActionRuntimeSnapshot {
    pub action_id: String,
    pub command: String,
    pub working_dir: String,
    pub action_name: String,
    pub project_id: String,
    pub project_name: String,
    pub category: ActionCategory,
    pub is_long_running: bool,
    pub started_at: Instant,
    pub last_output_line: Option<String>,
    pub output_tail: Vec<String>,
}

/// Tracks concurrent action processes.
#[derive(Clone)]
pub struct ActionBridgeMap {
    runtimes: Arc<RwLock<HashMap<String, ActionRuntime>>>,
    max_concurrent: usize,
}

impl ActionBridgeMap {
    pub fn new() -> Self {
        Self {
            runtimes: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: DEFAULT_MAX_ACTIONS,
        }
    }

    /// Spawn an action process.
    pub async fn spawn_action(
        &self,
        action_id: &str,
        config: ActionBridgeConfig,
        metadata: ActionRuntimeMetadata,
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

        let action_name = if metadata.action_name.trim().is_empty() {
            action_id.to_string()
        } else {
            metadata.action_name
        };
        let project_id = if metadata.project_id.trim().is_empty() {
            "unknown".to_string()
        } else {
            metadata.project_id
        };
        let project_name = if metadata.project_name.trim().is_empty() {
            "Unknown Project".to_string()
        } else {
            metadata.project_name
        };

        let bridge = Arc::new(ActionBridge::spawn(config.clone())?);
        let runtime = ActionRuntime {
            bridge: bridge.clone(),
            command: config.command,
            working_dir: config.working_dir,
            action_name,
            project_id,
            project_name,
            category: metadata.category,
            is_long_running: metadata.is_long_running,
            started_at: Instant::now(),
            last_output_line: None,
            output_tail: VecDeque::with_capacity(3),
        };

        let mut runtimes = self.runtimes.write().await;
        runtimes.insert(action_id.to_string(), runtime);
        Ok(bridge)
    }

    /// Get a bridge by action ID.
    pub async fn get(&self, action_id: &str) -> Option<Arc<ActionBridge>> {
        let runtimes = self.runtimes.read().await;
        runtimes.get(action_id).map(|runtime| runtime.bridge.clone())
    }

    /// Check if an action is tracked.
    pub async fn has(&self, action_id: &str) -> bool {
        let runtimes = self.runtimes.read().await;
        runtimes.contains_key(action_id)
    }

    /// Update last output lines for an action. Keeps a ring buffer of the last 3 non-error lines.
    pub async fn update_output_line(&self, action_id: &str, line: &str, is_error: bool) {
        if is_error {
            return;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return;
        }

        let mut runtimes = self.runtimes.write().await;
        if let Some(runtime) = runtimes.get_mut(action_id) {
            runtime.last_output_line = Some(trimmed.to_string());
            if runtime.output_tail.len() >= 3 {
                runtime.output_tail.pop_front();
            }
            runtime.output_tail.push_back(trimmed.to_string());
        }
    }

    /// Read a snapshot of action runtime metadata.
    pub async fn snapshot(&self, action_id: &str) -> Option<ActionRuntimeSnapshot> {
        let runtimes = self.runtimes.read().await;
        let runtime = runtimes.get(action_id)?;
        Some(ActionRuntimeSnapshot {
            action_id: action_id.to_string(),
            command: runtime.command.clone(),
            working_dir: runtime.working_dir.clone(),
            action_name: runtime.action_name.clone(),
            project_id: runtime.project_id.clone(),
            project_name: runtime.project_name.clone(),
            category: runtime.category.clone(),
            is_long_running: runtime.is_long_running,
            started_at: runtime.started_at,
            last_output_line: runtime.last_output_line.clone(),
            output_tail: runtime.output_tail.iter().cloned().collect(),
        })
    }

    /// Remove runtime without sending stop signal to the bridge (used after process exit).
    pub async fn remove_runtime(&self, action_id: &str) {
        let mut runtimes = self.runtimes.write().await;
        runtimes.remove(action_id);
    }

    /// Stop a specific action.
    pub async fn stop_action(&self, action_id: &str) -> AppResult<()> {
        let bridge = {
            let mut runtimes = self.runtimes.write().await;
            runtimes.remove(action_id).map(|runtime| runtime.bridge)
        };
        if let Some(bridge) = bridge {
            bridge.stop().await?;
        }
        Ok(())
    }

    /// Count active actions.
    pub async fn active_count(&self) -> usize {
        let runtimes = self.runtimes.read().await;
        runtimes.len()
    }

    /// List all running actions.
    pub async fn list_running(&self) -> Vec<RunningActionInfo> {
        let entries: Vec<(String, Arc<ActionBridge>)> = {
            let runtimes = self.runtimes.read().await;
            runtimes
                .iter()
                .map(|(id, runtime)| (id.clone(), runtime.bridge.clone()))
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
            let mut map = self.runtimes.write().await;
            map.drain()
                .map(|(id, runtime)| (id, runtime.bridge))
                .collect()
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
        map.spawn_action("test:1", config, ActionRuntimeMetadata::default())
            .await
            .expect("spawn action");
        assert!(map.has("test:1").await);
        assert_eq!(map.active_count().await, 1);
    }

    #[tokio::test]
    async fn list_running_returns_empty_when_none() {
        let map = ActionBridgeMap::new();
        let running = map.list_running().await;
        assert!(running.is_empty());
    }

    #[tokio::test]
    async fn active_count_tracks_spawned_actions() {
        let map = ActionBridgeMap::new();
        assert_eq!(map.active_count().await, 0);
    }

    #[tokio::test]
    async fn stop_removes_from_map() {
        let map = ActionBridgeMap::new();
        let config = ActionBridgeConfig {
            command: sleep_command(),
            working_dir: temp_workdir(),
            ..Default::default()
        };
        map.spawn_action("test:1", config, ActionRuntimeMetadata::default())
            .await
            .expect("spawn action");
        map.stop_action("test:1").await.expect("stop action");
        assert!(!map.has("test:1").await);
    }

    #[tokio::test]
    async fn stop_nonexistent_action_is_safe() {
        let map = ActionBridgeMap::new();
        let result = map.stop_action("nonexistent-action").await;
        assert!(result.is_ok());
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
            map.spawn_action(
                &format!("test:{}", i),
                config,
                ActionRuntimeMetadata::default(),
            )
                .await
                .expect("spawn action");
        }
        assert_eq!(map.active_count().await, 3);
        map.shutdown_all().await.expect("shutdown actions");
        assert_eq!(map.active_count().await, 0);
    }

    #[tokio::test]
    async fn shutdown_all_clears_everything_when_empty() {
        let map = ActionBridgeMap::new();
        map.shutdown_all().await.expect("shutdown empty action map");
        assert_eq!(map.active_count().await, 0);
    }
}
