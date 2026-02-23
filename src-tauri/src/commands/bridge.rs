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
use tauri::State;

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
    is_follow_up: bool,
    cli_session_id: Option<String>,
) -> Result<(), AppError> {
    // SDK mode: if this session already has a persistent SDK bridge, write the
    // follow-up message to stdin instead of spawning a new process.
    if bridge_map.has(&session_id).await {
        if let Some(bridge) = bridge_map.get(&session_id).await {
            if bridge.supports_sdk_protocol() {
                bridge.send(&message).await?;
                tracing::info!(
                    "send_to_cli [{}]: wrote message to SDK bridge stdin (follow_up: {})",
                    session_id,
                    is_follow_up
                );
                return Ok(());
            }
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
    let action = match action.as_str() {
        "Approve" => PermissionAction::Approve,
        "Deny" => PermissionAction::Deny,
        "AlwaysAllow" => PermissionAction::AlwaysAllow,
        other => {
            return Err(AppError::Validation(format!(
                "Invalid permission action: {}",
                other
            )))
        }
    };

    let response = PermissionResponse {
        request_id,
        action,
        pattern,
    };

    permission_manager.resolve_permission(response).await
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
