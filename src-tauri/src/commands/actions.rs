//! IPC commands for Project Actions.
//! Per GUIDE-001 §2.3: thin validate -> call -> format.

use std::path::PathBuf;

use crate::actions::bridge::ActionBridgeConfig;
use crate::actions::event_loop;
use crate::actions::manager::{ActionBridgeMap, ActionRuntimeMetadata, RunningActionInfo};
use crate::actions::scanner;
use crate::actions::{ActionCategory, ActionDefinition, ActionSource, CustomActionConfig};
use crate::db::{queries, Database};
use crate::AppError;

/// Cross-project running action payload used by Actions Center overview.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CrossProjectRunningAction {
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub action_name: String,
    pub status: crate::actions::bridge::ActionStatus,
    pub elapsed_ms: u64,
    pub last_output_line: Option<String>,
    pub command: String,
    pub category: ActionCategory,
    pub is_long_running: bool,
}

/// Discover all runnable actions in a project directory.
#[tauri::command(rename_all = "snake_case")]
pub async fn discover_actions(project_path: String) -> Result<Vec<ActionDefinition>, AppError> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }

    let actions = tokio::task::spawn_blocking(move || scanner::discover_actions(&path))
        .await
        .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(actions)
}

/// Start an action process.
#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
pub async fn start_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
    command: String,
    working_dir: String,
    action_name: Option<String>,
    project_id: Option<String>,
    project_name: Option<String>,
    category: Option<ActionCategory>,
    is_long_running: Option<bool>,
) -> Result<(), AppError> {
    if command.trim().is_empty() {
        return Err(AppError::Validation(
            "Action command cannot be empty".to_string(),
        ));
    }

    let config = ActionBridgeConfig {
        command,
        working_dir,
        ..Default::default()
    };

    let metadata = ActionRuntimeMetadata {
        action_name: action_name.unwrap_or_else(|| action_id.clone()),
        project_id: project_id.unwrap_or_else(|| "unknown".to_string()),
        project_name: project_name.unwrap_or_else(|| "Unknown Project".to_string()),
        category: category.unwrap_or(ActionCategory::Custom),
        is_long_running: is_long_running.unwrap_or(false),
    };

    let bridge = action_map
        .spawn_action(&action_id, config, metadata)
        .await?;
    event_loop::spawn_action_event_loop(app, action_id, bridge, action_map.inner().clone());

    Ok(())
}

/// Stop a running action.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_action(
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
) -> Result<(), AppError> {
    action_map.stop_action(&action_id).await
}

/// Restart an action (stop + start).
#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
pub async fn restart_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
    command: String,
    working_dir: String,
    action_name: Option<String>,
    project_id: Option<String>,
    project_name: Option<String>,
    category: Option<ActionCategory>,
    is_long_running: Option<bool>,
) -> Result<(), AppError> {
    let _ = action_map.stop_action(&action_id).await;
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let config = ActionBridgeConfig {
        command,
        working_dir,
        ..Default::default()
    };

    let metadata = ActionRuntimeMetadata {
        action_name: action_name.unwrap_or_else(|| action_id.clone()),
        project_id: project_id.unwrap_or_else(|| "unknown".to_string()),
        project_name: project_name.unwrap_or_else(|| "Unknown Project".to_string()),
        category: category.unwrap_or(ActionCategory::Custom),
        is_long_running: is_long_running.unwrap_or(false),
    };

    let bridge = action_map
        .spawn_action(&action_id, config, metadata)
        .await?;
    event_loop::spawn_action_event_loop(app, action_id, bridge, action_map.inner().clone());

    Ok(())
}

/// List all running actions.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_running_actions(
    action_map: tauri::State<'_, ActionBridgeMap>,
) -> Result<Vec<RunningActionInfo>, AppError> {
    Ok(action_map.list_running().await)
}

/// List all running actions across projects with metadata for Actions Center.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(target = "commands/actions", level = "info", skip(action_map))]
pub async fn list_all_running_actions(
    action_map: tauri::State<'_, ActionBridgeMap>,
) -> Result<Vec<CrossProjectRunningAction>, AppError> {
    let runtimes = action_map.list_runtime_with_status().await;
    Ok(runtimes
        .into_iter()
        .map(|runtime| CrossProjectRunningAction {
            action_id: runtime.snapshot.action_id,
            project_id: runtime.snapshot.project_id,
            project_name: runtime.snapshot.project_name,
            action_name: runtime.snapshot.action_name,
            status: runtime.status,
            elapsed_ms: runtime.elapsed_ms,
            last_output_line: runtime.snapshot.last_output_line,
            command: runtime.snapshot.command,
            category: runtime.snapshot.category,
            is_long_running: runtime.snapshot.is_long_running,
        })
        .collect())
}

/// Load persisted action history entries for a project.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(
    target = "commands/actions",
    level = "info",
    skip(db),
    fields(project_id = %project_id, limit = ?limit, offset = ?offset)
)]
pub async fn get_action_history(
    project_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
    db: tauri::State<'_, Database>,
) -> Result<Vec<queries::ActionHistoryEntry>, AppError> {
    let project_id = project_id.trim().to_string();
    if project_id.is_empty() {
        return Err(AppError::Validation(
            "Project ID cannot be empty".to_string(),
        ));
    }

    let limit = limit.unwrap_or(50).clamp(1, 200);
    let offset = offset.unwrap_or(0);
    queries::get_action_history(db.inner(), &project_id, limit, offset)
}

/// Read custom actions from `.claude/actions.json`.
#[tauri::command(rename_all = "snake_case")]
pub async fn read_custom_actions(project_path: String) -> Result<Vec<ActionDefinition>, AppError> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }

    let working_dir = project_path.clone();
    let custom = tokio::task::spawn_blocking(move || scanner::read_custom_actions_file(&path))
        .await
        .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(custom
        .into_iter()
        .map(|cfg| custom_config_to_definition(cfg, &working_dir))
        .collect())
}

/// Save or update a custom action in `.claude/actions.json`.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_custom_action(
    project_path: String,
    action: ActionDefinition,
) -> Result<(), AppError> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }
    if action.name.trim().is_empty() {
        return Err(AppError::Validation(
            "Action name cannot be empty".to_string(),
        ));
    }
    if action.command.trim().is_empty() {
        return Err(AppError::Validation(
            "Action command cannot be empty".to_string(),
        ));
    }

    let custom = CustomActionConfig {
        name: action.name,
        command: action.command,
        description: action.description,
        category: Some(category_to_string(&action.category)),
        long_running: action.is_long_running,
        working_dir: Some(action.working_dir),
        before_commands: action.before_commands,
        after_commands: action.after_commands,
        env_vars: action.env_vars,
        args: action.args,
    };

    tokio::task::spawn_blocking(move || scanner::save_custom_action_file(&path, custom))
        .await
        .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(())
}

/// Delete a custom action by name from `.claude/actions.json`.
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_custom_action(
    project_path: String,
    action_name: String,
) -> Result<(), AppError> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }
    if action_name.trim().is_empty() {
        return Err(AppError::Validation(
            "Action name cannot be empty".to_string(),
        ));
    }

    tokio::task::spawn_blocking(move || scanner::delete_custom_action_file(&path, &action_name))
        .await
        .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(())
}

fn custom_config_to_definition(cfg: CustomActionConfig, project_path: &str) -> ActionDefinition {
    let category = cfg
        .category
        .as_deref()
        .map(parse_category)
        .unwrap_or_else(|| crate::actions::classify_action(&cfg.name));

    let name = cfg.name;
    ActionDefinition {
        id: format!("claude_actions:{}", name),
        name,
        command: cfg.command,
        working_dir: cfg.working_dir.unwrap_or_else(|| project_path.to_string()),
        source: ActionSource::ClaudeActions,
        category,
        description: cfg.description,
        is_long_running: cfg.long_running,
        before_commands: cfg.before_commands,
        after_commands: cfg.after_commands,
        env_vars: cfg.env_vars,
        args: cfg.args,
    }
}

fn parse_category(value: &str) -> ActionCategory {
    match value.to_lowercase().as_str() {
        "dev" => ActionCategory::Dev,
        "build" => ActionCategory::Build,
        "test" => ActionCategory::Test,
        "lint" => ActionCategory::Lint,
        "deploy" => ActionCategory::Deploy,
        _ => ActionCategory::Custom,
    }
}

fn category_to_string(category: &ActionCategory) -> String {
    match category {
        ActionCategory::Dev => "dev",
        ActionCategory::Build => "build",
        ActionCategory::Test => "test",
        ActionCategory::Lint => "lint",
        ActionCategory::Deploy => "deploy",
        ActionCategory::Custom => "custom",
    }
    .to_string()
}
