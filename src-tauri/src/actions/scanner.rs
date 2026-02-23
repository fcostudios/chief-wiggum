//! Auto-discovers runnable actions from project config files.
//!
//! Scans: package.json, Makefile, Cargo.toml, docker-compose.yml, .claude/actions.json
//! Per CHI-139: zero-config discovery.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::AppResult;

use super::{
    classify_action, is_long_running, ActionCategory, ActionDefinition, ActionSource,
    CustomActionConfig,
};

/// Config files to scan, in priority order.
const SCANNABLE_FILES: &[(&str, ActionSource)] = &[
    ("package.json", ActionSource::PackageJson),
    ("Makefile", ActionSource::Makefile),
    ("Cargo.toml", ActionSource::CargoToml),
    ("docker-compose.yml", ActionSource::DockerCompose),
    ("docker-compose.yaml", ActionSource::DockerCompose),
    (".claude/actions.json", ActionSource::ClaudeActions),
];
const CLAUDE_ACTIONS_PATH: &str = ".claude/actions.json";

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
            if name.starts_with("pre") || name.starts_with("post") {
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
                before_commands: None,
                after_commands: None,
                env_vars: None,
                args: None,
            });

            // Keep explicit use of raw command for future metadata extraction (lint avoids underscore use)
            let _ = command;
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

        if let Some(comment) = trimmed.strip_prefix('#') {
            last_comment = Some(comment.trim().to_string());
            continue;
        }

        if let Some(target) = trimmed.strip_suffix(':').or_else(|| trimmed.split(':').next()) {
            let target = target.trim();
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
                    before_commands: None,
                    after_commands: None,
                    env_vars: None,
                    args: None,
                });
                continue;
            }
        }

        if !trimmed.is_empty() {
            last_comment = None;
        }
    }

    Ok(actions)
}

/// Parse cargo aliases from Cargo.toml [alias] section.
fn parse_cargo_toml(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let mut actions = Vec::new();

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
            before_commands: None,
            after_commands: None,
            env_vars: None,
            args: None,
        });
    }

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
                    before_commands: None,
                    after_commands: None,
                    env_vars: None,
                    args: None,
                });
            }
        }
    }

    Ok(actions)
}

/// Parse services from docker-compose.yml.
fn parse_docker_compose(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let mut actions = Vec::new();
    let mut in_services = false;
    let mut indent_level = 0usize;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "services:" {
            in_services = true;
            indent_level = line.len() - line.trim_start().len() + 2;
            continue;
        }

        if in_services {
            let current_indent = line.len() - line.trim_start().len();

            if current_indent == 0 && !trimmed.is_empty() {
                break;
            }

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
                            before_commands: None,
                            after_commands: None,
                            env_vars: None,
                            args: None,
                        });
                    }
                }
            }
        }
    }

    actions.push(ActionDefinition {
        id: "docker_compose:up".to_string(),
        name: "up".to_string(),
        command: "docker compose up".to_string(),
        working_dir: working_dir.to_string(),
        source: ActionSource::DockerCompose,
        category: ActionCategory::Dev,
        description: Some("Start all services".to_string()),
        is_long_running: true,
        before_commands: None,
        after_commands: None,
        env_vars: None,
        args: None,
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
        before_commands: None,
        after_commands: None,
        env_vars: None,
        args: None,
    });

    Ok(actions)
}

/// Parse custom actions from .claude/actions.json.
fn parse_claude_actions(content: &str, working_dir: &str) -> AppResult<Vec<ActionDefinition>> {
    let file = parse_custom_actions_file_content(content)?;
    let mut actions = Vec::new();

    for custom in file.actions {
        let category = parse_custom_category(custom.category.as_deref(), &custom.name);

        actions.push(ActionDefinition {
            id: format!("claude_actions:{}", custom.name),
            name: custom.name,
            command: custom.command,
            working_dir: custom.working_dir.unwrap_or_else(|| working_dir.to_string()),
            source: ActionSource::ClaudeActions,
            category,
            description: custom.description,
            is_long_running: custom.long_running,
            before_commands: custom.before_commands,
            after_commands: custom.after_commands,
            env_vars: custom.env_vars,
            args: custom.args,
        });
    }

    Ok(actions)
}

/// Read custom actions from `.claude/actions.json` (returns empty if missing).
pub fn read_custom_actions_file(project_path: &Path) -> AppResult<Vec<CustomActionConfig>> {
    let path = project_path.join(CLAUDE_ACTIONS_PATH);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(path)?;
    let file = parse_custom_actions_file_content(&content)?;
    Ok(file.actions)
}

/// Save or update a custom action in `.claude/actions.json`, keyed by action name.
pub fn save_custom_action_file(project_path: &Path, action: CustomActionConfig) -> AppResult<()> {
    let mut actions = read_custom_actions_file(project_path)?;

    if let Some(existing) = actions.iter_mut().find(|a| a.name == action.name) {
        *existing = action;
    } else {
        actions.push(action);
    }

    write_custom_actions_file(project_path, &actions)
}

/// Delete a custom action by name from `.claude/actions.json`.
pub fn delete_custom_action_file(project_path: &Path, action_name: &str) -> AppResult<()> {
    let mut actions = read_custom_actions_file(project_path)?;
    let original_len = actions.len();
    actions.retain(|a| a.name != action_name);

    if actions.len() == original_len {
        return Ok(());
    }

    write_custom_actions_file(project_path, &actions)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CustomActionsFile {
    actions: Vec<CustomActionConfig>,
}

fn parse_custom_actions_file_content(content: &str) -> AppResult<CustomActionsFile> {
    let file: CustomActionsFile = serde_json::from_str(content)?;
    Ok(file)
}

fn write_custom_actions_file(project_path: &Path, actions: &[CustomActionConfig]) -> AppResult<()> {
    let claude_dir = project_path.join(".claude");
    std::fs::create_dir_all(&claude_dir)?;
    let path = claude_dir.join("actions.json");
    let file = CustomActionsFile {
        actions: actions.to_vec(),
    };
    let mut json = serde_json::to_string_pretty(&file)?;
    json.push('\n');
    std::fs::write(path, json)?;
    Ok(())
}

fn parse_custom_category(category: Option<&str>, action_name: &str) -> ActionCategory {
    category
        .map(|c| match c.to_lowercase().as_str() {
            "dev" => ActionCategory::Dev,
            "build" => ActionCategory::Build,
            "test" => ActionCategory::Test,
            "lint" => ActionCategory::Lint,
            "deploy" => ActionCategory::Deploy,
            _ => ActionCategory::Custom,
        })
        .unwrap_or_else(|| classify_action(action_name))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn temp_project(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        for (name, content) in files {
            let path = dir.path().join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create dirs");
            }
            fs::write(&path, content).expect("write fixture");
        }
        dir
    }

    fn test_custom_action(name: &str, command: &str) -> CustomActionConfig {
        CustomActionConfig {
            name: name.to_string(),
            command: command.to_string(),
            description: Some(format!("{} description", name)),
            category: Some("custom".to_string()),
            long_running: false,
            working_dir: None,
            before_commands: None,
            after_commands: None,
            env_vars: None,
            args: None,
        }
    }

    #[test]
    fn package_json_scripts() {
        let dir = temp_project(&[(
            "package.json",
            r#"{"scripts":{"dev":"vite","build":"vite build","test":"vitest","pretest":"echo pre"}}"#,
        )]);
        let actions = discover_actions(dir.path()).expect("discover actions");
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"dev"));
        assert!(names.contains(&"build"));
        assert!(names.contains(&"test"));
        assert!(!names.contains(&"pretest"));
    }

    #[test]
    fn package_json_command_format() {
        let dir = temp_project(&[("package.json", r#"{"scripts":{"dev":"vite"}}"#)]);
        let actions = discover_actions(dir.path()).expect("discover actions");
        let dev = actions.iter().find(|a| a.name == "dev").expect("dev action");
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
        let actions = discover_actions(dir.path()).expect("discover actions");
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"test"));
        assert!(!names.iter().any(|n| n.starts_with('.')));
    }

    #[test]
    fn makefile_captures_comments() {
        let dir = temp_project(&[(
            "Makefile",
            "# Build the project\nbuild:\n\tcargo build\n",
        )]);
        let actions = discover_actions(dir.path()).expect("discover actions");
        let build = actions
            .iter()
            .find(|a| a.name == "build")
            .expect("build action");
        assert_eq!(build.description.as_deref(), Some("Build the project"));
    }

    #[test]
    fn cargo_toml_standard_commands() {
        let dir = temp_project(&[(
            "Cargo.toml",
            "[package]\nname = \"test\"\nversion = \"0.1.0\"\n",
        )]);
        let actions = discover_actions(dir.path()).expect("discover actions");
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
            r#"{"actions":[{"name":"migrate","command":"npx prisma migrate dev","description":"Run DB migrations","category":"dev","long_running":false,"before_commands":["echo before"],"after_commands":["echo after"],"env_vars":{"NODE_ENV":"development"},"args":[{"name":"target","type":"enum","options":["dev","prod"],"default":"dev"},{"name":"tag","type":"string","required":true}]}]}"#,
        )]);
        let actions = discover_actions(dir.path()).expect("discover actions");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].name, "migrate");
        assert_eq!(actions[0].command, "npx prisma migrate dev");
        assert_eq!(actions[0].source, ActionSource::ClaudeActions);
        assert_eq!(
            actions[0].before_commands.as_ref().expect("before"),
            &vec!["echo before".to_string()]
        );
        assert_eq!(
            actions[0].after_commands.as_ref().expect("after"),
            &vec!["echo after".to_string()]
        );
        assert_eq!(
            actions[0]
                .env_vars
                .as_ref()
                .expect("env")
                .get("NODE_ENV")
                .map(String::as_str),
            Some("development")
        );
        assert_eq!(actions[0].args.as_ref().expect("args").len(), 2);
    }

    #[test]
    fn docker_compose_services() {
        let dir = temp_project(&[(
            "docker-compose.yml",
            "services:\n  db:\n    image: postgres\n  redis:\n    image: redis\n",
        )]);
        let actions = discover_actions(dir.path()).expect("discover actions");
        let names: Vec<&str> = actions.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"up db"));
        assert!(names.contains(&"up redis"));
        assert!(names.contains(&"up"));
        assert!(names.contains(&"down"));
    }

    #[test]
    fn empty_project_returns_empty() {
        let dir = temp_project(&[]);
        let actions = discover_actions(dir.path()).expect("discover actions");
        assert!(actions.is_empty());
    }

    #[test]
    fn multiple_sources_combined() {
        let dir = temp_project(&[
            ("package.json", r#"{"scripts":{"dev":"vite"}}"#),
            ("Makefile", "build:\n\tcargo build\n"),
        ]);
        let actions = discover_actions(dir.path()).expect("discover actions");
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

    #[test]
    fn read_custom_actions_file_missing_returns_empty() {
        let dir = temp_project(&[]);
        let actions = read_custom_actions_file(dir.path()).expect("read missing actions");
        assert!(actions.is_empty());
    }

    #[test]
    fn save_custom_action_creates_file() {
        let dir = temp_project(&[]);
        save_custom_action_file(dir.path(), test_custom_action("seed-db", "npm run seed"))
            .expect("save");

        let actions = read_custom_actions_file(dir.path()).expect("read");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].name, "seed-db");
        assert_eq!(actions[0].command, "npm run seed");
    }

    #[test]
    fn save_custom_action_updates_existing_by_name() {
        let dir = temp_project(&[]);
        save_custom_action_file(dir.path(), test_custom_action("seed-db", "npm run seed"))
            .expect("save initial");
        save_custom_action_file(dir.path(), test_custom_action("seed-db", "pnpm seed"))
            .expect("save update");

        let actions = read_custom_actions_file(dir.path()).expect("read");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].name, "seed-db");
        assert_eq!(actions[0].command, "pnpm seed");
    }

    #[test]
    fn delete_custom_action_removes_entry() {
        let dir = temp_project(&[]);
        save_custom_action_file(dir.path(), test_custom_action("seed-db", "npm run seed"))
            .expect("save first");
        save_custom_action_file(dir.path(), test_custom_action("reset-db", "npm run reset"))
            .expect("save second");

        delete_custom_action_file(dir.path(), "seed-db").expect("delete");

        let actions = read_custom_actions_file(dir.path()).expect("read");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].name, "reset-db");
    }

    #[test]
    fn save_custom_action_preserves_advanced_fields_roundtrip() {
        let dir = temp_project(&[]);
        let mut action = test_custom_action("deploy-web", "npm run deploy:web");
        action.before_commands = Some(vec!["npm run build".to_string()]);
        action.after_commands = Some(vec!["echo done".to_string()]);
        action.env_vars = Some(
            [("RAILS_ENV".to_string(), "production".to_string())]
                .into_iter()
                .collect(),
        );

        save_custom_action_file(dir.path(), action).expect("save");
        let actions = read_custom_actions_file(dir.path()).expect("read");
        assert_eq!(actions.len(), 1);
        let restored = &actions[0];
        assert_eq!(
            restored.before_commands.as_ref().expect("before"),
            &vec!["npm run build".to_string()]
        );
        assert_eq!(
            restored.after_commands.as_ref().expect("after"),
            &vec!["echo done".to_string()]
        );
        assert_eq!(
            restored
                .env_vars
                .as_ref()
                .expect("env")
                .get("RAILS_ENV")
                .map(String::as_str),
            Some("production")
        );
    }

    #[test]
    fn save_custom_action_preserves_args_metadata_roundtrip() {
        let dir = temp_project(&[]);
        let mut action = test_custom_action("deploy-web", "deploy {{env}} {{tag}}");
        action.args = Some(vec![
            super::super::ActionArgTemplate {
                name: "env".to_string(),
                kind: super::super::ActionArgKind::Enum,
                description: Some("Environment".to_string()),
                required: true,
                options: Some(vec!["staging".to_string(), "prod".to_string()]),
                default: Some("staging".to_string()),
            },
            super::super::ActionArgTemplate {
                name: "tag".to_string(),
                kind: super::super::ActionArgKind::String,
                description: None,
                required: false,
                options: None,
                default: None,
            },
        ]);

        save_custom_action_file(dir.path(), action).expect("save");
        let actions = read_custom_actions_file(dir.path()).expect("read");
        let restored_args = actions[0].args.as_ref().expect("args");
        assert_eq!(restored_args.len(), 2);
        assert_eq!(restored_args[0].name, "env");
        assert_eq!(restored_args[1].name, "tag");
    }
}
