//! Permission request interception and management.
//!
//! Implements CHI-16: permission request interception from CLI.
//! Also implements CHI-26: YOLO Mode (auto-approve all permissions).
//! Also implements CHI-102: Developer Mode (pre-authorize common Bash patterns).
//!
//! Three-tier permission model:
//! - **Safe** (default): No Bash. Only read-only + edit tools allowed.
//! - **Developer**: Bash with pattern restrictions for common dev tools.
//! - **YOLO**: Auto-approve everything (bypasses all dialogs).
//!
//! Security-critical: default mode must block CLI until user responds.
//! YOLO Mode (opt-in): bypasses all dialogs, auto-approves everything.
//! See SPEC-001 §7.1 for YOLO Mode design and safety rails.
//!
//! Architecture: SPEC-004 §2 (bridge/permission.rs), §5.2 (Permission Flow)
//! Types: SPEC-004 §6 (PermissionRequest interface)
//! Standards: GUIDE-001 §2.4 (errors), §2.7 (testing)

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, RwLock};

use crate::{AppError, AppResult};

/// Default timeout for permission requests (seconds).
/// After this, the request is auto-denied for safety.
const DEFAULT_PERMISSION_TIMEOUT_SECS: u64 = 120;

/// A permission request from the CLI that must be resolved by the user.
/// Maps to the `permission:request` event (SPEC-004 §4.3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    /// Unique ID for this request (used to correlate response).
    pub request_id: String,
    /// Tool requesting permission (e.g., "Bash", "Read", "Write", "mcp__server__tool").
    pub tool: String,
    /// The specific command or operation (e.g., "rm -rf /tmp/test").
    pub command: String,
    /// File path involved, if applicable.
    pub file_path: Option<String>,
    /// Risk level assessment: "low", "medium", "high".
    pub risk_level: String,
    /// Original SDK tool input (not sent to frontend). Used to round-trip `updatedInput`
    /// back to Claude Code when approving a permission request.
    #[serde(skip)]
    pub tool_input: Option<serde_json::Map<String, serde_json::Value>>,
}

/// User's response to a permission request.
/// Maps to the `permission:response` event (SPEC-004 §4.3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    /// The request_id this response is for.
    pub request_id: String,
    /// The action taken.
    pub action: PermissionAction,
    /// Optional glob pattern for "always allow" (e.g., "*.rs" for all Rust files).
    pub pattern: Option<String>,
}

/// Possible actions for a permission request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionAction {
    /// Allow this specific request.
    Approve,
    /// Deny this specific request.
    Deny,
    /// Allow this request and all future requests matching the pattern.
    AlwaysAllow,
}

/// An "always allow" rule, persisted per session.
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct AllowRule {
    /// The tool this rule applies to.
    tool: String,
    /// Glob pattern for the command or path.
    pattern: String,
    /// When this rule was created.
    created_at: Instant,
}

/// Manages permission requests: queuing, resolution, and auto-allow rules.
///
/// Flow per SPEC-004 §5.2:
/// 1. CLI requests permission (detected in parser output)
/// 2. Manager checks auto-allow rules
/// 3. If not auto-allowed, emits event to frontend and blocks
/// 4. Frontend shows dialog, user responds
/// 5. Manager resolves the pending request
/// 6. If "always allow", saves pattern for session
#[derive(Clone)]
pub struct PermissionManager {
    /// Pending requests waiting for user response.
    /// Key: request_id, Value: oneshot sender to resolve the request.
    pending: Arc<RwLock<HashMap<String, PendingPermission>>>,

    /// Auto-allow rules for this session.
    allow_rules: Arc<RwLock<Vec<AllowRule>>>,

    /// Timeout for permission requests.
    timeout: Duration,

    /// YOLO mode flag: when true, all requests are auto-approved (SPEC-001 §7.1).
    yolo_mode: Arc<RwLock<bool>>,

    /// Developer mode flag: when true, common Bash patterns are pre-authorized (CHI-102).
    developer_mode: Arc<RwLock<bool>>,
}

/// A pending permission request with its resolution channel.
#[allow(dead_code)]
struct PendingPermission {
    request: PermissionRequest,
    resolver: oneshot::Sender<PermissionAction>,
    created_at: Instant,
}

impl PermissionManager {
    /// Create a new permission manager with default timeout.
    pub fn new() -> Self {
        Self {
            pending: Arc::new(RwLock::new(HashMap::new())),
            allow_rules: Arc::new(RwLock::new(Vec::new())),
            timeout: Duration::from_secs(DEFAULT_PERMISSION_TIMEOUT_SECS),
            yolo_mode: Arc::new(RwLock::new(false)),
            developer_mode: Arc::new(RwLock::new(false)),
        }
    }

    /// Create a permission manager with a custom timeout.
    pub fn with_timeout(timeout_secs: u64) -> Self {
        Self {
            pending: Arc::new(RwLock::new(HashMap::new())),
            allow_rules: Arc::new(RwLock::new(Vec::new())),
            timeout: Duration::from_secs(timeout_secs),
            yolo_mode: Arc::new(RwLock::new(false)),
            developer_mode: Arc::new(RwLock::new(false)),
        }
    }

    /// Check if YOLO mode is active.
    pub async fn is_yolo_mode(&self) -> bool {
        *self.yolo_mode.read().await
    }

    /// Enable YOLO mode — auto-approve all permission requests.
    /// WARNING: This bypasses all permission dialogs. See SPEC-001 §7.1.
    pub async fn enable_yolo_mode(&self) {
        *self.yolo_mode.write().await = true;
        tracing::warn!("[YOLO] YOLO mode enabled — all permissions will be auto-approved");
    }

    /// Disable YOLO mode — return to normal permission flow.
    pub async fn disable_yolo_mode(&self) {
        *self.yolo_mode.write().await = false;
        tracing::info!("[YOLO] YOLO mode disabled — returning to normal permission flow");
    }

    /// Check if Developer mode is active (CHI-102).
    pub async fn is_developer_mode(&self) -> bool {
        *self.developer_mode.read().await
    }

    /// Enable Developer mode — pre-authorize common Bash patterns via --allowedTools.
    /// Safer than YOLO: only allows specific tool patterns, not everything.
    pub async fn enable_developer_mode(&self) {
        *self.developer_mode.write().await = true;
        tracing::info!("[DEV] Developer mode enabled — common Bash patterns pre-authorized");
    }

    /// Disable Developer mode — return to safe mode (no Bash).
    pub async fn disable_developer_mode(&self) {
        *self.developer_mode.write().await = false;
        tracing::info!("[DEV] Developer mode disabled — Bash patterns removed");
    }

    /// Check if a permission request is auto-allowed by existing rules.
    ///
    /// Returns `true` if the request matches an "always allow" pattern.
    pub async fn is_auto_allowed(&self, request: &PermissionRequest) -> bool {
        let rules = self.allow_rules.read().await;

        for rule in rules.iter() {
            if rule.tool == request.tool && Self::matches_pattern(&rule.pattern, &request.command) {
                tracing::info!(
                    "Permission auto-allowed: tool={}, command={}, pattern={}",
                    request.tool,
                    request.command,
                    rule.pattern
                );
                return true;
            }
        }

        false
    }

    /// Queue a permission request and wait for resolution.
    ///
    /// This blocks until the user responds or the timeout expires.
    /// On timeout, the request is auto-DENIED for safety.
    ///
    /// Returns the user's action.
    pub async fn request_permission(
        &self,
        request: PermissionRequest,
    ) -> AppResult<PermissionAction> {
        // YOLO mode: auto-approve immediately without queuing
        if self.is_yolo_mode().await {
            tracing::info!(
                "[YOLO] Auto-approved: tool={}, command={}",
                request.tool,
                request.command
            );
            return Ok(PermissionAction::Approve);
        }

        // First check auto-allow rules
        if self.is_auto_allowed(&request).await {
            return Ok(PermissionAction::Approve);
        }

        let request_id = request.request_id.clone();
        let (tx, rx) = oneshot::channel();

        // Register the pending request
        {
            let mut pending = self.pending.write().await;
            pending.insert(
                request_id.clone(),
                PendingPermission {
                    request,
                    resolver: tx,
                    created_at: Instant::now(),
                },
            );
        }

        tracing::info!(
            "Permission request queued: {} (timeout: {}s)",
            request_id,
            self.timeout.as_secs()
        );

        // Wait for resolution with timeout
        match tokio::time::timeout(self.timeout, rx).await {
            Ok(Ok(action)) => {
                tracing::info!("Permission resolved: {} → {:?}", request_id, action);
                Ok(action)
            }
            Ok(Err(_)) => {
                // Channel was dropped — internal error
                tracing::error!("Permission channel dropped for: {}", request_id);
                self.cleanup_pending(&request_id).await;
                Err(AppError::Permission(format!(
                    "Permission request {} was cancelled",
                    request_id
                )))
            }
            Err(_) => {
                // Timeout — auto-deny for safety
                tracing::warn!(
                    "Permission request {} timed out after {}s — auto-denying",
                    request_id,
                    self.timeout.as_secs()
                );
                self.cleanup_pending(&request_id).await;
                Ok(PermissionAction::Deny)
            }
        }
    }

    /// Resolve a pending permission request with the user's response.
    ///
    /// Called by the frontend when the user clicks Approve/Deny/Always Allow.
    pub async fn resolve_permission(&self, response: PermissionResponse) -> AppResult<()> {
        let mut pending = self.pending.write().await;

        let pending_perm = pending.remove(&response.request_id).ok_or_else(|| {
            AppError::Permission(format!(
                "No pending permission request with ID: {}",
                response.request_id
            ))
        })?;

        // If "always allow", save the rule
        if response.action == PermissionAction::AlwaysAllow {
            let pattern = response
                .pattern
                .unwrap_or_else(|| pending_perm.request.command.clone());

            tracing::info!(
                "Saving always-allow rule: tool={}, pattern={}",
                pending_perm.request.tool,
                pattern
            );

            self.allow_rules.write().await.push(AllowRule {
                tool: pending_perm.request.tool.clone(),
                pattern,
                created_at: Instant::now(),
            });
        }

        // Resolve the waiting request
        // Map AlwaysAllow → Approve for the CLI (it only understands allow/deny)
        let action = match response.action {
            PermissionAction::AlwaysAllow => PermissionAction::Approve,
            other => other,
        };

        let _ = pending_perm.resolver.send(action);
        Ok(())
    }

    /// Get all currently pending permission requests.
    pub async fn pending_requests(&self) -> Vec<PermissionRequest> {
        let pending = self.pending.read().await;
        pending.values().map(|p| p.request.clone()).collect()
    }

    /// Get the count of pending permission requests.
    pub async fn pending_count(&self) -> usize {
        self.pending.read().await.len()
    }

    /// Clear all auto-allow rules (e.g., on session reset).
    pub async fn clear_rules(&self) {
        self.allow_rules.write().await.clear();
        tracing::info!("All permission auto-allow rules cleared");
    }

    /// Get all current auto-allow rules.
    pub async fn rules(&self) -> Vec<(String, String)> {
        self.allow_rules
            .read()
            .await
            .iter()
            .map(|r| (r.tool.clone(), r.pattern.clone()))
            .collect()
    }

    /// Remove a pending request without resolving it.
    async fn cleanup_pending(&self, request_id: &str) {
        self.pending.write().await.remove(request_id);
    }

    /// Simple glob-like pattern matching.
    /// Supports `*` as wildcard for any sequence of characters.
    fn matches_pattern(pattern: &str, value: &str) -> bool {
        if pattern == "*" {
            return true;
        }

        if !pattern.contains('*') {
            return pattern == value;
        }

        // Split by '*' and check if parts appear in order
        let parts: Vec<&str> = pattern.split('*').collect();

        if parts.is_empty() {
            return true;
        }

        let mut pos = 0;

        // First part must be a prefix
        if !parts[0].is_empty() {
            if !value.starts_with(parts[0]) {
                return false;
            }
            pos = parts[0].len();
        }

        // Last part must be a suffix
        let last = parts.last().unwrap_or(&"");
        if !last.is_empty() && !value.ends_with(last) {
            return false;
        }

        // Middle parts must appear in order
        for part in &parts[1..parts.len().saturating_sub(1)] {
            if part.is_empty() {
                continue;
            }
            match value[pos..].find(part) {
                Some(idx) => pos += idx + part.len(),
                None => return false,
            }
        }

        true
    }
}

impl Default for PermissionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request(tool: &str, command: &str) -> PermissionRequest {
        PermissionRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            tool: tool.to_string(),
            command: command.to_string(),
            file_path: None,
            risk_level: "medium".to_string(),
            tool_input: None,
        }
    }

    #[tokio::test]
    async fn new_manager_has_no_rules() {
        let manager = PermissionManager::new();
        assert_eq!(manager.pending_count().await, 0);
        assert!(manager.rules().await.is_empty());
    }

    #[tokio::test]
    async fn request_not_auto_allowed_by_default() {
        let manager = PermissionManager::new();
        let req = make_request("Bash", "ls -la");
        assert!(!manager.is_auto_allowed(&req).await);
    }

    #[tokio::test]
    async fn resolve_permission_approve() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Bash", "ls -la");
        let request_id = req.request_id.clone();

        let manager_clone = Arc::clone(&manager);

        // Spawn the request (will block until resolved)
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        // Give it a moment to register
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Verify it's pending
        assert_eq!(manager.pending_count().await, 1);

        // Resolve it
        manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::Approve,
                pattern: None,
            })
            .await
            .unwrap();

        // Check result
        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Approve);
        assert_eq!(manager.pending_count().await, 0);
    }

    #[tokio::test]
    async fn resolve_permission_deny() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Bash", "rm -rf /");
        let request_id = req.request_id.clone();

        let manager_clone = Arc::clone(&manager);
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::Deny,
                pattern: None,
            })
            .await
            .unwrap();

        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Deny);
    }

    #[tokio::test]
    async fn always_allow_creates_rule() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Read", "/src/main.rs");
        let request_id = req.request_id.clone();

        let manager_clone = Arc::clone(&manager);
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::AlwaysAllow,
                pattern: Some("/src/*.rs".to_string()),
            })
            .await
            .unwrap();

        // AlwaysAllow maps to Approve for the CLI
        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Approve);

        // Check rule was saved
        let rules = manager.rules().await;
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].0, "Read");
        assert_eq!(rules[0].1, "/src/*.rs");

        // Future matching request should be auto-allowed
        let req2 = make_request("Read", "/src/lib.rs");
        assert!(manager.is_auto_allowed(&req2).await);

        // Non-matching request should NOT be auto-allowed
        let req3 = make_request("Read", "/docs/readme.md");
        assert!(!manager.is_auto_allowed(&req3).await);
    }

    #[tokio::test]
    async fn timeout_auto_denies() {
        let manager = PermissionManager::with_timeout(1); // 1 second timeout
        let req = make_request("Bash", "dangerous-command");

        // Don't resolve — let it timeout
        let result = manager.request_permission(req).await.unwrap();
        assert_eq!(result, PermissionAction::Deny);
    }

    #[tokio::test]
    async fn timeout_waits_and_cleans_up_pending_request() {
        let manager = PermissionManager::with_timeout(1);
        let req = make_request("Bash", "slow-command");

        let start = Instant::now();
        let result = manager.request_permission(req).await.unwrap();
        let elapsed = start.elapsed();

        assert_eq!(result, PermissionAction::Deny);
        assert!(
            elapsed.as_millis() >= 900,
            "Timeout should wait ~1s, got {}ms",
            elapsed.as_millis()
        );
        assert_eq!(manager.pending_count().await, 0);
    }

    #[tokio::test]
    async fn clear_rules_removes_all() {
        let manager = Arc::new(PermissionManager::with_timeout(5));

        // Add a rule via always-allow
        let req = make_request("Bash", "ls");
        let request_id = req.request_id.clone();

        let manager_clone = Arc::clone(&manager);
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::AlwaysAllow,
                pattern: Some("*".to_string()),
            })
            .await
            .unwrap();

        let _ = handle.await;

        assert!(!manager.rules().await.is_empty());

        manager.clear_rules().await;
        assert!(manager.rules().await.is_empty());
    }

    #[tokio::test]
    async fn resolve_nonexistent_request_returns_error() {
        let manager = PermissionManager::new();

        let result = manager
            .resolve_permission(PermissionResponse {
                request_id: "nonexistent".to_string(),
                action: PermissionAction::Approve,
                pattern: None,
            })
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn cannot_resolve_same_request_twice() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Read", "cat /tmp/test.txt");
        let request_id = req.request_id.clone();
        let manager_clone = Arc::clone(&manager);
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        manager
            .resolve_permission(PermissionResponse {
                request_id: request_id.clone(),
                action: PermissionAction::Approve,
                pattern: None,
            })
            .await
            .unwrap();

        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Approve);

        let second = manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::Deny,
                pattern: None,
            })
            .await;
        assert!(second.is_err());
    }

    #[tokio::test]
    async fn always_allow_without_pattern_defaults_to_exact_command() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Read", "cat /tmp/test.txt");
        let request_id = req.request_id.clone();

        let manager_clone = Arc::clone(&manager);
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::AlwaysAllow,
                pattern: None,
            })
            .await
            .unwrap();

        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Approve);

        let exact = make_request("Read", "cat /tmp/test.txt");
        assert!(manager.is_auto_allowed(&exact).await);

        let different = make_request("Read", "cat /tmp/other.txt");
        assert!(!manager.is_auto_allowed(&different).await);
    }

    // --- Pattern matching tests ---

    #[test]
    fn pattern_exact_match() {
        assert!(PermissionManager::matches_pattern("ls -la", "ls -la"));
        assert!(!PermissionManager::matches_pattern("ls -la", "rm -rf"));
    }

    #[test]
    fn pattern_wildcard_all() {
        assert!(PermissionManager::matches_pattern("*", "anything at all"));
    }

    #[test]
    fn pattern_empty_value_behavior() {
        assert!(!PermissionManager::matches_pattern("git *", ""));
        assert!(PermissionManager::matches_pattern("*", ""));
        assert!(PermissionManager::matches_pattern("", ""));
    }

    #[test]
    fn pattern_prefix_wildcard() {
        assert!(PermissionManager::matches_pattern("*.rs", "main.rs"));
        assert!(PermissionManager::matches_pattern("*.rs", "src/lib.rs"));
        assert!(!PermissionManager::matches_pattern("*.rs", "main.py"));
    }

    #[test]
    fn pattern_suffix_wildcard() {
        assert!(PermissionManager::matches_pattern("/src/*", "/src/main.rs"));
        assert!(PermissionManager::matches_pattern(
            "/src/*",
            "/src/deep/file.rs"
        ));
        assert!(!PermissionManager::matches_pattern(
            "/src/*",
            "/docs/readme.md"
        ));
    }

    #[test]
    fn pattern_middle_wildcard() {
        assert!(PermissionManager::matches_pattern(
            "/src/*.rs",
            "/src/main.rs"
        ));
        assert!(PermissionManager::matches_pattern(
            "/src/*.rs",
            "/src/bridge/mod.rs"
        ));
    }

    #[test]
    fn permission_request_serializes() {
        let req = PermissionRequest {
            request_id: "test-123".to_string(),
            tool: "Bash".to_string(),
            command: "ls -la".to_string(),
            file_path: Some("/home/user".to_string()),
            risk_level: "low".to_string(),
            tool_input: None,
        };

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("test-123"));
        assert!(json.contains("Bash"));

        let deserialized: PermissionRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.request_id, "test-123");
    }

    #[test]
    fn permission_action_serializes() {
        let json = serde_json::to_string(&PermissionAction::AlwaysAllow).unwrap();
        assert_eq!(json, "\"AlwaysAllow\"");
    }

    // --- YOLO mode tests ---

    #[tokio::test]
    async fn yolo_mode_default_off() {
        let manager = PermissionManager::new();
        assert!(!manager.is_yolo_mode().await);
    }

    #[tokio::test]
    async fn yolo_mode_enable_disable() {
        let manager = PermissionManager::new();
        assert!(!manager.is_yolo_mode().await);

        manager.enable_yolo_mode().await;
        assert!(manager.is_yolo_mode().await);

        manager.disable_yolo_mode().await;
        assert!(!manager.is_yolo_mode().await);
    }

    #[tokio::test]
    async fn yolo_mode_auto_approves_everything() {
        let manager = PermissionManager::new();
        manager.enable_yolo_mode().await;

        // Even "dangerous" commands are auto-approved in YOLO mode
        let req = make_request("Bash", "rm -rf /");
        let result = manager.request_permission(req).await.unwrap();
        assert_eq!(result, PermissionAction::Approve);

        // Nothing is pending — request never queued
        assert_eq!(manager.pending_count().await, 0);
    }

    #[tokio::test]
    async fn yolo_mode_auto_approves_without_blocking() {
        let manager = PermissionManager::new();
        manager.enable_yolo_mode().await;

        let start = Instant::now();
        let req = make_request("Bash", "rm -rf /tmp/example");
        let result = manager.request_permission(req).await.unwrap();
        let elapsed = start.elapsed();

        assert_eq!(result, PermissionAction::Approve);
        assert!(
            elapsed.as_millis() < 100,
            "YOLO auto-approval should be immediate, got {}ms",
            elapsed.as_millis()
        );
    }

    #[tokio::test]
    async fn yolo_mode_does_not_affect_rules() {
        let manager = PermissionManager::new();
        manager.enable_yolo_mode().await;

        // YOLO auto-approves but does NOT create allow rules
        let req = make_request("Bash", "ls");
        let _ = manager.request_permission(req).await.unwrap();
        assert!(manager.rules().await.is_empty());
    }

    #[tokio::test]
    async fn disabling_yolo_restores_normal_flow_with_timeout() {
        let manager = PermissionManager::with_timeout(1);

        manager.enable_yolo_mode().await;
        manager.disable_yolo_mode().await;

        let req = make_request("Bash", "dangerous-after-yolo");
        let result = manager.request_permission(req).await.unwrap();
        assert_eq!(result, PermissionAction::Deny);
    }

    // --- Developer mode tests (CHI-102) ---

    #[tokio::test]
    async fn developer_mode_default_off() {
        let manager = PermissionManager::new();
        assert!(!manager.is_developer_mode().await);
    }

    #[tokio::test]
    async fn developer_mode_enable_disable() {
        let manager = PermissionManager::new();
        assert!(!manager.is_developer_mode().await);

        manager.enable_developer_mode().await;
        assert!(manager.is_developer_mode().await);

        manager.disable_developer_mode().await;
        assert!(!manager.is_developer_mode().await);
    }

    #[tokio::test]
    async fn developer_mode_independent_of_yolo() {
        let manager = PermissionManager::new();

        // Enable developer mode
        manager.enable_developer_mode().await;
        assert!(manager.is_developer_mode().await);
        assert!(!manager.is_yolo_mode().await);

        // Enable YOLO too — both can be on (YOLO takes priority in bridge.rs)
        manager.enable_yolo_mode().await;
        assert!(manager.is_developer_mode().await);
        assert!(manager.is_yolo_mode().await);

        // Disable YOLO — developer mode persists
        manager.disable_yolo_mode().await;
        assert!(manager.is_developer_mode().await);
        assert!(!manager.is_yolo_mode().await);
    }

    #[tokio::test]
    async fn pending_requests_returns_queued_item_before_resolution() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Read", "cat Cargo.toml");
        let request_id = req.request_id.clone();

        let manager_clone = Arc::clone(&manager);
        let handle = tokio::spawn(async move { manager_clone.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let pending = manager.pending_requests().await;
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].request_id, request_id);

        manager
            .resolve_permission(PermissionResponse {
                request_id,
                action: PermissionAction::Approve,
                pattern: None,
            })
            .await
            .unwrap();

        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, PermissionAction::Approve);
    }
}
