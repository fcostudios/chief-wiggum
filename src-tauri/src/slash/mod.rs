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
    Sdk,
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

/// Convert tools reported by Agent SDK `system:init` into slash commands (CHI-108).
///
/// Built-in SDK tools (Read/Write/Bash/etc.) are filtered out because they are
/// tool-use primitives, not user-invocable slash commands. MCP tools and custom
/// tools are included for discovery.
pub fn from_sdk_tools(tools: &[String], mcp_servers: &[String]) -> Vec<SlashCommand> {
    let builtin_tools: std::collections::HashSet<&str> = [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
        "NotebookEdit",
        "Task",
        "TodoRead",
        "TodoWrite",
    ]
    .into_iter()
    .collect();

    let mut commands = Vec::new();

    for tool in tools {
        if builtin_tools.contains(tool.as_str()) {
            continue;
        }

        if tool.starts_with("mcp__") {
            let parts: Vec<&str> = tool.splitn(3, "__").collect();
            if parts.len() == 3 {
                let server = parts[1];
                commands.push(SlashCommand {
                    name: tool.clone(),
                    description: format!("MCP tool from {} server", server),
                    category: CommandCategory::Sdk,
                    args_hint: None,
                    source_path: None,
                    from_sdk: true,
                });
                continue;
            }
        }

        commands.push(SlashCommand {
            name: tool.clone(),
            description: format!("SDK tool: {}", tool),
            category: CommandCategory::Sdk,
            args_hint: None,
            source_path: None,
            from_sdk: true,
        });
    }

    for server in mcp_servers {
        let normalized = crate::bridge::event_loop::normalize_mcp_server_name(server);
        if !commands.iter().any(|c| c.name.starts_with(&normalized)) {
            commands.push(SlashCommand {
                name: normalized,
                description: format!("MCP server: {}", server),
                category: CommandCategory::Sdk,
                args_hint: None,
                source_path: None,
                from_sdk: true,
            });
        }
    }

    commands
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_commands_has_minimum_set() {
        let commands = builtin_commands();
        assert!(
            commands.len() >= 10,
            "Expected at least 10 built-in commands"
        );

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

    #[test]
    fn from_sdk_tools_filters_builtin_tools() {
        let tools = vec![
            "Read".to_string(),
            "Write".to_string(),
            "Bash".to_string(),
            "mcp__context7__query-docs".to_string(),
            "CustomTool".to_string(),
        ];
        let mcp_servers = vec!["context7".to_string()];

        let commands = from_sdk_tools(&tools, &mcp_servers);

        assert!(!commands.iter().any(|c| c.name == "Read"));
        assert!(!commands.iter().any(|c| c.name == "Write"));
        assert!(!commands.iter().any(|c| c.name == "Bash"));
        assert!(commands
            .iter()
            .any(|c| c.name == "mcp__context7__query-docs"));
        assert!(commands.iter().any(|c| c.name == "CustomTool"));
        for cmd in &commands {
            assert_eq!(cmd.category, CommandCategory::Sdk);
            assert!(cmd.from_sdk);
        }
    }

    #[test]
    fn from_sdk_tools_handles_empty_input() {
        let commands = from_sdk_tools(&[], &[]);
        assert!(commands.is_empty());
    }

    #[test]
    fn from_sdk_tools_mcp_server_description() {
        let tools = vec!["mcp__linear__list-issues".to_string()];
        let commands = from_sdk_tools(&tools, &[]);
        assert_eq!(commands.len(), 1);
        assert!(commands[0].description.contains("linear"));
    }

    #[test]
    fn from_sdk_tools_skips_all_builtin_tools() {
        let builtin_tools = vec![
            "Read",
            "Write",
            "Edit",
            "Bash",
            "Glob",
            "Grep",
            "WebSearch",
            "WebFetch",
            "NotebookEdit",
            "Task",
            "TodoRead",
            "TodoWrite",
        ]
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();

        let commands = from_sdk_tools(&builtin_tools, &[]);
        assert!(
            commands.is_empty(),
            "All built-in tools should be filtered: {:?}",
            commands.iter().map(|c| &c.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn from_sdk_tools_deduplicates_mcp_servers() {
        let tools = vec![
            "mcp__linear__list-issues".to_string(),
            "mcp__linear__get-issue".to_string(),
        ];
        let mcp_servers = vec!["linear".to_string()];
        let commands = from_sdk_tools(&tools, &mcp_servers);
        let names: Vec<&str> = commands.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"mcp__linear__list-issues"));
        assert!(names.contains(&"mcp__linear__get-issue"));
        assert!(!names.contains(&"mcp__linear"));
    }

    #[test]
    fn sdk_category_serializes_correctly() {
        let cmd = SlashCommand {
            name: "test".to_string(),
            description: "Test".to_string(),
            category: CommandCategory::Sdk,
            args_hint: None,
            source_path: None,
            from_sdk: true,
        };
        let json = serde_json::to_string(&cmd).expect("should serialize");
        assert!(json.contains("\"Sdk\""));
        assert!(json.contains("\"from_sdk\":true"));
    }
}
