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
    if lower.contains("dev")
        || lower.contains("start")
        || lower.contains("serve")
        || lower.contains("watch")
    {
        ActionCategory::Dev
    } else if lower.contains("build") || lower.contains("compile") || lower.contains("bundle") {
        ActionCategory::Build
    } else if lower.contains("test") || lower.contains("spec") || lower.contains("check") {
        ActionCategory::Test
    } else if lower.contains("lint")
        || lower.contains("fmt")
        || lower.contains("format")
        || lower.contains("clippy")
    {
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
    lower.contains("dev")
        || lower.contains("start")
        || lower.contains("serve")
        || lower.contains("watch")
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
