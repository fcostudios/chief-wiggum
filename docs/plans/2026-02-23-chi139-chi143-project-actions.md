# Project Actions — AI-Native Command Runner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a zero-config action runner that auto-discovers runnable commands from project files (package.json, Makefile, Cargo.toml, etc.), executes them with streaming output, and pipes logs to the AI agent — turning Chief Wiggum into an AI-native development environment.

**Architecture:** A new `src-tauri/src/actions/` module mirrors the existing `bridge/` architecture. `ActionScanner` discovers actions from project config files. `ActionBridge` implements a simplified process runner (PTY, raw lines — no stream-json parsing). `ActionBridgeMap` tracks concurrent action processes (max 8, separate from CLI session limit of 4). Events (`action:output`, `action:completed`, `action:failed`) are emitted to the frontend via Tauri events. Frontend adds an `actionStore.ts` singleton, `ActionsPanel.tsx` in the sidebar, and `ActionOutputPanel.tsx` in the DetailsPanel.

**Tech Stack:** Tauri v2, Rust (tokio, portable_pty, serde, notify), SolidJS (solid-js/store), TypeScript, TailwindCSS v4

**Linear Issues:** CHI-139 (Discovery), CHI-140 (Process Manager), CHI-141 (Log-to-Agent), CHI-142 (Sidebar Panel), CHI-143 (Output View)

---

## Task 1: Action Types & Module Scaffold (CHI-139)

**Files:**
- Create: `src-tauri/src/actions/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create `actions/mod.rs` with core types**

```rust
//! Project Actions — zero-config command runner per CHI-138.
//!
//! Discovers runnable commands from project files (package.json, Makefile, etc.)
//! and provides PTY-based execution with streaming output.

pub mod scanner;

use serde::{Deserialize, Serialize};

/// Where an action was discovered from.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionSource {
    PackageJson,
    Makefile,
    CargoToml,
    DockerCompose,
    ClaudeActions,
}

impl ActionSource {
    /// Human-readable label for UI grouping.
    pub fn label(&self) -> &'static str {
        match self {
            Self::PackageJson => "npm",
            Self::Makefile => "make",
            Self::CargoToml => "cargo",
            Self::DockerCompose => "docker",
            Self::ClaudeActions => "custom",
        }
    }
}

/// Functional category for an action, auto-classified by name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionCategory {
    Dev,
    Build,
    Test,
    Lint,
    Deploy,
    Custom,
}

/// A discovered runnable action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionDefinition {
    /// Unique ID: `{source}:{name}` e.g. `package_json:dev`
    pub id: String,
    /// Display name (e.g. "dev", "build", "test")
    pub name: String,
    /// Shell command to execute
    pub command: String,
    /// Working directory (project root by default)
    pub working_dir: String,
    /// Where this action was discovered
    pub source: ActionSource,
    /// Auto-classified category
    pub category: ActionCategory,
    /// Human-readable description (from package.json comment, Makefile comment, etc.)
    pub description: Option<String>,
    /// Whether this is expected to run indefinitely (dev servers, watchers)
    pub is_long_running: bool,
}

/// Classify an action name into a category by pattern matching.
pub fn classify_action(name: &str) -> ActionCategory {
    let lower = name.to_lowercase();
    if lower.contains("dev") || lower.contains("start") || lower.contains("serve") || lower.contains("watch") {
        ActionCategory::Dev
    } else if lower.contains("build") || lower.contains("compile") || lower.contains("bundle") {
        ActionCategory::Build
    } else if lower.contains("test") || lower.contains("spec") || lower.contains("check") {
        ActionCategory::Test
    } else if lower.contains("lint") || lower.contains("fmt") || lower.contains("format") || lower.contains("clippy") {
        ActionCategory::Lint
    } else if lower.contains("deploy") || lower.contains("release") || lower.contains("publish") {
        ActionCategory::Deploy
    } else {
        ActionCategory::Custom
    }
}

/// Detect if an action is expected to run indefinitely.
pub fn is_long_running(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("dev") || lower.contains("start") || lower.contains("serve") || lower.contains("watch")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_dev_actions() {
        assert_eq!(classify_action("dev"), ActionCategory::Dev);
        assert_eq!(classify_action("start"), ActionCategory::Dev);
        assert_eq!(classify_action("dev:server"), ActionCategory::Dev);
    }

    #[test]
    fn classify_build_actions() {
        assert_eq!(classify_action("build"), ActionCategory::Build);
        assert_eq!(classify_action("compile"), ActionCategory::Build);
    }

    #[test]
    fn classify_test_actions() {
        assert_eq!(classify_action("test"), ActionCategory::Test);
        assert_eq!(classify_action("test:unit"), ActionCategory::Test);
    }

    #[test]
    fn classify_lint_actions() {
        assert_eq!(classify_action("lint"), ActionCategory::Lint);
        assert_eq!(classify_action("format"), ActionCategory::Lint);
        assert_eq!(classify_action("clippy"), ActionCategory::Lint);
    }

    #[test]
    fn classify_deploy_actions() {
        assert_eq!(classify_action("deploy"), ActionCategory::Deploy);
        assert_eq!(classify_action("release"), ActionCategory::Deploy);
    }

    #[test]
    fn classify_custom_fallback() {
        assert_eq!(classify_action("clean"), ActionCategory::Custom);
        assert_eq!(classify_action("docs"), ActionCategory::Custom);
    }

    #[test]
    fn long_running_detection() {
        assert!(is_long_running("dev"));
        assert!(is_long_running("start"));
        assert!(is_long_running("serve"));
        assert!(is_long_running("watch"));
        assert!(!is_long_running("build"));
        assert!(!is_long_running("test"));
    }
}
```

**Step 2: Register module in `lib.rs`**

Add `pub mod actions;` after `pub mod bridge;` in `src-tauri/src/lib.rs`.

**Step 3: Run tests**

Run: `cargo test -p chief-wiggum -- actions`
Expected: 7 new tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/actions/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add actions module with core types and classification (CHI-139)"
```

---

## Task 2: Action Scanner — Multi-Format Project File Parser (CHI-139)

**Files:**
- Create: `src-tauri/src/actions/scanner.rs`

**Step 1: Create scanner with parsers for each file format**

```rust
//! Auto-discovers runnable actions from project config files.
//!
//! Scans: package.json, Makefile, Cargo.toml, docker-compose.yml, .claude/actions.json
//! Per CHI-139: zero-config discovery.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::AppResult;

use super::{classify_action, is_long_running, ActionCategory, ActionDefinition, ActionSource};

/// Config files to scan, in priority order.
const SCANNABLE_FILES: &[(&str, ActionSource)] = &[
    ("package.json", ActionSource::PackageJson),
    ("Makefile", ActionSource::Makefile),
    ("Cargo.toml", ActionSource::CargoToml),
    ("docker-compose.yml", ActionSource::DockerCompose),
    ("docker-compose.yaml", ActionSource::DockerCompose),
    (".claude/actions.json", ActionSource::ClaudeActions),
];

/// Discover all actions in a project directory.
pub fn discover_actions(project_path: &Path) -> AppResult<Vec<ActionDefinition>> {
    let mut actions = Vec::new();

    for (filename, source) in SCANNABLE_FILES {
        let file_path = project_path.join(filename);
        if file_path.exists() {
            match parse_config_file(&file_path, source, project_path) {
                Ok(mut found) => actions.append(&mut found),
                Err(e) => {
                    tracing::warn!(
                        file = %file_path.display(),
                        error = %e,
                        "Failed to parse config file for actions"
                    );
                }
            }
        }
    }

    Ok(actions)
}

/// Get the list of filenames we scan (for the file watcher).
pub fn scannable_filenames() -> Vec<&'static str> {
    SCANNABLE_FILES.iter().map(|(f, _)| *f).collect()
}

fn parse_config_file(
    path: &Path,
    source: &ActionSource,
    project_root: &Path,
) -> AppResult<Vec<ActionDefinition>> {
    let content = std::fs::read_to_string(path)?;
    let working_dir = project_root.to_string_lossy().to_string();

    match source {
        ActionSource::PackageJson => parse_package_json(&content, &working_dir),
        ActionSource::Makefile => parse_makefile(&content, &working_dir),
        ActionSource::CargoToml => parse_cargo_toml(&content, &working_dir),
        ActionSource::DockerCompose => parse_docker_compose(&content, &working_dir),
        ActionSource::ClaudeActions => parse_claude_actions(&content, &working_dir),
    }
}

/// Parse npm scripts from package.json.
fn parse_package_json(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let json: serde_json::Value = serde_json::from_str(content)?;
    let scripts = match json.get("scripts").and_then(|s| s.as_object()) {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };

    let mut actions = Vec::new();
    for (name, command_val) in scripts {
        if let Some(command) = command_val.as_str() {
            // Skip lifecycle hooks (pre/post prefixed)
            if name.starts_with("pre") || name.starts_with("post") {
                // Allow "preview" and "prepare" but skip "pretest", "postbuild", etc.
                let is_lifecycle = scripts.contains_key(name.trim_start_matches("pre"))
                    || scripts.contains_key(name.trim_start_matches("post"));
                if is_lifecycle {
                    continue;
                }
            }

            actions.push(ActionDefinition {
                id: format!("package_json:{}", name),
                name: name.clone(),
                command: format!("npm run {}", name),
                working_dir: working_dir.to_string(),
                source: ActionSource::PackageJson,
                category: classify_action(name),
                description: None,
                is_long_running: is_long_running(name),
            });
        }
    }

    Ok(actions)
}

/// Parse targets from a Makefile.
fn parse_makefile(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let mut actions = Vec::new();
    let mut last_comment: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Capture comments above targets as descriptions
        if let Some(comment) = trimmed.strip_prefix('#') {
            last_comment = Some(comment.trim().to_string());
            continue;
        }

        // Match target lines: "name:" or "name: deps" (not "\t" recipe lines, not ".PHONY")
        if let Some(target) = trimmed.strip_suffix(':').or_else(|| trimmed.split(':').next()) {
            let target = target.trim();
            // Only match actual target definition lines (has colon, not indented, not variable assignment)
            if trimmed.contains(':')
                && !line.starts_with('\t')
                && !line.starts_with(' ')
                && !trimmed.starts_with('.')
                && !trimmed.starts_with('#')
                && !trimmed.contains('=')
                && !target.is_empty()
                && !target.contains(' ')
            {
                actions.push(ActionDefinition {
                    id: format!("makefile:{}", target),
                    name: target.to_string(),
                    command: format!("make {}", target),
                    working_dir: working_dir.to_string(),
                    source: ActionSource::Makefile,
                    category: classify_action(target),
                    description: last_comment.take(),
                    is_long_running: is_long_running(target),
                });
                continue;
            }
        }

        // Reset comment if line is not a comment or target
        if !trimmed.is_empty() {
            last_comment = None;
        }
    }

    Ok(actions)
}

/// Parse cargo aliases from Cargo.toml [alias] section.
fn parse_cargo_toml(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let mut actions = Vec::new();

    // Always add standard cargo commands
    let standard_commands = [
        ("build", "cargo build"),
        ("test", "cargo test"),
        ("check", "cargo check"),
        ("clippy", "cargo clippy"),
        ("run", "cargo run"),
        ("fmt", "cargo fmt"),
    ];

    for (name, command) in &standard_commands {
        actions.push(ActionDefinition {
            id: format!("cargo_toml:{}", name),
            name: name.to_string(),
            command: command.to_string(),
            working_dir: working_dir.to_string(),
            source: ActionSource::CargoToml,
            category: classify_action(name),
            description: None,
            is_long_running: is_long_running(name),
        });
    }

    // Parse [alias] section if present
    if let Ok(toml_value) = content.parse::<toml::Value>() {
        if let Some(alias_table) = toml_value.get("alias").and_then(|a| a.as_table()) {
            for (name, val) in alias_table {
                let command_str = match val {
                    toml::Value::String(s) => format!("cargo {}", s),
                    toml::Value::Array(arr) => {
                        let parts: Vec<String> = arr
                            .iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect();
                        format!("cargo {}", parts.join(" "))
                    }
                    _ => continue,
                };
                actions.push(ActionDefinition {
                    id: format!("cargo_toml:alias:{}", name),
                    name: name.clone(),
                    command: command_str,
                    working_dir: working_dir.to_string(),
                    source: ActionSource::CargoToml,
                    category: classify_action(name),
                    description: Some("Cargo alias".to_string()),
                    is_long_running: is_long_running(name),
                });
            }
        }
    }

    Ok(actions)
}

/// Parse services from docker-compose.yml.
fn parse_docker_compose(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let mut actions = Vec::new();

    // Simple YAML parsing — look for service names under "services:"
    let mut in_services = false;
    let mut indent_level = 0;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "services:" {
            in_services = true;
            indent_level = line.len() - line.trim_start().len() + 2; // Expected child indent
            continue;
        }

        if in_services {
            let current_indent = line.len() - line.trim_start().len();

            // Back to top level — stop scanning
            if current_indent == 0 && !trimmed.is_empty() {
                break;
            }

            // Service name is at indent_level with a trailing colon
            if current_indent == indent_level {
                if let Some(service_name) = trimmed.strip_suffix(':') {
                    let service_name = service_name.trim();
                    if !service_name.is_empty() {
                        actions.push(ActionDefinition {
                            id: format!("docker_compose:up:{}", service_name),
                            name: format!("up {}", service_name),
                            command: format!("docker compose up {}", service_name),
                            working_dir: working_dir.to_string(),
                            source: ActionSource::DockerCompose,
                            category: ActionCategory::Dev,
                            description: Some(format!("Start {} service", service_name)),
                            is_long_running: true,
                        });
                    }
                }
            }
        }
    }

    // Always add generic compose commands
    actions.push(ActionDefinition {
        id: "docker_compose:up".to_string(),
        name: "up".to_string(),
        command: "docker compose up".to_string(),
        working_dir: working_dir.to_string(),
        source: ActionSource::DockerCompose,
        category: ActionCategory::Dev,
        description: Some("Start all services".to_string()),
        is_long_running: true,
    });
    actions.push(ActionDefinition {
        id: "docker_compose:down".to_string(),
        name: "down".to_string(),
        command: "docker compose down".to_string(),
        working_dir: working_dir.to_string(),
        source: ActionSource::DockerCompose,
        category: ActionCategory::Custom,
        description: Some("Stop all services".to_string()),
        is_long_running: false,
    });

    Ok(actions)
}

/// Parse custom actions from .claude/actions.json.
fn parse_claude_actions(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    /// JSON shape for .claude/actions.json
    #[derive(Deserialize)]
    struct ActionsFile {
        actions: Vec<CustomAction>,
    }

    #[derive(Deserialize)]
    struct CustomAction {
        name: String,
        command: String,
        description: Option<String>,
        category: Option<String>,
        #[serde(default)]
        long_running: bool,
        working_dir: Option<String>,
    }

    let file: ActionsFile = serde_json::from_str(content)?;
    let mut actions = Vec::new();

    for custom in file.actions {
        let category = custom
            .category
            .as_deref()
            .map(|c| match c.to_lowercase().as_str() {
                "dev" => ActionCategory::Dev,
                "build" => ActionCategory::Build,
                "test" => ActionCategory::Test,
                "lint" => ActionCategory::Lint,
                "deploy" => ActionCategory::Deploy,
                _ => ActionCategory::Custom,
            })
            .unwrap_or_else(|| classify_action(&custom.name));

        actions.push(ActionDefinition {
            id: format!("claude_actions:{}", custom.name),
            name: custom.name,
            command: custom.command,
            working_dir: custom.working_dir.unwrap_or_else(|| working_dir.to_string()),
            source: ActionSource::ClaudeActions,
            category,
            description: custom.description,
            is_long_running: custom.long_running,
        });
    }

    Ok(actions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_project(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (name, content) in files {
            let path = dir.path().join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, content).unwrap();
        }
        dir
    }

    #[test]
    fn package_json_scripts() {
        let dir = temp_project(&[(
            "package.json",
            r#"{"scripts":{"dev":"vite","build":"vite build","test":"vitest","pretest":"echo pre"}}"#,
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"dev"));
        assert!(names.contains(&"build"));
        assert!(names.contains(&"test"));
        // pretest is a lifecycle hook for test, should be skipped
        assert!(!names.contains(&"pretest"));
    }

    #[test]
    fn package_json_command_format() {
        let dir = temp_project(&[(
            "package.json",
            r#"{"scripts":{"dev":"vite"}}"#,
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        let dev = actions.iter().find(|a| a.name == "dev").unwrap();
        assert_eq!(dev.command, "npm run dev");
        assert_eq!(dev.source, ActionSource::PackageJson);
        assert!(dev.is_long_running);
    }

    #[test]
    fn makefile_targets() {
        let dir = temp_project(&[(
            "Makefile",
            "# Build the project\nbuild:\n\tcargo build\n\n# Run tests\ntest:\n\tcargo test\n\n.PHONY: build test\n",
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"test"));
        // .PHONY should be skipped
        assert!(!names.iter().any(|n| n.starts_with('.')));
    }

    #[test]
    fn makefile_captures_comments() {
        let dir = temp_project(&[(
            "Makefile",
            "# Build the project\nbuild:\n\tcargo build\n",
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        let build = actions.iter().find(|a| a.name == "build").unwrap();
        assert_eq!(build.description.as_deref(), Some("Build the project"));
    }

    #[test]
    fn cargo_toml_standard_commands() {
        let dir = temp_project(&[(
            "Cargo.toml",
            "[package]\nname = \"test\"\nversion = \"0.1.0\"\n",
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"test"));
        assert!(names.contains(&"check"));
        assert!(names.contains(&"clippy"));
    }

    #[test]
    fn claude_actions_json() {
        let dir = temp_project(&[(
            ".claude/actions.json",
            r#"{"actions":[{"name":"migrate","command":"npx prisma migrate dev","description":"Run DB migrations","category":"dev","long_running":false}]}"#,
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].name, "migrate");
        assert_eq!(actions[0].command, "npx prisma migrate dev");
        assert_eq!(actions[0].source, ActionSource::ClaudeActions);
    }

    #[test]
    fn docker_compose_services() {
        let dir = temp_project(&[(
            "docker-compose.yml",
            "services:\n  db:\n    image: postgres\n  redis:\n    image: redis\n",
        )]);
        let actions = discover_actions(dir.path()).unwrap();
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"up db"));
        assert!(names.contains(&"up redis"));
        assert!(names.contains(&"up"));
        assert!(names.contains(&"down"));
    }

    #[test]
    fn empty_project_returns_empty() {
        let dir = temp_project(&[]);
        let actions = discover_actions(dir.path()).unwrap();
        assert!(actions.is_empty());
    }

    #[test]
    fn multiple_sources_combined() {
        let dir = temp_project(&[
            ("package.json", r#"{"scripts":{"dev":"vite"}}"#),
            ("Makefile", "build:\n\tcargo build\n"),
        ]);
        let actions = discover_actions(dir.path()).unwrap();
        assert!(actions.len() >= 2);
        let sources: Vec<&ActionSource> = actions.iter().map(|a| &a.source).collect();
        assert!(sources.contains(&&ActionSource::PackageJson));
        assert!(sources.contains(&&ActionSource::Makefile));
    }

    #[test]
    fn scannable_filenames_returns_expected() {
        let filenames = scannable_filenames();
        assert!(filenames.contains(&"package.json"));
        assert!(filenames.contains(&"Makefile"));
        assert!(filenames.contains(&"Cargo.toml"));
    }
}
```

**Step 2: Add `toml` dependency**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
toml = "0.8"
```

Also add `tempfile` under `[dev-dependencies]`:
```toml
tempfile = "3"
```

**Step 3: Run tests**

Run: `cargo test -p chief-wiggum -- actions::scanner`
Expected: 10 new tests pass

**Step 4: Run clippy**

Run: `cargo clippy -p chief-wiggum -- -D warnings`
Expected: No warnings

**Step 5: Commit**

```bash
git add src-tauri/src/actions/scanner.rs src-tauri/Cargo.toml
git commit -m "feat: action scanner — multi-format project file discovery (CHI-139)"
```

---

## Task 3: Action IPC Commands & Registration (CHI-139)

**Files:**
- Create: `src-tauri/src/commands/actions.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create `commands/actions.rs`**

```rust
//! IPC commands for Project Actions.
//! Per GUIDE-001 §2.3: thin validate → call → format.

use std::path::PathBuf;

use crate::actions::scanner;
use crate::actions::ActionDefinition;
use crate::AppError;

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

    // Run scanner on blocking thread since it does filesystem I/O
    let actions =
        tokio::task::spawn_blocking(move || scanner::discover_actions(&path))
            .await
            .map_err(|e| AppError::Other(format!("Scanner task failed: {}", e)))??;

    Ok(actions)
}
```

**Step 2: Register module in `commands/mod.rs`**

Add `pub mod actions;` to `src-tauri/src/commands/mod.rs`.

**Step 3: Register command in `main.rs`**

Add to the `invoke_handler` array:
```rust
chief_wiggum_lib::commands::actions::discover_actions,
```

**Step 4: Run checks**

Run: `cargo check -p chief-wiggum && cargo clippy -p chief-wiggum -- -D warnings`
Expected: Compiles cleanly

**Step 5: Commit**

```bash
git add src-tauri/src/commands/actions.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat: discover_actions IPC command (CHI-139)"
```

---

## Task 4: Action Process Bridge (CHI-140)

**Files:**
- Create: `src-tauri/src/actions/bridge.rs`
- Modify: `src-tauri/src/actions/mod.rs`

This implements a simplified process runner for actions. Unlike `CliBridge` (which parses stream-json from the Claude CLI), `ActionBridge` reads raw PTY lines and emits them as-is.

**Step 1: Create `actions/bridge.rs`**

```rust
//! PTY process runner for project actions (CHI-140).
//!
//! Simplified version of bridge/process.rs — runs arbitrary shell commands
//! with streaming line output. No stream-json parsing needed.

use std::io::Read;
use std::sync::Arc;

use tokio::sync::{mpsc, watch, Mutex, RwLock};

use crate::{AppError, AppResult};

/// Read buffer size for PTY output.
const PTY_BUFFER_SIZE: usize = 4096;

/// Action process status.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    Starting,
    Running,
    Completed,
    Failed,
    Stopped,
}

/// A line of output from an action process.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActionOutput {
    /// The output line content (may include ANSI escapes).
    pub line: String,
    /// Whether this line came from stderr (heuristic — PTY merges streams).
    pub is_error: bool,
}

/// Messages from the action bridge to consumers.
#[derive(Debug, Clone)]
pub enum ActionBridgeOutput {
    /// A line of output.
    Output(ActionOutput),
    /// Process has exited.
    Exited { exit_code: Option<i32> },
}

/// Configuration for spawning an action process.
#[derive(Debug, Clone)]
pub struct ActionBridgeConfig {
    /// Shell command to execute.
    pub command: String,
    /// Working directory.
    pub working_dir: String,
    /// Environment variables.
    pub env_vars: std::collections::HashMap<String, String>,
    /// PTY dimensions.
    pub pty_cols: u16,
    pub pty_rows: u16,
}

impl Default for ActionBridgeConfig {
    fn default() -> Self {
        Self {
            command: String::new(),
            working_dir: String::new(),
            env_vars: std::collections::HashMap::new(),
            pty_cols: 120,
            pty_rows: 40,
        }
    }
}

/// PTY-based process runner for actions.
pub struct ActionBridge {
    /// Channel to send input to the PTY.
    #[allow(dead_code)]
    input_tx: mpsc::Sender<String>,
    /// Channel to receive output lines.
    output_rx: Mutex<mpsc::Receiver<ActionBridgeOutput>>,
    /// Current status.
    status: Arc<RwLock<ActionStatus>>,
    /// Shutdown signal.
    shutdown_tx: watch::Sender<bool>,
}

impl ActionBridge {
    /// Spawn a new action process on a PTY.
    pub fn spawn(config: ActionBridgeConfig) -> AppResult<Self> {
        use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

        let pty_system = NativePtySystem::default();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: config.pty_rows,
                cols: config.pty_cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Bridge(format!("Failed to open PTY: {}", e)))?;

        // Build shell command: sh -c "command"
        let mut cmd = CommandBuilder::new("sh");
        cmd.arg("-c");
        cmd.arg(&config.command);
        cmd.cwd(&config.working_dir);

        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }

        let mut child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Bridge(format!("Failed to spawn action: {}", e)))?;

        // Drop slave — we only need the master side
        drop(pty_pair.slave);

        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Bridge(format!("Failed to clone PTY reader: {}", e)))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| AppError::Bridge(format!("Failed to take PTY writer: {}", e)))?;

        let (output_tx, output_rx) = mpsc::channel::<ActionBridgeOutput>(256);
        let (input_tx, mut input_rx) = mpsc::channel::<String>(32);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let status = Arc::new(RwLock::new(ActionStatus::Starting));

        // Reader thread — reads PTY output and sends lines
        let reader_status = status.clone();
        let reader_shutdown = shutdown_rx.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; PTY_BUFFER_SIZE];
            let mut line_buf = String::new();

            loop {
                if *reader_shutdown.borrow() {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        line_buf.push_str(&chunk);

                        // Emit complete lines
                        while let Some(newline_pos) = line_buf.find('\n') {
                            let line = line_buf[..newline_pos].to_string();
                            line_buf = line_buf[newline_pos + 1..].to_string();

                            let output = ActionOutput {
                                line: line.clone(),
                                is_error: false, // PTY merges stdout/stderr
                            };
                            if output_tx.blocking_send(ActionBridgeOutput::Output(output)).is_err() {
                                return;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            // Flush remaining partial line
            if !line_buf.is_empty() {
                let output = ActionOutput {
                    line: line_buf,
                    is_error: false,
                };
                let _ = output_tx.blocking_send(ActionBridgeOutput::Output(output));
            }

            // Mark status before sending exit
            let rt = tokio::runtime::Handle::try_current();
            if let Ok(handle) = rt {
                let status = reader_status.clone();
                handle.block_on(async {
                    let mut s = status.write().await;
                    if *s != ActionStatus::Stopped {
                        *s = ActionStatus::Completed;
                    }
                });
            }
        });

        // Writer thread — forwards input to PTY
        let mut writer = writer;
        std::thread::spawn(move || {
            while let Some(input) = input_rx.blocking_recv() {
                use std::io::Write;
                if writer.write_all(input.as_bytes()).is_err() {
                    break;
                }
                if writer.flush().is_err() {
                    break;
                }
            }
        });

        // Monitor task — watches for process exit
        let monitor_status = status.clone();
        let monitor_output_tx = output_tx;
        let monitor_shutdown = shutdown_rx;
        tokio::spawn(async move {
            loop {
                if *monitor_shutdown.borrow() {
                    break;
                }

                // Check if child has exited
                match child.try_wait() {
                    Ok(Some(exit_status)) => {
                        let code = exit_status.exit_code() as i32;
                        let exit_code = if code == 0 { Some(0) } else { Some(code) };

                        {
                            let mut s = monitor_status.write().await;
                            if *s != ActionStatus::Stopped {
                                *s = if code == 0 {
                                    ActionStatus::Completed
                                } else {
                                    ActionStatus::Failed
                                };
                            }
                        }

                        let _ = monitor_output_tx
                            .send(ActionBridgeOutput::Exited { exit_code })
                            .await;
                        break;
                    }
                    Ok(None) => {
                        // Still running
                        let mut s = monitor_status.write().await;
                        if *s == ActionStatus::Starting {
                            *s = ActionStatus::Running;
                        }
                        drop(s);
                    }
                    Err(_) => {
                        let mut s = monitor_status.write().await;
                        *s = ActionStatus::Failed;
                        drop(s);
                        let _ = monitor_output_tx
                            .send(ActionBridgeOutput::Exited { exit_code: None })
                            .await;
                        break;
                    }
                }

                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }

            // Keep master alive until monitor exits to prevent premature PTY close
            drop(pty_pair.master);
        });

        // Set initial status
        {
            let status = status.clone();
            tokio::spawn(async move {
                let mut s = status.write().await;
                if *s == ActionStatus::Starting {
                    *s = ActionStatus::Running;
                }
            });
        }

        Ok(Self {
            input_tx,
            output_rx: Mutex::new(output_rx),
            status,
            shutdown_tx,
        })
    }

    /// Receive the next output from the action.
    pub async fn receive(&self) -> AppResult<Option<ActionBridgeOutput>> {
        let mut rx = self.output_rx.lock().await;
        Ok(rx.recv().await)
    }

    /// Get current status.
    pub async fn status(&self) -> ActionStatus {
        self.status.read().await.clone()
    }

    /// Stop the action process.
    pub async fn stop(&self) -> AppResult<()> {
        {
            let mut s = self.status.write().await;
            *s = ActionStatus::Stopped;
        }
        let _ = self.shutdown_tx.send(true);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn spawn_simple_command() {
        let config = ActionBridgeConfig {
            command: "echo hello".to_string(),
            working_dir: "/tmp".to_string(),
            ..Default::default()
        };
        let bridge = ActionBridge::spawn(config).unwrap();

        // Collect output
        let mut lines = Vec::new();
        while let Ok(Some(output)) = bridge.receive().await {
            match output {
                ActionBridgeOutput::Output(o) => lines.push(o.line),
                ActionBridgeOutput::Exited { .. } => break,
            }
        }

        assert!(lines.iter().any(|l| l.contains("hello")));
    }

    #[tokio::test]
    async fn exit_code_captured() {
        let config = ActionBridgeConfig {
            command: "exit 42".to_string(),
            working_dir: "/tmp".to_string(),
            ..Default::default()
        };
        let bridge = ActionBridge::spawn(config).unwrap();

        let mut exit_code = None;
        while let Ok(Some(output)) = bridge.receive().await {
            if let ActionBridgeOutput::Exited { exit_code: code } = output {
                exit_code = code;
                break;
            }
        }

        assert_eq!(exit_code, Some(42));
    }

    #[tokio::test]
    async fn stop_sets_status() {
        let config = ActionBridgeConfig {
            command: "sleep 60".to_string(),
            working_dir: "/tmp".to_string(),
            ..Default::default()
        };
        let bridge = ActionBridge::spawn(config).unwrap();

        // Wait briefly for process to start
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        bridge.stop().await.unwrap();
        assert_eq!(bridge.status().await, ActionStatus::Stopped);
    }
}
```

**Step 2: Register module in `actions/mod.rs`**

Add at the top after `pub mod scanner;`:
```rust
pub mod bridge;
```

**Step 3: Run tests**

Run: `cargo test -p chief-wiggum -- actions::bridge`
Expected: 3 new tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/actions/bridge.rs src-tauri/src/actions/mod.rs
git commit -m "feat: ActionBridge — PTY process runner for actions (CHI-140)"
```

---

## Task 5: Action Bridge Map & Event Loop (CHI-140)

**Files:**
- Create: `src-tauri/src/actions/manager.rs`
- Create: `src-tauri/src/actions/event_loop.rs`
- Modify: `src-tauri/src/actions/mod.rs`

**Step 1: Create `actions/manager.rs`**

```rust
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
        // Stop existing if running
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

        let bridge = ActionBridge::spawn(config)?;
        let bridge = Arc::new(bridge);

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
        let bridges = self.bridges.read().await;
        let mut infos = Vec::new();
        for (id, bridge) in bridges.iter() {
            infos.push(RunningActionInfo {
                action_id: id.clone(),
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

    #[tokio::test]
    async fn spawn_and_track() {
        let map = ActionBridgeMap::new();
        let config = ActionBridgeConfig {
            command: "echo test".to_string(),
            working_dir: "/tmp".to_string(),
            ..Default::default()
        };
        map.spawn_action("test:1", config).await.unwrap();
        assert!(map.has("test:1").await);
        assert_eq!(map.active_count().await, 1);
    }

    #[tokio::test]
    async fn stop_removes_from_map() {
        let map = ActionBridgeMap::new();
        let config = ActionBridgeConfig {
            command: "sleep 60".to_string(),
            working_dir: "/tmp".to_string(),
            ..Default::default()
        };
        map.spawn_action("test:1", config).await.unwrap();
        map.stop_action("test:1").await.unwrap();
        assert!(!map.has("test:1").await);
    }

    #[tokio::test]
    async fn shutdown_all_clears() {
        let map = ActionBridgeMap::new();
        for i in 0..3 {
            let config = ActionBridgeConfig {
                command: "sleep 60".to_string(),
                working_dir: "/tmp".to_string(),
                ..Default::default()
            };
            map.spawn_action(&format!("test:{}", i), config).await.unwrap();
        }
        assert_eq!(map.active_count().await, 3);
        map.shutdown_all().await.unwrap();
        assert_eq!(map.active_count().await, 0);
    }
}
```

**Step 2: Create `actions/event_loop.rs`**

```rust
//! Tokio task that reads ActionBridgeOutput and emits Tauri events.
//! Per CHI-140: one task per action bridge.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::bridge::{ActionBridge, ActionBridgeOutput};
use super::manager::ActionBridgeMap;

/// Payload for `action:output` events.
#[derive(Debug, Clone, Serialize)]
pub struct ActionOutputPayload {
    pub action_id: String,
    pub line: String,
    pub is_error: bool,
}

/// Payload for `action:completed` and `action:failed` events.
#[derive(Debug, Clone, Serialize)]
pub struct ActionExitPayload {
    pub action_id: String,
    pub exit_code: Option<i32>,
}

/// Spawn a tokio task to emit Tauri events from an action bridge.
pub fn spawn_action_event_loop(
    app: AppHandle,
    action_id: String,
    bridge: Arc<ActionBridge>,
    action_map: ActionBridgeMap,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match bridge.receive().await {
                Ok(Some(ActionBridgeOutput::Output(output))) => {
                    let payload = ActionOutputPayload {
                        action_id: action_id.clone(),
                        line: output.line,
                        is_error: output.is_error,
                    };
                    if let Err(e) = app.emit("action:output", &payload) {
                        tracing::warn!(
                            action_id = %action_id,
                            error = %e,
                            "Failed to emit action:output"
                        );
                    }
                }
                Ok(Some(ActionBridgeOutput::Exited { exit_code })) => {
                    let payload = ActionExitPayload {
                        action_id: action_id.clone(),
                        exit_code,
                    };
                    let event_name = match exit_code {
                        Some(0) | None => "action:completed",
                        _ => "action:failed",
                    };
                    if let Err(e) = app.emit(event_name, &payload) {
                        tracing::warn!(
                            action_id = %action_id,
                            error = %e,
                            "Failed to emit {}", event_name
                        );
                    }
                    // Remove from map on exit
                    let _ = action_map.stop_action(&action_id).await;
                    break;
                }
                Ok(None) => {
                    // Channel closed
                    let _ = action_map.stop_action(&action_id).await;
                    break;
                }
                Err(e) => {
                    tracing::error!(
                        action_id = %action_id,
                        error = %e,
                        "Error reading action output"
                    );
                    let _ = action_map.stop_action(&action_id).await;
                    break;
                }
            }
        }

        tracing::debug!(action_id = %action_id, "Action event loop exited");
    })
}
```

**Step 3: Register modules in `actions/mod.rs`**

Add after existing `pub mod` lines:
```rust
pub mod manager;
pub mod event_loop;
```

**Step 4: Run tests**

Run: `cargo test -p chief-wiggum -- actions`
Expected: All action tests pass (~23 tests total)

**Step 5: Commit**

```bash
git add src-tauri/src/actions/manager.rs src-tauri/src/actions/event_loop.rs src-tauri/src/actions/mod.rs
git commit -m "feat: ActionBridgeMap + event loop for concurrent actions (CHI-140)"
```

---

## Task 6: Action IPC Commands — Start/Stop/Restart/List (CHI-140)

**Files:**
- Modify: `src-tauri/src/commands/actions.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add start/stop/restart/list commands to `commands/actions.rs`**

Append to existing file:

```rust
use crate::actions::bridge::ActionBridgeConfig;
use crate::actions::event_loop;
use crate::actions::manager::{ActionBridgeMap, RunningActionInfo};

/// Start an action process.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
    command: String,
    working_dir: String,
) -> Result<(), AppError> {
    if command.trim().is_empty() {
        return Err(AppError::Validation("Action command cannot be empty".to_string()));
    }

    let config = ActionBridgeConfig {
        command,
        working_dir,
        ..Default::default()
    };

    let bridge = action_map.spawn_action(&action_id, config).await?;

    event_loop::spawn_action_event_loop(
        app,
        action_id,
        bridge,
        action_map.inner().clone(),
    );

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
pub async fn restart_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    action_id: String,
    command: String,
    working_dir: String,
) -> Result<(), AppError> {
    // Stop first
    let _ = action_map.stop_action(&action_id).await;

    // Small delay to let PTY clean up
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Start fresh
    let config = ActionBridgeConfig {
        command,
        working_dir,
        ..Default::default()
    };

    let bridge = action_map.spawn_action(&action_id, config).await?;

    event_loop::spawn_action_event_loop(
        app,
        action_id,
        bridge,
        action_map.inner().clone(),
    );

    Ok(())
}

/// List all running actions.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_running_actions(
    action_map: tauri::State<'_, ActionBridgeMap>,
) -> Result<Vec<RunningActionInfo>, AppError> {
    Ok(action_map.list_running().await)
}
```

**Step 2: Register commands and state in `main.rs`**

Add managed state after `file_watcher_manager`:
```rust
let action_map = chief_wiggum_lib::actions::manager::ActionBridgeMap::new();
```

Add `.manage(action_map)` after `.manage(file_watcher_manager)`.

Add to `invoke_handler`:
```rust
chief_wiggum_lib::commands::actions::start_action,
chief_wiggum_lib::commands::actions::stop_action,
chief_wiggum_lib::commands::actions::restart_action,
chief_wiggum_lib::commands::actions::list_running_actions,
```

Also add `ActionBridgeMap` shutdown to the close handler:
```rust
let action_map = app
    .state::<chief_wiggum_lib::actions::manager::ActionBridgeMap>()
    .inner()
    .clone();

// In on_window_event closure:
if let Err(e) = action_map.shutdown_all().await {
    tracing::warn!("Error during action shutdown: {}", e);
}
```

**Step 3: Run full checks**

Run: `cargo test -p chief-wiggum && cargo clippy -p chief-wiggum -- -D warnings`
Expected: All tests pass, no warnings

**Step 4: Commit**

```bash
git add src-tauri/src/commands/actions.rs src-tauri/src/main.rs
git commit -m "feat: start/stop/restart/list action IPC commands (CHI-140)"
```

---

## Task 7: Action Store & Frontend Types (CHI-142)

**Files:**
- Create: `src/stores/actionStore.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add TypeScript types to `types.ts`**

Add to `src/lib/types.ts`:

```typescript
// ── Project Actions (CHI-138) ──────────────────────────────

export type ActionSource = 'package_json' | 'makefile' | 'cargo_toml' | 'docker_compose' | 'claude_actions';
export type ActionCategory = 'dev' | 'build' | 'test' | 'lint' | 'deploy' | 'custom';
export type ActionStatus = 'starting' | 'running' | 'completed' | 'failed' | 'stopped' | 'idle';

export interface ActionDefinition {
  id: string;
  name: string;
  command: string;
  working_dir: string;
  source: ActionSource;
  category: ActionCategory;
  description: string | null;
  is_long_running: boolean;
}

export interface ActionOutputLine {
  line: string;
  is_error: boolean;
  timestamp: number;
}

export interface RunningActionInfo {
  action_id: string;
  status: ActionStatus;
}
```

**Step 2: Create `actionStore.ts`**

```typescript
// src/stores/actionStore.ts
// Action state management for project actions (CHI-142).
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ActionDefinition,
  ActionOutputLine,
  ActionStatus,
  RunningActionInfo,
} from '@/lib/types';

/** Maximum output lines kept per action. */
const MAX_OUTPUT_LINES = 5000;

interface ActionState {
  /** Discovered actions for the active project. */
  actions: ActionDefinition[];
  /** Per-action status. */
  statuses: Record<string, ActionStatus>;
  /** Per-action output buffer. */
  outputs: Record<string, ActionOutputLine[]>;
  /** Currently selected action ID (for output panel). */
  selectedActionId: string | null;
  /** Whether discovery is in progress. */
  isDiscovering: boolean;
}

const [state, setState] = createStore<ActionState>({
  actions: [],
  statuses: {},
  outputs: {},
  selectedActionId: null,
  isDiscovering: false,
});

let eventListeners: UnlistenFn[] = [];

/** Discover actions for a project path. */
export async function discoverActions(projectPath: string): Promise<void> {
  setState('isDiscovering', true);
  try {
    const actions = await invoke<ActionDefinition[]>('discover_actions', {
      project_path: projectPath,
    });
    setState('actions', actions);
  } catch (err) {
    console.error('[actionStore] Failed to discover actions:', err);
    setState('actions', []);
  } finally {
    setState('isDiscovering', false);
  }
}

/** Start an action. */
export async function startAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);
  setState('selectedActionId', action.id);

  try {
    await invoke('start_action', {
      action_id: action.id,
      command: action.command,
      working_dir: action.working_dir,
    });
    setState('statuses', action.id, 'running');
  } catch (err) {
    console.error('[actionStore] Failed to start action:', err);
    setState('statuses', action.id, 'failed');
  }
}

/** Stop a running action. */
export async function stopAction(actionId: string): Promise<void> {
  try {
    await invoke('stop_action', { action_id: actionId });
    setState('statuses', actionId, 'stopped');
  } catch (err) {
    console.error('[actionStore] Failed to stop action:', err);
  }
}

/** Restart an action. */
export async function restartAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);

  try {
    await invoke('restart_action', {
      action_id: action.id,
      command: action.command,
      working_dir: action.working_dir,
    });
    setState('statuses', action.id, 'running');
  } catch (err) {
    console.error('[actionStore] Failed to restart action:', err);
    setState('statuses', action.id, 'failed');
  }
}

/** Get status for an action. */
export function getActionStatus(actionId: string): ActionStatus {
  return state.statuses[actionId] ?? 'idle';
}

/** Get output lines for an action. */
export function getActionOutput(actionId: string): ActionOutputLine[] {
  return state.outputs[actionId] ?? [];
}

/** Select an action to view output. */
export function selectAction(actionId: string | null): void {
  setState('selectedActionId', actionId);
}

/** Clear output for an action. */
export function clearActionOutput(actionId: string): void {
  setState('outputs', actionId, []);
}

/** Set up Tauri event listeners for action events. */
export async function setupActionListeners(): Promise<void> {
  await cleanupActionListeners();

  eventListeners.push(
    await listen<{ action_id: string; line: string; is_error: boolean }>(
      'action:output',
      (event) => {
        const { action_id, line, is_error } = event.payload;
        const entry: ActionOutputLine = {
          line,
          is_error,
          timestamp: Date.now(),
        };
        setState('outputs', action_id, (prev) => {
          const lines = prev ?? [];
          const updated = [...lines, entry];
          // Trim to max lines
          return updated.length > MAX_OUTPUT_LINES
            ? updated.slice(updated.length - MAX_OUTPUT_LINES)
            : updated;
        });
        setState('statuses', action_id, 'running');
      },
    ),
  );

  eventListeners.push(
    await listen<{ action_id: string; exit_code: number | null }>(
      'action:completed',
      (event) => {
        setState('statuses', event.payload.action_id, 'completed');
      },
    ),
  );

  eventListeners.push(
    await listen<{ action_id: string; exit_code: number | null }>(
      'action:failed',
      (event) => {
        setState('statuses', event.payload.action_id, 'failed');
      },
    ),
  );
}

/** Clean up event listeners. */
export async function cleanupActionListeners(): Promise<void> {
  for (const unlisten of eventListeners) unlisten();
  eventListeners = [];
}

/** Sync running action statuses from backend (for reconnect). */
export async function syncRunningActions(): Promise<void> {
  try {
    const running = await invoke<RunningActionInfo[]>('list_running_actions');
    for (const info of running) {
      setState('statuses', info.action_id, info.status as ActionStatus);
    }
  } catch {
    // Backend may not support this yet
  }
}

export { state as actionState };
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/stores/actionStore.ts src/lib/types.ts
git commit -m "feat: actionStore — frontend state management for actions (CHI-142)"
```

---

## Task 8: Actions Sidebar Panel (CHI-142)

**Files:**
- Create: `src/components/actions/ActionsPanel.tsx`
- Create: `src/components/actions/ActionRow.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Create `ActionRow.tsx`**

```tsx
// src/components/actions/ActionRow.tsx
// Individual action row with play/stop controls per CHI-142.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Play, Square, RotateCw } from 'lucide-solid';
import type { ActionDefinition, ActionStatus } from '@/lib/types';
import {
  startAction,
  stopAction,
  restartAction,
  getActionStatus,
  selectAction,
} from '@/stores/actionStore';

interface ActionRowProps {
  action: ActionDefinition;
}

/** Category color mapping. */
function categoryColor(category: string): string {
  switch (category) {
    case 'dev':
      return 'var(--color-success)';
    case 'build':
      return 'var(--color-accent)';
    case 'test':
      return 'var(--color-info)';
    case 'lint':
      return 'var(--color-warning)';
    case 'deploy':
      return 'var(--color-error)';
    default:
      return 'var(--color-text-tertiary)';
  }
}

/** Status indicator dot. */
function StatusDot(props: { status: ActionStatus }) {
  const color = () => {
    switch (props.status) {
      case 'running':
      case 'starting':
        return 'var(--color-success)';
      case 'completed':
        return 'var(--color-info)';
      case 'failed':
        return 'var(--color-error)';
      case 'stopped':
        return 'var(--color-warning)';
      default:
        return 'transparent';
    }
  };

  return (
    <Show when={props.status !== 'idle'}>
      <div
        class="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: color(),
          animation: props.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      />
    </Show>
  );
}

const ActionRow: Component<ActionRowProps> = (props) => {
  const status = () => getActionStatus(props.action.id);
  const isRunning = () => status() === 'running' || status() === 'starting';

  function handlePlay(e: MouseEvent) {
    e.stopPropagation();
    void startAction(props.action);
  }

  function handleStop(e: MouseEvent) {
    e.stopPropagation();
    void stopAction(props.action.id);
  }

  function handleRestart(e: MouseEvent) {
    e.stopPropagation();
    void restartAction(props.action);
  }

  return (
    <div
      class="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      onClick={() => selectAction(props.action.id)}
    >
      {/* Category color dot */}
      <div
        class="w-1 h-4 rounded-full shrink-0"
        style={{ background: categoryColor(props.action.category) }}
      />

      {/* Name + description */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-mono font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
            {props.action.name}
          </span>
          <StatusDot status={status()} />
        </div>
        <Show when={props.action.description}>
          <p
            class="text-[10px] truncate mt-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {props.action.description}
          </p>
        </Show>
      </div>

      {/* Controls — visible on hover or when running */}
      <div
        class="flex items-center gap-0.5 shrink-0"
        classList={{ 'opacity-0 group-hover:opacity-100': !isRunning() }}
        style={{ 'transition-duration': 'var(--duration-fast)' }}
      >
        <Show
          when={isRunning()}
          fallback={
            <button
              class="p-1 rounded text-text-tertiary hover:text-success transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={handlePlay}
              aria-label={`Run ${props.action.name}`}
              title="Run"
            >
              <Play size={12} />
            </button>
          }
        >
          <button
            class="p-1 rounded text-text-tertiary hover:text-error transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleStop}
            aria-label={`Stop ${props.action.name}`}
            title="Stop"
          >
            <Square size={12} />
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-accent transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleRestart}
            aria-label={`Restart ${props.action.name}`}
            title="Restart"
          >
            <RotateCw size={12} />
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ActionRow;
```

**Step 2: Create `ActionsPanel.tsx`**

```tsx
// src/components/actions/ActionsPanel.tsx
// Actions panel for sidebar per CHI-142. Groups actions by source.

import type { Component } from 'solid-js';
import { For, Show, createSignal, createMemo } from 'solid-js';
import { ChevronDown, ChevronRight, Search } from 'lucide-solid';
import { actionState } from '@/stores/actionStore';
import type { ActionDefinition, ActionSource } from '@/lib/types';
import ActionRow from './ActionRow';

/** Source display order. */
const SOURCE_ORDER: ActionSource[] = [
  'package_json',
  'cargo_toml',
  'makefile',
  'docker_compose',
  'claude_actions',
];

/** Source display labels. */
function sourceLabel(source: ActionSource): string {
  switch (source) {
    case 'package_json':
      return 'npm scripts';
    case 'makefile':
      return 'make targets';
    case 'cargo_toml':
      return 'cargo';
    case 'docker_compose':
      return 'docker compose';
    case 'claude_actions':
      return 'custom actions';
  }
}

const ActionsPanel: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<ActionSource>>(new Set());

  /** Group actions by source, filtered by search. */
  const groupedActions = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const groups = new Map<ActionSource, ActionDefinition[]>();

    for (const source of SOURCE_ORDER) {
      const matching = actionState.actions.filter(
        (a) =>
          a.source === source &&
          (query === '' ||
            a.name.toLowerCase().includes(query) ||
            (a.description ?? '').toLowerCase().includes(query)),
      );
      if (matching.length > 0) {
        groups.set(source, matching);
      }
    }

    return groups;
  });

  function toggleGroup(source: ActionSource) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  }

  return (
    <div class="flex flex-col h-full">
      {/* Search */}
      <div class="px-2 py-2" style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-md"
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <Search size={11} style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="Filter actions..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="flex-1 bg-transparent text-xs outline-none"
            style={{
              color: 'var(--color-text-primary)',
              'font-family': 'var(--font-mono)',
            }}
          />
        </div>
      </div>

      {/* Action groups */}
      <div class="flex-1 overflow-y-auto px-1 py-1">
        <Show
          when={actionState.actions.length > 0}
          fallback={
            <div class="px-2 py-6 text-center">
              <Show
                when={!actionState.isDiscovering}
                fallback={
                  <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Scanning project...
                  </p>
                }
              >
                <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  No actions found
                </p>
                <p class="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)', opacity: '0.6' }}>
                  Add scripts to package.json or .claude/actions.json
                </p>
              </Show>
            </div>
          }
        >
          <For each={[...groupedActions().entries()]}>
            {([source, actions]) => (
              <div class="mb-1">
                {/* Group header */}
                <button
                  class="flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={() => toggleGroup(source)}
                >
                  <Show
                    when={!collapsedGroups().has(source)}
                    fallback={
                      <ChevronRight size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                    }
                  >
                    <ChevronDown size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                  </Show>
                  <span
                    class="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {sourceLabel(source)}
                  </span>
                  <span
                    class="text-[9px] font-mono"
                    style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
                  >
                    ({actions.length})
                  </span>
                </button>

                {/* Action rows */}
                <Show when={!collapsedGroups().has(source)}>
                  <For each={actions}>{(action) => <ActionRow action={action} />}</For>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default ActionsPanel;
```

**Step 3: Add Actions section to Sidebar**

In `Sidebar.tsx`, add an Actions section between the Files section and Sessions header. Follow the same pattern as the Files section — a collapsible panel when project is active.

Import at top of `Sidebar.tsx`:
```typescript
import { Zap } from 'lucide-solid';
import { actionState, discoverActions } from '@/stores/actionStore';
```

Add state:
```typescript
const [actionsOpen, setActionsOpen] = createSignal(false);
```

Add after the Files `</Show>` closing (around line 312) and before the Sessions header:
```tsx
{/* Actions section — only when project is active */}
<Show when={projectState.activeProjectId}>
  <div style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
    <Show
      when={!isCollapsed()}
      fallback={
        <div class="flex flex-col items-center py-2 gap-1">
          <button
            class="flex items-center justify-center w-8 h-8 rounded-md text-text-tertiary hover:text-accent hover:bg-bg-elevated/50 transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => setActionsOpen((p) => !p)}
            aria-label="Toggle actions"
            title="Actions"
          >
            <Zap size={16} />
          </button>
        </div>
      }
    >
      <button
        class="flex items-center justify-between w-full px-3 py-2 text-left"
        onClick={() => {
          const open = !actionsOpen();
          setActionsOpen(open);
          if (open && actionState.actions.length === 0) {
            const project = getActiveProject();
            if (project?.path) {
              void discoverActions(project.path);
            }
          }
        }}
      >
        <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
          Actions
        </span>
        <span
          class="text-[9px] transition-transform"
          style={{
            color: 'var(--color-text-tertiary)',
            transform: actionsOpen() ? 'rotate(90deg)' : 'rotate(0deg)',
            'transition-duration': 'var(--duration-fast)',
          }}
        >
          ›
        </span>
      </button>

      <Show when={actionsOpen()}>
        <div
          class="h-[200px] min-h-0 overflow-hidden"
          style={{ 'transition-duration': 'var(--duration-normal)' }}
        >
          <ActionsPanel />
        </div>
      </Show>
    </Show>
  </div>
</Show>
```

Import `ActionsPanel`:
```typescript
import ActionsPanel from '@/components/actions/ActionsPanel';
```

**Step 4: Run checks**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/actions/ActionsPanel.tsx src/components/actions/ActionRow.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: ActionsPanel in sidebar with grouped action list (CHI-142)"
```

---

## Task 9: Action Output Panel in DetailsPanel (CHI-143)

**Files:**
- Create: `src/components/actions/ActionOutputPanel.tsx`
- Modify: `src/components/layout/DetailsPanel.tsx`

**Step 1: Create `ActionOutputPanel.tsx`**

```tsx
// src/components/actions/ActionOutputPanel.tsx
// Streaming output display for a selected action (CHI-143).

import type { Component } from 'solid-js';
import { For, Show, createEffect, onMount } from 'solid-js';
import { Copy, Trash2, ArrowDown } from 'lucide-solid';
import { actionState, getActionOutput, getActionStatus, clearActionOutput } from '@/stores/actionStore';

/** Strip common ANSI escape codes for clean display. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

const ActionOutputPanel: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  let shouldAutoScroll = true;

  const actionId = () => actionState.selectedActionId;
  const output = () => (actionId() ? getActionOutput(actionId()!) : []);
  const status = () => (actionId() ? getActionStatus(actionId()!) : 'idle');

  // Auto-scroll to bottom on new output
  createEffect(() => {
    void output().length; // Track
    if (shouldAutoScroll && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  function handleCopy() {
    const text = output()
      .map((l) => stripAnsi(l.line))
      .join('\n');
    void navigator.clipboard.writeText(text);
  }

  function handleClear() {
    if (actionId()) clearActionOutput(actionId()!);
  }

  function scrollToBottom() {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
      shouldAutoScroll = true;
    }
  }

  return (
    <div class="flex flex-col h-full">
      {/* Header with controls */}
      <div
        class="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <div class="flex items-center gap-2">
          <span
            class="text-xs font-mono font-medium truncate max-w-[140px]"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {actionId() ?? 'No action'}
          </span>
          <Show when={status() !== 'idle'}>
            <span
              class="text-[9px] font-mono px-1 py-0.5 rounded"
              style={{
                background: status() === 'running' ? 'rgba(63, 185, 80, 0.15)' : 'var(--color-bg-elevated)',
                color:
                  status() === 'running'
                    ? 'var(--color-success)'
                    : status() === 'failed'
                      ? 'var(--color-error)'
                      : 'var(--color-text-tertiary)',
              }}
            >
              {status()}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <ArrowDown size={11} />
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleCopy}
            aria-label="Copy output"
            title="Copy"
          >
            <Copy size={11} />
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-error transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleClear}
            aria-label="Clear output"
            title="Clear"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto overflow-x-auto"
        style={{
          background: 'var(--color-bg-inset)',
          'font-family': 'var(--font-mono)',
          'font-size': '11px',
          'line-height': '1.5',
        }}
        onScroll={handleScroll}
      >
        <Show
          when={output().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Run an action to see output
              </p>
            </div>
          }
        >
          <div class="p-2">
            <For each={output()}>
              {(line) => (
                <div
                  class="whitespace-pre-wrap break-all"
                  style={{
                    color: line.is_error ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  }}
                >
                  {stripAnsi(line.line)}
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionOutputPanel;
```

**Step 2: Add to DetailsPanel**

In `DetailsPanel.tsx`, add the action output section above existing sections.

Add imports:
```typescript
import { actionState } from '@/stores/actionStore';
import ActionOutputPanel from '@/components/actions/ActionOutputPanel';
```

Add before the `<Show when={fileState.selectedPath ...}>` block:
```tsx
<Show when={actionState.selectedActionId}>
  <CollapsibleSection title="Action Output">
    <div class="h-[300px] -mx-3 -mb-3" style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
      <ActionOutputPanel />
    </div>
  </CollapsibleSection>
</Show>
```

**Step 3: Run checks**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/actions/ActionOutputPanel.tsx src/components/layout/DetailsPanel.tsx
git commit -m "feat: ActionOutputPanel in DetailsPanel with streaming output (CHI-143)"
```

---

## Task 10: Wire Action Listeners in App.tsx (CHI-142)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/stores/actionStore.ts` (if needed for project change handling)

**Step 1: Setup and cleanup action listeners**

In `src/App.tsx`, add action listener setup alongside existing lifecycle code.

Add import:
```typescript
import { setupActionListeners, cleanupActionListeners, syncRunningActions, discoverActions } from '@/stores/actionStore';
import { projectState } from '@/stores/projectStore';
```

In the existing `onMount`:
```typescript
// Set up action event listeners
await setupActionListeners();
// Sync any actions that were running before reload
await syncRunningActions();
// Auto-discover actions if project is active
if (projectState.activeProjectId) {
  const project = projectState.projects.find(p => p.id === projectState.activeProjectId);
  if (project?.path) {
    void discoverActions(project.path);
  }
}
```

In `onCleanup`:
```typescript
void cleanupActionListeners();
```

**Step 2: Run checks**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire action event listeners in App lifecycle (CHI-142)"
```

---

## Task 11: /run Slash Command (CHI-141)

**Files:**
- Modify: `src-tauri/src/slash/mod.rs`
- Modify: `src/stores/slashStore.ts`

**Step 1: Add `/run` to built-in slash commands**

In `slash/mod.rs`, add to `builtin_commands()` vec:

```rust
SlashCommand {
    name: "run".to_string(),
    description: "Run a project action".to_string(),
    category: CommandCategory::Action,
    source: "built-in".to_string(),
    arguments: Some("action_name".to_string()),
    content: None,
},
```

Add `Action` variant to `CommandCategory`:
```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandCategory {
    General,
    Project,
    Session,
    Action,
}
```

**Step 2: Handle `/run` in the frontend**

In `slashStore.ts` or in `MessageInput.tsx`'s send handler, detect `/run <name>` prefix and route to `startAction()` instead of sending to CLI.

Add to message send logic (in `MessageInput.tsx` or wherever `/` commands are intercepted):

```typescript
// Check for /run command
if (text.startsWith('/run ')) {
  const actionName = text.slice(5).trim();
  const action = actionState.actions.find(
    (a) => a.name === actionName || a.id === actionName,
  );
  if (action) {
    void startAction(action);
    return; // Don't send to CLI
  }
}
```

**Step 3: Run checks**

Run: `cargo test -p chief-wiggum && npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src-tauri/src/slash/mod.rs src/stores/slashStore.ts src/components/conversation/MessageInput.tsx
git commit -m "feat: /run slash command for starting actions (CHI-141)"
```

---

## Task 12: Ask AI Button — Log-to-Agent Pipeline (CHI-141)

**Files:**
- Modify: `src/components/actions/ActionOutputPanel.tsx`
- Modify: `src/stores/conversationStore.ts`

**Step 1: Add "Ask AI" button to ActionOutputPanel**

Add a button in the output panel header controls:

```tsx
import { sendMessage, conversationState } from '@/stores/conversationStore';
import { sessionState, createNewSession } from '@/stores/sessionStore';
import { setActiveView } from '@/stores/uiStore';

// In the controls div, add before copy button:
<button
  class="p-1 rounded text-text-tertiary hover:text-accent transition-colors"
  style={{ 'transition-duration': 'var(--duration-fast)' }}
  onClick={handleAskAI}
  aria-label="Ask AI about this output"
  title="Ask AI"
>
  <MessageSquare size={11} />
</button>
```

Import `MessageSquare` from `lucide-solid`.

Add handler:
```typescript
function handleAskAI() {
  const lines = output();
  if (lines.length === 0) return;

  // Take last 100 lines (or fewer) for context
  const tail = lines.slice(-100);
  const outputText = tail.map((l) => stripAnsi(l.line)).join('\n');
  const action = actionId();

  const prompt = `The project action \`${action}\` produced the following output:\n\n\`\`\`\n${outputText}\n\`\`\`\n\nPlease analyze this output and help me understand what happened. If there are errors, suggest fixes.`;

  // Switch to conversation view and send
  setActiveView('conversation');
  const sessionId = sessionState.activeSessionId;
  if (sessionId) {
    sendMessage(prompt, sessionId);
  } else {
    void createNewSession('claude-sonnet-4-6').then((session) => {
      sendMessage(prompt, session.id);
    });
  }
}
```

**Step 2: Run checks**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/actions/ActionOutputPanel.tsx
git commit -m "feat: Ask AI button — pipe action output to conversation (CHI-141)"
```

---

## Verification

1. `cargo check -p chief-wiggum` — Rust compiles
2. `cargo test -p chief-wiggum` — All tests pass (existing + ~33 new action tests)
3. `cargo clippy -p chief-wiggum -- -D warnings` — No warnings
4. `npx tsc --noEmit` — TypeScript clean
5. `npx eslint .` — No lint errors
6. `npx vite build` — Build succeeds
7. Manual test — Action Discovery:
   - Open a project with package.json → actions appear grouped under "npm scripts"
   - Open a Rust project with Cargo.toml → standard cargo commands appear
   - Open a project with Makefile → make targets appear
8. Manual test — Action Execution:
   - Click play on "build" → output streams in DetailsPanel
   - Click stop on a long-running "dev" action → process terminates
   - Click restart → old process stops, new one starts
9. Manual test — Log-to-Agent:
   - Run a failing action → click "Ask AI" → output is sent to conversation with analysis request
   - Type `/run dev` in message input → dev action starts without sending to CLI
10. Manual test — Sidebar:
   - Actions section appears when project is active
   - Groups collapse/expand
   - Search filters actions
   - Running actions show green pulse dot
