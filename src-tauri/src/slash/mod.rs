//! Slash command discovery: built-in, project, and user commands.
//! Per CHI-106: foundation for all slash command tasks.

pub mod scanner;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Category indicating where a slash command was discovered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CommandCategory {
    Builtin,
    Project,
    User,
}

/// A discovered slash command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommand {
    /// Command name (without leading `/`).
    pub name: String,
    /// Short description shown in autocomplete.
    pub description: String,
    /// Where this command came from.
    pub category: CommandCategory,
    /// Hint for expected arguments, e.g. `"<model-name>"`.
    pub args_hint: Option<String>,
    /// Filesystem path for file-scanned commands (None for built-in).
    pub source_path: Option<PathBuf>,
    /// Whether this command was discovered from the Agent SDK (Phase B).
    pub from_sdk: bool,
}

/// Built-in slash commands (always available).
pub fn builtin_commands() -> Vec<SlashCommand> {
    vec![
        SlashCommand {
            name: "clear".to_string(),
            description: "Clear conversation history".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "compact".to_string(),
            description: "Compact context window".to_string(),
            category: CommandCategory::Builtin,
            args_hint: Some("[instructions]".to_string()),
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "cost".to_string(),
            description: "Show session cost summary".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "doctor".to_string(),
            description: "Check CLI health".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "help".to_string(),
            description: "Show help and available commands".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "memory".to_string(),
            description: "View/edit CLAUDE.md".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "model".to_string(),
            description: "Switch model".to_string(),
            category: CommandCategory::Builtin,
            args_hint: Some("<model-name>".to_string()),
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "permissions".to_string(),
            description: "View permission settings".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "review".to_string(),
            description: "Code review mode".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "status".to_string(),
            description: "Show CLI status".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "vim".to_string(),
            description: "Toggle vim mode".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_commands_has_minimum_set() {
        let commands = builtin_commands();
        assert!(commands.len() >= 10, "Expected at least 10 built-in commands");

        let names: Vec<&str> = commands.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"clear"));
        assert!(names.contains(&"model"));
        assert!(names.contains(&"compact"));
        assert!(names.contains(&"cost"));
    }

    #[test]
    fn builtin_commands_all_have_builtin_category() {
        for cmd in builtin_commands() {
            assert_eq!(cmd.category, CommandCategory::Builtin);
            assert!(!cmd.from_sdk);
            assert!(cmd.source_path.is_none());
        }
    }

    #[test]
    fn slash_command_serializes() {
        let cmd = SlashCommand {
            name: "test".to_string(),
            description: "Test command".to_string(),
            category: CommandCategory::Project,
            args_hint: Some("<file>".to_string()),
            source_path: Some(PathBuf::from("/tmp/test.md")),
            from_sdk: false,
        };
        let json = serde_json::to_string(&cmd).expect("should serialize");
        assert!(json.contains("\"name\":\"test\""));
        assert!(json.contains("\"Project\""));
    }
}
