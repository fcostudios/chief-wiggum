//! IPC commands for controlling CLI processes via SessionBridgeMap.
//!
//! Each command is thin: validate input -> call SessionBridgeMap -> return result.
//! Per GUIDE-001 §2.3 and SPEC-004 §4.1.

use crate::bridge::event_loop;
use crate::bridge::manager::SessionBridgeMap;
use crate::bridge::permission::{PermissionAction, PermissionManager, PermissionResponse};
use crate::bridge::process::{BridgeConfig, ProcessStatus};
use crate::bridge::CliLocation;
use crate::bridge::{control, ControlRequest};
use crate::AppError;
use std::collections::HashMap;
use tauri::State;

const MAX_PROMPT_IMAGE_BYTES: u64 = 5 * 1024 * 1024;

fn parse_permission_action(action: &str) -> Result<PermissionAction, AppError> {
    match action {
        "Approve" => Ok(PermissionAction::Approve),
        "Deny" => Ok(PermissionAction::Deny),
        "AlwaysAllow" => Ok(PermissionAction::AlwaysAllow),
        other => Err(AppError::Validation(format!(
            "Invalid permission action: {}",
            other
        ))),
    }
}

fn is_supported_image_mime(mime: &str) -> bool {
    matches!(
        mime,
        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    )
}

fn validate_message_images(images: &[control::UserImageInput]) -> Result<(), AppError> {
    for image in images {
        if image.data_base64.trim().is_empty() {
            return Err(AppError::Validation(format!(
                "Image '{}' has no payload data",
                image.file_name
            )));
        }
        if !is_supported_image_mime(&image.mime_type) {
            return Err(AppError::Validation(format!(
                "Unsupported image mime type '{}' for '{}'",
                image.mime_type, image.file_name
            )));
        }
        if image.size_bytes == 0 {
            return Err(AppError::Validation(format!(
                "Image '{}' has invalid size 0 bytes",
                image.file_name
            )));
        }
        if image.size_bytes > MAX_PROMPT_IMAGE_BYTES {
            return Err(AppError::Validation(format!(
                "Image '{}' exceeds max size of {} bytes",
                image.file_name, MAX_PROMPT_IMAGE_BYTES
            )));
        }
    }

    Ok(())
}

fn build_question_updated_input(
    answers: &HashMap<String, String>,
    original_questions: serde_json::Value,
) -> Result<serde_json::Map<String, serde_json::Value>, AppError> {
    let mut updated_input = serde_json::Map::new();
    updated_input.insert("questions".to_string(), original_questions);
    updated_input.insert(
        "answers".to_string(),
        serde_json::to_value(answers).map_err(|e| {
            AppError::Validation(format!("Failed to serialize question answers: {}", e))
        })?,
    );
    Ok(updated_input)
}

/// Start a persistent CLI session using the Agent SDK control protocol.
///
/// Creates an AgentSdkBridge with bidirectional JSONL communication.
/// The bridge stays alive for the session lifetime — follow-up messages
/// are sent via `send_to_cli` which writes to stdin.
#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
pub async fn start_session_cli(
    app: tauri::AppHandle,
    bridge_map: State<'_, SessionBridgeMap>,
    cli: State<'_, CliLocation>,
    permission_manager: State<'_, PermissionManager>,
    session_id: String,
    project_path: String,
    model: String,
    cli_session_id: Option<String>,
) -> Result<(), AppError> {
    if !cli.supports_sdk() {
        return Err(AppError::Bridge(
            "Claude Code CLI version does not support Agent SDK protocol. Upgrade to version 2.1+ or use legacy mode."
                .to_string(),
        ));
    }

    if bridge_map.has(&session_id).await {
        bridge_map.remove(&session_id).await?;
    }

    if !bridge_map.can_spawn().await {
        let active = bridge_map.active_count().await;
        let max = bridge_map.max_concurrent();
        return Err(AppError::ResourceLimit { max, active });
    }

    let cli_path = cli.binary_path()?.to_string();
    let mut extra_args = Vec::new();

    if let Some(ref id) = cli_session_id {
        if !id.is_empty() {
            extra_args.push("--resume".to_string());
            extra_args.push(id.clone());
        }
    }

    let config = BridgeConfig {
        cli_path,
        model: Some(model),
        output_format: "stream-json".to_string(),
        working_dir: Some(project_path),
        extra_args,
        ..BridgeConfig::default()
    };

    bridge_map
        .spawn_sdk_for_session(&session_id, config)
        .await?;

    if let Some(bridge) = bridge_map.get(&session_id).await {
        event_loop::spawn_event_loop(
            app.clone(),
            session_id,
            bridge,
            bridge_map.mcp_cache(),
            bridge_map.runtimes(),
            bridge_map.sdk_commands_handle(),
            Some(permission_manager.inner().clone()),
        );
    }

    Ok(())
}

/// Send a message by spawning a CLI process with `-p "prompt"`.
///
/// Each message spawns a new process. Follow-up messages use `--resume <id>`
/// (if a CLI session ID is known) or `--continue` (fallback) to resume
/// the conversation. The Claude Code CLI does not accept prompts via stdin
/// in `--output-format stream-json` mode — it requires `-p`.
///
/// Permission handling: In `-p` mode the CLI auto-denies permission requests
/// (it doesn't wait for an external response). We pre-authorize safe read-only
/// tools via `--allowedTools`, and pass `--dangerously-skip-permissions` when
/// YOLO mode is enabled to auto-approve everything.
#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn send_to_cli(
    app: tauri::AppHandle,
    bridge_map: State<'_, SessionBridgeMap>,
    cli: State<'_, CliLocation>,
    permission_manager: State<'_, PermissionManager>,
    session_id: String,
    project_path: String,
    model: String,
    message: String,
    message_images: Option<Vec<control::UserImageInput>>,
    is_follow_up: bool,
    cli_session_id: Option<String>,
) -> Result<(), AppError> {
    let message_images = message_images.unwrap_or_default();
    if !message_images.is_empty() {
        validate_message_images(&message_images)?;
    }

    // SDK mode: if this session already has a persistent SDK bridge, write the
    // follow-up message to stdin instead of spawning a new process.
    if bridge_map.has(&session_id).await {
        if let Some(bridge) = bridge_map.get(&session_id).await {
            if bridge.supports_sdk_protocol() {
                if message_images.is_empty() {
                    bridge.send(&message).await?;
                } else {
                    bridge
                        .send_user_message_with_images(message, message_images)
                        .await?;
                }
                tracing::info!(
                    "send_to_cli [{}]: wrote message to SDK bridge stdin (follow_up: {})",
                    session_id,
                    is_follow_up
                );
                return Ok(());
            }
        }

        if !message_images.is_empty() {
            return Err(AppError::Validation(
                "Image attachments require Agent SDK mode. Upgrade Claude Code CLI and reconnect."
                    .to_string(),
            ));
        }

        // Legacy mode: remove the previous per-message process bridge.
        bridge_map.remove(&session_id).await?;
    }

    // Check concurrent session limit (CHI-111)
    if !bridge_map.can_spawn().await {
        let active = bridge_map.active_count().await;
        let max = bridge_map.max_concurrent();
        return Err(AppError::ResourceLimit { max, active });
    }

    let cli_path = cli.binary_path()?.to_string();
    let yolo = permission_manager.is_yolo_mode().await;
    let developer = permission_manager.is_developer_mode().await;

    if !message_images.is_empty() {
        return Err(AppError::Validation(
            "Image attachments are not supported in legacy prompt mode. Start an SDK session first."
                .to_string(),
        ));
    }

    let mut extra_args = vec!["--verbose".to_string(), "-p".to_string(), message];

    // Three-tier permission strategy for `-p` mode (CHI-102):
    //
    // In non-interactive mode the CLI auto-denies permission requests (it can't
    // show prompts). We must pre-authorize tools via --allowedTools.
    //
    // Tier 1 — YOLO:     Skip all permission prompts (auto-approve everything)
    // Tier 2 — Developer: Pre-authorize built-in tools + common Bash patterns
    // Tier 3 — Safe:     Pre-authorize built-in tools only (no Bash)
    if yolo {
        extra_args.push("--dangerously-skip-permissions".to_string());
    } else {
        // Built-in tools: safe read-only + file editing (needed for coding tasks)
        let allowed_tools = [
            "WebSearch",
            "WebFetch",
            "Read",
            "Glob",
            "Grep",
            "Edit",
            "Write",
            "NotebookEdit",
            "Task",
            "TodoRead",
            "TodoWrite",
        ];
        for tool in &allowed_tools {
            extra_args.push("--allowedTools".to_string());
            extra_args.push(tool.to_string());
        }

        // Developer mode: add common Bash patterns for dev workflows (CHI-102).
        // These use Claude Code's Bash(pattern) syntax with glob matching.
        // Still safer than YOLO — only allows specific command prefixes.
        if developer {
            let bash_patterns = [
                "Bash(git *)",
                "Bash(gh *)",
                "Bash(npm *)",
                "Bash(npx *)",
                "Bash(pnpm *)",
                "Bash(bun *)",
                "Bash(yarn *)",
                "Bash(cargo *)",
                "Bash(rustup *)",
                "Bash(ls *)",
                "Bash(cat *)",
                "Bash(which *)",
                "Bash(echo *)",
                "Bash(pwd)",
                "Bash(env)",
                "Bash(node *)",
                "Bash(python *)",
                "Bash(python3 *)",
                "Bash(pip *)",
                "Bash(pip3 *)",
            ];
            tracing::info!(
                "send_to_cli: developer mode — adding {} Bash patterns to --allowedTools",
                bash_patterns.len()
            );
            for pattern in &bash_patterns {
                extra_args.push("--allowedTools".to_string());
                extra_args.push(pattern.to_string());
            }
        }

        // MCP tools: pass individual server prefixes from cache.
        // The `mcp__*` wildcard is broken (Claude Code GitHub #13077).
        // Per the docs, `mcp__servername` matches all tools from that server.
        // Cache is populated from the CLI's system:init event on first message.
        let mcp_prefixes = bridge_map.mcp_allowed_tools().await;
        if !mcp_prefixes.is_empty() {
            tracing::info!(
                "send_to_cli: adding {} cached MCP server prefixes to --allowedTools",
                mcp_prefixes.len()
            );
            for prefix in &mcp_prefixes {
                extra_args.push("--allowedTools".to_string());
                extra_args.push(prefix.clone());
            }
        } else {
            tracing::info!(
                "send_to_cli: no cached MCP prefixes yet (first message in app lifecycle)"
            );
        }
    }

    // Resume by CLI session ID when available, fall back to --continue
    if is_follow_up {
        if let Some(ref id) = cli_session_id {
            if !id.is_empty() {
                extra_args.push("--resume".to_string());
                extra_args.push(id.clone());
            } else {
                extra_args.push("--continue".to_string());
            }
        } else {
            extra_args.push("--continue".to_string());
        }
    }

    let config = BridgeConfig {
        cli_path,
        model: Some(model),
        output_format: "stream-json".to_string(),
        working_dir: Some(project_path),
        extra_args,
        ..BridgeConfig::default()
    };

    bridge_map.spawn_for_session(&session_id, config).await?;

    // Start the event loop for this session
    if let Some(bridge) = bridge_map.get(&session_id).await {
        event_loop::spawn_event_loop(
            app.clone(),
            session_id,
            bridge,
            bridge_map.mcp_cache(),
            bridge_map.runtimes(),
            bridge_map.sdk_commands_handle(),
            None,
        );
    }

    Ok(())
}

/// Change the model mid-session via the SDK control protocol.
#[tauri::command(rename_all = "snake_case")]
pub async fn set_session_model(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
    model: String,
) -> Result<(), AppError> {
    let bridge = bridge_map
        .get(&session_id)
        .await
        .ok_or_else(|| AppError::Bridge(format!("No active bridge for session {}", session_id)))?;

    let req = ControlRequest::set_model(control::next_request_id(), model.clone());
    bridge.send_control_request(req).await?;

    tracing::info!(
        "set_session_model [{}]: sent set_model({})",
        session_id,
        model
    );
    Ok(())
}

/// Interrupt the current CLI execution via the SDK control protocol.
#[tauri::command(rename_all = "snake_case")]
pub async fn interrupt_session(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<(), AppError> {
    let bridge = bridge_map
        .get(&session_id)
        .await
        .ok_or_else(|| AppError::Bridge(format!("No active bridge for session {}", session_id)))?;

    let req = ControlRequest::interrupt(control::next_request_id());
    bridge.send_control_request(req).await?;

    tracing::info!(
        "interrupt_session [{}]: sent interrupt control request",
        session_id
    );
    Ok(())
}

/// Stop the CLI process for a session.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_session_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<(), AppError> {
    bridge_map.remove(&session_id).await
}

/// Get the CLI process status for a session.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_cli_status(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<ProcessStatus, AppError> {
    match bridge_map.get(&session_id).await {
        Some(bridge) => Ok(bridge.status().await),
        None => Ok(ProcessStatus::NotStarted),
    }
}

/// Resolve a pending permission request with the user's action.
///
/// Called by the frontend when the user clicks Approve/Deny/Always Allow
/// in the PermissionDialog (SPEC-004 §5.2).
#[tauri::command(rename_all = "snake_case")]
pub async fn respond_permission(
    permission_manager: State<'_, PermissionManager>,
    request_id: String,
    action: String,
    pattern: Option<String>,
) -> Result<(), AppError> {
    let action = parse_permission_action(&action)?;

    let response = PermissionResponse {
        request_id,
        action,
        pattern,
    };

    permission_manager.resolve_permission(response).await
}

/// Resolve a pending AskUserQuestion request with the user's selected answers.
#[tauri::command(rename_all = "snake_case")]
pub async fn respond_question(
    session_id: String,
    request_id: String,
    answers: HashMap<String, String>,
    original_questions: serde_json::Value,
    bridge_map: State<'_, SessionBridgeMap>,
    permission_manager: State<'_, PermissionManager>,
) -> Result<(), AppError> {
    if bridge_map.get(&session_id).await.is_none() {
        return Err(AppError::Bridge(format!(
            "No active bridge for session: {}",
            session_id
        )));
    }

    let updated_input = build_question_updated_input(&answers, original_questions)?;
    permission_manager
        .resolve_question(&request_id, updated_input)
        .await?;

    tracing::info!(
        "Responded to question {} for session {} with {} answers",
        request_id,
        session_id,
        answers.len()
    );
    Ok(())
}

/// Toggle YOLO mode for the permission system.
///
/// When enabled, all permission requests are auto-approved without user interaction.
/// See SPEC-001 §7.1 for YOLO mode safety rails.
#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_yolo_mode(
    permission_manager: State<'_, PermissionManager>,
    enable: bool,
) -> Result<(), AppError> {
    if enable {
        permission_manager.enable_yolo_mode().await;
    } else {
        permission_manager.disable_yolo_mode().await;
    }
    Ok(())
}

/// List sessions with active CLI bridges. Called on frontend mount for reconnection.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_active_bridges(
    bridge_map: State<'_, SessionBridgeMap>,
) -> Result<Vec<crate::bridge::manager::ActiveBridgeInfo>, AppError> {
    Ok(bridge_map.list_active_sessions().await)
}

/// Drain buffered events for a session (replay after HMR reload).
#[tauri::command(rename_all = "snake_case")]
pub async fn drain_session_buffer(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<Vec<crate::bridge::manager::BufferedEvent>, AppError> {
    Ok(bridge_map.drain_session_buffer(&session_id).await)
}

/// Toggle Developer mode for the permission system (CHI-102).
///
/// When enabled, common Bash patterns (git, gh, npm, cargo, etc.) are pre-authorized
/// via `--allowedTools "Bash(pattern)"`. This is the middle tier between Safe
/// (no Bash at all) and YOLO (auto-approve everything).
#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_developer_mode(
    permission_manager: State<'_, PermissionManager>,
    enable: bool,
) -> Result<(), AppError> {
    if enable {
        permission_manager.enable_developer_mode().await;
    } else {
        permission_manager.disable_developer_mode().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    fn make_request(tool: &str, command: &str) -> crate::bridge::permission::PermissionRequest {
        crate::bridge::permission::PermissionRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            tool: tool.to_string(),
            command: command.to_string(),
            file_path: None,
            risk_level: "medium".to_string(),
            tool_input: None,
        }
    }

    #[test]
    fn parse_permission_action_approve() {
        let action = parse_permission_action("Approve").expect("parse Approve");
        assert_eq!(action, PermissionAction::Approve);
    }

    #[test]
    fn parse_permission_action_deny() {
        let action = parse_permission_action("Deny").expect("parse Deny");
        assert_eq!(action, PermissionAction::Deny);
    }

    #[test]
    fn parse_permission_action_always_allow() {
        let action = parse_permission_action("AlwaysAllow").expect("parse AlwaysAllow");
        assert_eq!(action, PermissionAction::AlwaysAllow);
    }

    #[test]
    fn parse_permission_action_invalid_rejected() {
        let err = parse_permission_action("InvalidAction").expect_err("should reject invalid");
        match err {
            AppError::Validation(message) => assert!(message.contains("InvalidAction")),
            other => panic!("expected validation error, got {:?}", other),
        }
    }

    #[test]
    fn parse_permission_action_case_sensitive() {
        let err = parse_permission_action("approve").expect_err("lowercase should fail");
        match err {
            AppError::Validation(message) => assert!(message.contains("approve")),
            other => panic!("expected validation error, got {:?}", other),
        }
    }

    #[test]
    fn validate_message_images_accepts_supported_image() {
        let images = vec![control::UserImageInput {
            file_name: "paste-1.png".to_string(),
            mime_type: "image/png".to_string(),
            data_base64: "YWJj".to_string(),
            size_bytes: 3,
            width: Some(1),
            height: Some(1),
        }];
        let result = validate_message_images(&images);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_message_images_rejects_unsupported_mime() {
        let images = vec![control::UserImageInput {
            file_name: "paste-1.bmp".to_string(),
            mime_type: "image/bmp".to_string(),
            data_base64: "YWJj".to_string(),
            size_bytes: 3,
            width: Some(1),
            height: Some(1),
        }];
        let err = validate_message_images(&images).expect_err("unsupported mime should fail");
        match err {
            AppError::Validation(message) => {
                assert!(message.contains("Unsupported image mime type"))
            }
            other => panic!("expected validation error, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn toggle_yolo_mode_manager_logic() {
        let manager = PermissionManager::new();
        assert!(!manager.is_yolo_mode().await);
        manager.enable_yolo_mode().await;
        assert!(manager.is_yolo_mode().await);
        manager.disable_yolo_mode().await;
        assert!(!manager.is_yolo_mode().await);
    }

    #[tokio::test]
    async fn toggle_developer_mode_manager_logic() {
        let manager = PermissionManager::new();
        assert!(!manager.is_developer_mode().await);
        manager.enable_developer_mode().await;
        assert!(manager.is_developer_mode().await);
        manager.disable_developer_mode().await;
        assert!(!manager.is_developer_mode().await);
    }

    #[tokio::test]
    async fn resolve_permission_approve_flow_via_manager_delegate() {
        let manager = Arc::new(PermissionManager::with_timeout(5));
        let req = make_request("Read", "cat /tmp/test");
        let req_id = req.request_id.clone();

        let mgr = Arc::clone(&manager);
        let handle = tokio::spawn(async move { mgr.request_permission(req).await });

        tokio::time::sleep(Duration::from_millis(50)).await;

        manager
            .resolve_permission(PermissionResponse {
                request_id: req_id,
                action: PermissionAction::Approve,
                pattern: None,
            })
            .await
            .expect("resolve request");

        let result = handle
            .await
            .expect("join permission task")
            .expect("permission result");
        assert_eq!(result, PermissionAction::Approve);
    }

    #[tokio::test]
    async fn resolve_nonexistent_request_returns_error_via_manager_delegate() {
        let manager = PermissionManager::new();
        let result = manager
            .resolve_permission(PermissionResponse {
                request_id: "does-not-exist".to_string(),
                action: PermissionAction::Approve,
                pattern: None,
            })
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_active_bridges_empty_initially() {
        let map = SessionBridgeMap::new();
        let active = map.list_active_sessions().await;
        assert!(active.is_empty());
    }

    #[tokio::test]
    async fn list_active_bridges_reflects_runtime_metadata() {
        let map = SessionBridgeMap::new();
        map.create_runtime("session-1").await;
        let active = map.list_active_sessions().await;
        assert!(
            active.is_empty(),
            "runtime alone should not appear without bridge"
        );

        let mock = Arc::new(crate::bridge::process::MockBridge::new(vec![]));
        map.insert_mock("session-1", mock).await;
        let active = map.list_active_sessions().await;
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].session_id, "session-1");
        assert_eq!(active[0].process_status, "starting");
        assert!(!active[0].has_buffered_events);
    }

    #[tokio::test]
    async fn drain_nonexistent_session_returns_empty() {
        let map = SessionBridgeMap::new();
        let events = map.drain_session_buffer("nonexistent").await;
        assert!(events.is_empty());
    }
}
