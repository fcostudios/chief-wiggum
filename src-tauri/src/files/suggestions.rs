//! Import parsing and related-file suggestions for CHI-127 smart file suggestions.

use std::path::{Component, Path, PathBuf};

/// A suggested file with a reason and confidence score.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileSuggestion {
    pub path: String,
    pub reason: String,
    pub confidence: f32,
    pub estimated_tokens: usize,
}

/// Parse import statements from file content based on extension.
pub fn parse_imports(content: &str, extension: &str) -> Vec<String> {
    match extension {
        "ts" | "tsx" | "js" | "jsx" => parse_ts_imports(content),
        "rs" => parse_rust_imports(content),
        "py" => parse_python_imports(content),
        _ => Vec::new(),
    }
}

fn parse_ts_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();

        if let Some(from_idx) = trimmed.find(" from ") {
            let after = &trimmed[from_idx + 6..];
            let path = after
                .trim()
                .trim_matches(|c| c == '\'' || c == '"' || c == ';');
            if path.starts_with('.') || path.starts_with("@/") {
                imports.push(path.to_string());
            }
        }

        if let Some(start_idx) = trimmed.find("require(") {
            let after = &trimmed[start_idx + 8..];
            if let Some(end_idx) = after.find(')') {
                let path = after[..end_idx].trim().trim_matches(|c| c == '\'' || c == '"');
                if path.starts_with('.') {
                    imports.push(path.to_string());
                }
            }
        }
    }
    imports
}

fn parse_rust_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("mod ") && trimmed.ends_with(';') {
            let name = trimmed[4..trimmed.len() - 1].trim();
            if !name.is_empty() && !name.contains(' ') {
                imports.push(format!("{}.rs", name));
            }
        }

        if let Some(stripped) = trimmed.strip_prefix("use crate::") {
            let path_part = stripped.split(';').next().unwrap_or("");
            let segments: Vec<&str> = path_part.split("::").collect();
            if let Some(first) = segments.first() {
                if !first.is_empty() {
                    imports.push(format!("{}.rs", first));
                }
            }
        }

        if let Some(stripped) = trimmed.strip_prefix("use super::") {
            let path_part = stripped.split(';').next().unwrap_or("");
            let segments: Vec<&str> = path_part.split("::").collect();
            if let Some(first) = segments.first() {
                if !first.is_empty() {
                    imports.push(format!("../{}.rs", first));
                }
            }
        }
    }
    imports
}

fn parse_python_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("from .") {
            if let Some(space_idx) = rest.find(' ') {
                let module = &rest[..space_idx];
                if !module.is_empty() {
                    imports.push(format!("{}.py", module.replace('.', "/")));
                }
            }
        }
    }
    imports
}

/// Suggest test file paths for a given source file.
pub fn suggest_test_files(file_path: &str) -> Vec<String> {
    let path = Path::new(file_path);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    let parent = path.parent().and_then(|p| p.to_str()).unwrap_or("");

    let mut suggestions = Vec::new();
    match ext {
        "ts" | "tsx" => {
            if parent.is_empty() {
                suggestions.push(format!("{}.test.ts", stem));
                suggestions.push(format!("{}.test.tsx", stem));
                suggestions.push(format!("{}.spec.ts", stem));
            } else {
                suggestions.push(format!("{}/{}.test.ts", parent, stem));
                suggestions.push(format!("{}/{}.test.tsx", parent, stem));
                suggestions.push(format!("{}/{}.spec.ts", parent, stem));
            }
        }
        "rs" => {
            suggestions.push(format!("tests/{}.rs", stem));
        }
        "py" => {
            if parent.is_empty() {
                suggestions.push(format!("test_{}.py", stem));
            } else {
                suggestions.push(format!("{}/test_{}.py", parent, stem));
            }
            suggestions.push(format!("tests/test_{}.py", stem));
        }
        _ => {}
    }
    suggestions
}

/// Resolve an import path relative to the importing file, returning a project-relative path.
pub fn resolve_import(import_path: &str, importing_file: &str, extension: &str) -> Option<String> {
    let importing = Path::new(importing_file);
    let parent = importing.parent()?;

    if let Some(stripped) = import_path.strip_prefix("@/") {
        let resolved = format!("src/{}", stripped);
        return Some(add_extension_if_needed(&resolved, extension));
    }

    if import_path.starts_with('.') {
        let resolved = parent.join(import_path);
        let normalized = normalize_path(&resolved);
        let normalized_str = normalized.to_string_lossy().replace('\\', "/");
        return Some(add_extension_if_needed(&normalized_str, extension));
    }

    None
}

fn add_extension_if_needed(path: &str, ext: &str) -> String {
    if Path::new(path).extension().is_some() || ext.is_empty() {
        path.to_string()
    } else {
        format!("{}.{}", path, ext)
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ts_import_from() {
        let content = "import { Foo } from './foo';\nimport Bar from '../bar';\nimport type { Baz } from '@/lib/baz';";
        let imports = parse_ts_imports(content);
        assert_eq!(imports, vec!["./foo", "../bar", "@/lib/baz"]);
    }

    #[test]
    fn parse_rust_mod_and_use() {
        let content = "mod parser;\nuse crate::bridge::process;\nuse super::manager;";
        let imports = parse_rust_imports(content);
        assert_eq!(imports, vec!["parser.rs", "bridge.rs", "../manager.rs"]);
    }

    #[test]
    fn parse_python_relative_import() {
        let content = "from .utils import helper\nfrom .models.user import User";
        let imports = parse_python_imports(content);
        assert_eq!(imports, vec!["utils.py", "models/user.py"]);
    }

    #[test]
    fn suggest_test_files_ts() {
        let suggestions = suggest_test_files("src/lib/parser.ts");
        assert!(suggestions.contains(&"src/lib/parser.test.ts".to_string()));
    }

    #[test]
    fn resolve_alias_import() {
        let resolved = resolve_import("@/lib/types", "src/stores/foo.ts", "ts");
        assert_eq!(resolved, Some("src/lib/types.ts".to_string()));
    }

    #[test]
    fn resolve_relative_import() {
        let resolved = resolve_import("./bar", "src/foo.ts", "ts");
        assert_eq!(resolved, Some("src/bar.ts".to_string()));
    }
}
