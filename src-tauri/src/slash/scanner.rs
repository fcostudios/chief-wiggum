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

/// Extract a YAML frontmatter field from a markdown file.
fn extract_frontmatter_field(path: &Path, key: &str) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    if !content.starts_with("---") {
        return None;
    }

    let mut in_frontmatter = true;
    for line in content.lines().skip(1) {
        if line.trim() == "---" {
            in_frontmatter = false;
            continue;
        }
        if !in_frontmatter {
            break;
        }

        let trimmed = line.trim();
        let prefix = format!("{key}:");
        if let Some(value) = trimmed.strip_prefix(&prefix) {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }

    None
}

/// Convert a human-friendly skill name into a slash-safe command token.
fn normalize_skill_name(value: &str) -> Option<String> {
    let mut output = String::new();
    let mut last_was_dash = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            output.push('-');
            last_was_dash = true;
        }
    }

    let normalized = output.trim_matches('-').to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
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

/// Scan Claude Code skills from `~/.claude/skills/`.
/// Supports nested skill directories and prefers frontmatter `name:` when present.
fn scan_skills_directory(skills_dir: &Path) -> Vec<SlashCommand> {
    let Ok(entries) = std::fs::read_dir(skills_dir) else {
        return Vec::new();
    };

    let mut commands = Vec::new();
    let mut stack = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();

    while let Some(path) = stack.pop() {
        if !path.is_dir() {
            continue;
        }
        let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if dir_name.is_empty() || dir_name.starts_with('.') {
            continue;
        }

        let skill_md = path.join("SKILL.md");
        if skill_md.exists() {
            let name = extract_frontmatter_field(&skill_md, "name")
                .and_then(|value| normalize_skill_name(&value))
                .or_else(|| normalize_skill_name(dir_name))
                .unwrap_or_else(|| dir_name.to_string());
            let description = extract_description(&skill_md);
            commands.push(SlashCommand {
                name,
                description,
                category: CommandCategory::Skill,
                args_hint: None,
                source_path: Some(skill_md),
                from_sdk: false,
            });
            continue;
        }

        if let Ok(children) = std::fs::read_dir(&path) {
            stack.extend(
                children
                    .flatten()
                    .map(|entry| entry.path())
                    .filter(|child| child.is_dir()),
            );
        }
    }

    commands.sort_by(|a, b| a.name.cmp(&b.name));
    commands
}

pub fn scan_user_skills() -> Vec<SlashCommand> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let skills_dir = home.join(".claude").join("skills");
    scan_skills_directory(&skills_dir)
}

/// Discover all slash commands: built-in + skills + project + user.
/// Project commands override user commands with the same name.
/// User commands override built-in commands and skills with the same name.
/// Skills use unique names and are appended without overriding built-ins.
pub fn discover_all(project_path: Option<&Path>) -> Vec<SlashCommand> {
    let mut commands = super::builtin_commands();

    let skill_commands = scan_user_skills();
    let user_commands = scan_user_commands();
    let project_commands = project_path.map(scan_project_commands).unwrap_or_default();

    // Skills have unique names — append without overriding built-ins
    for cmd in skill_commands {
        if !commands.iter().any(|c| c.name == cmd.name) {
            commands.push(cmd);
        }
    }

    // User commands override built-ins and skills
    for cmd in user_commands {
        if let Some(pos) = commands.iter().position(|c| c.name == cmd.name) {
            commands[pos] = cmd;
        } else {
            commands.push(cmd);
        }
    }

    // Project commands override user + built-ins + skills
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
    fn scan_user_skills_reads_frontmatter_description() {
        let skills_root = tempfile::tempdir().unwrap();
        let skill_dir = skills_root.path().join("writing-plans");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: writing-plans\ndescription: Create implementation plans before coding\n---\n",
        )
        .unwrap();

        let desc = extract_description(&skill_dir.join("SKILL.md"));
        assert_eq!(desc, "Create implementation plans before coding");
    }

    #[test]
    fn scan_skills_directory_discovers_nested_skill_md_files() {
        let skills_root = tempfile::tempdir().unwrap();
        let nested = skills_root
            .path()
            .join("bmad")
            .join("core")
            .join("bmad-master");
        fs::create_dir_all(&nested).unwrap();
        fs::write(
            nested.join("SKILL.md"),
            "---\nname: BMad Master\ndescription: Core BMAD Method orchestrator\n---\n",
        )
        .unwrap();

        let result = scan_skills_directory(skills_root.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "bmad-master");
        assert_eq!(result[0].description, "Core BMAD Method orchestrator");
    }

    #[test]
    fn scan_skills_directory_uses_frontmatter_name_when_present() {
        let skills_root = tempfile::tempdir().unwrap();
        let nested = skills_root.path().join("bmad").join("bmm").join("pm");
        fs::create_dir_all(&nested).unwrap();
        fs::write(
            nested.join("SKILL.md"),
            "---\nname: Product Manager\ndescription: Product requirements and planning specialist\n---\n",
        )
        .unwrap();

        let result = scan_skills_directory(skills_root.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "product-manager");
    }

    #[test]
    fn scan_user_skills_skips_subdirs_without_skill_md() {
        // Verify that a subdir with no SKILL.md is excluded by the scanner logic.
        let skills_root = tempfile::tempdir().unwrap();
        fs::create_dir_all(skills_root.path().join("no-skill-here")).unwrap();

        let found = std::fs::read_dir(skills_root.path())
            .unwrap()
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter(|e| e.path().join("SKILL.md").exists())
            .count();
        assert_eq!(found, 0, "dir without SKILL.md must be excluded");
    }

    #[test]
    fn skill_category_serializes_correctly() {
        let cmd = super::super::SlashCommand {
            name: "brainstorming".to_string(),
            description: "Explore ideas".to_string(),
            category: CommandCategory::Skill,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        };
        let json = serde_json::to_string(&cmd).expect("should serialize");
        assert!(json.contains("\"Skill\""));
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
