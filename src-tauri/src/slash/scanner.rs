//! Filesystem scanner for slash command `.md` files.
//! Scans project commands (`.claude/commands/`) and user commands (`~/.claude/commands/`).
//! Extracts command name from filename and description from first line/heading.

use std::path::Path;

use super::{CommandCategory, SlashCommand};

/// Scan a directory for `.md` command files.
/// Returns an empty Vec if the directory doesn't exist or is unreadable.
fn scan_directory(dir: &Path, category: CommandCategory) -> Vec<SlashCommand> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut commands = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("md") {
            continue;
        }

        let name = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };

        let description = extract_description(&path);

        commands.push(SlashCommand {
            name,
            description,
            category: category.clone(),
            args_hint: None,
            source_path: Some(path),
            from_sdk: false,
        });
    }

    commands.sort_by(|a, b| a.name.cmp(&b.name));
    commands
}

/// Extract a description from the first meaningful line of a `.md` file.
/// Priority: YAML frontmatter `description:`, then first `# heading`, then first non-empty line.
fn extract_description(path: &Path) -> String {
    let Ok(content) = std::fs::read_to_string(path) else {
        return "Custom command".to_string();
    };

    // Look for YAML frontmatter description
    if content.starts_with("---") {
        let mut in_frontmatter = true;
        for line in content.lines().skip(1) {
            if line.trim() == "---" {
                in_frontmatter = false;
                continue;
            }
            if in_frontmatter {
                let trimmed = line.trim();
                if let Some(desc) = trimmed.strip_prefix("description:") {
                    let desc = desc.trim().trim_matches('"').trim_matches('\'');
                    if !desc.is_empty() {
                        return desc.to_string();
                    }
                }
            }
        }
    }

    // Fall back to first heading or first non-empty line
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "---" {
            continue;
        }
        if let Some(heading) = trimmed.strip_prefix('#') {
            let heading = heading.trim_start_matches('#').trim();
            if !heading.is_empty() {
                return heading.to_string();
            }
        }
        if !trimmed.starts_with("---") {
            return truncate(trimmed, 80);
        }
    }

    "Custom command".to_string()
}

/// Truncate a string to max_len, adding "..." if truncated.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

/// Scan project commands from `<project_path>/.claude/commands/`.
pub fn scan_project_commands(project_path: &Path) -> Vec<SlashCommand> {
    let commands_dir = project_path.join(".claude").join("commands");
    scan_directory(&commands_dir, CommandCategory::Project)
}

/// Scan user commands from `~/.claude/commands/`.
pub fn scan_user_commands() -> Vec<SlashCommand> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let commands_dir = home.join(".claude").join("commands");
    scan_directory(&commands_dir, CommandCategory::User)
}

/// Discover all slash commands: built-in + project + user.
/// Project commands override user commands with the same name.
/// User commands override built-in commands with the same name.
pub fn discover_all(project_path: Option<&Path>) -> Vec<SlashCommand> {
    let mut commands = super::builtin_commands();

    let user_commands = scan_user_commands();
    let project_commands = project_path.map(scan_project_commands).unwrap_or_default();

    // User commands override built-ins
    for cmd in user_commands {
        if let Some(pos) = commands.iter().position(|c| c.name == cmd.name) {
            commands[pos] = cmd;
        } else {
            commands.push(cmd);
        }
    }

    // Project commands override user + built-ins
    for cmd in project_commands {
        if let Some(pos) = commands.iter().position(|c| c.name == cmd.name) {
            commands[pos] = cmd;
        } else {
            commands.push(cmd);
        }
    }

    commands.sort_by(|a, b| a.name.cmp(&b.name));
    commands
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn scan_nonexistent_directory_returns_empty() {
        let dir = PathBuf::from("/tmp/chiefwiggum-test-nonexistent");
        let result = scan_directory(&dir, CommandCategory::Project);
        assert!(result.is_empty());
    }

    #[test]
    fn scan_directory_finds_md_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("deploy.md"),
            "# Deploy to production\nSteps here.",
        )
        .unwrap();
        fs::write(dir.path().join("lint.md"), "Run linters on the codebase").unwrap();
        fs::write(dir.path().join("readme.txt"), "Not a command").unwrap();

        let result = scan_directory(dir.path(), CommandCategory::Project);
        assert_eq!(result.len(), 2);
        assert!(result.iter().any(|c| c.name == "deploy"));
        assert!(result.iter().any(|c| c.name == "lint"));
    }

    #[test]
    fn extract_description_from_heading() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(&path, "# Run all tests\n\nThis runs the test suite.").unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Run all tests");
    }

    #[test]
    fn extract_description_from_yaml_frontmatter() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(
            &path,
            "---\ndescription: Deploy the application\n---\n\n# Deploy\n\nDeploy steps.",
        )
        .unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Deploy the application");
    }

    #[test]
    fn extract_description_from_first_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(&path, "Run the deployment pipeline").unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Run the deployment pipeline");
    }

    #[test]
    fn extract_description_fallback_for_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(&path, "").unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Custom command");
    }

    #[test]
    fn discover_all_merges_sources() {
        let commands = discover_all(None);
        assert!(commands.len() >= 10);
        assert!(commands.iter().any(|c| c.name == "clear"));
    }

    #[test]
    fn project_commands_override_builtins() {
        let dir = tempfile::tempdir().unwrap();
        let commands_dir = dir.path().join(".claude").join("commands");
        fs::create_dir_all(&commands_dir).unwrap();
        fs::write(
            commands_dir.join("clear.md"),
            "# Custom clear\nProject-specific clear.",
        )
        .unwrap();

        let commands = discover_all(Some(dir.path()));
        let clear = commands.iter().find(|c| c.name == "clear").unwrap();
        assert_eq!(clear.category, CommandCategory::Project);
        assert_eq!(clear.description, "Custom clear");
    }

    #[test]
    fn truncate_long_description() {
        let long_text = "A".repeat(100);
        let result = truncate(&long_text, 80);
        assert_eq!(result.len(), 80);
        assert!(result.ends_with("..."));
    }

    #[test]
    fn truncate_short_description_unchanged() {
        let short = "Hello world";
        assert_eq!(truncate(short, 80), short);
    }
}
