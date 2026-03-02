//! Multi-file bundle detection for CHI-134.

use serde::Deserialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// A single file entry in a bundle suggestion.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileBundleEntry {
    pub relative_path: String,
    pub name: String,
    pub extension: Option<String>,
    pub estimated_tokens: usize,
}

/// One-click multi-file bundle suggestion.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileBundle {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub reason: String,
    pub entries: Vec<FileBundleEntry>,
    pub estimated_tokens: usize,
}

#[derive(Debug, Clone)]
pub struct DetectedBundle {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub reason: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CustomBundlesFile {
    #[serde(default)]
    bundles: Vec<CustomBundleDef>,
}

#[derive(Debug, Deserialize)]
struct CustomBundleDef {
    name: String,
    root: String,
    #[serde(default)]
    files: Vec<String>,
    reason: Option<String>,
}

fn to_forward_slashes(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn parent_or_empty(path: &Path) -> PathBuf {
    path.parent().map_or_else(PathBuf::new, PathBuf::from)
}

fn existing_project_file(project_root: &Path, relative_path: &str) -> bool {
    project_root.join(relative_path).is_file()
}

fn push_unique(paths: &mut Vec<String>, value: String) {
    if !paths.contains(&value) {
        paths.push(value);
    }
}

fn component_bundle(project_root: &Path, relative_path: &str) -> Option<DetectedBundle> {
    let rel = Path::new(relative_path);
    let stem = rel.file_stem()?.to_str()?;
    let ext = rel.extension()?.to_str()?;
    let ext = ext.to_lowercase();
    if !matches!(ext.as_str(), "ts" | "tsx" | "js" | "jsx") {
        return None;
    }
    if stem.ends_with(".test") || stem.ends_with(".spec") {
        return None;
    }

    let parent = parent_or_empty(rel);
    let parent_display = to_forward_slashes(&parent);

    let mut test_paths: Vec<String> = Vec::new();
    let mut style_paths: Vec<String> = Vec::new();

    for suffix in [format!("{stem}.test.{ext}"), format!("{stem}.spec.{ext}")] {
        let path = if parent_display.is_empty() {
            suffix
        } else {
            format!("{parent_display}/{suffix}")
        };
        if existing_project_file(project_root, &path) {
            test_paths.push(path);
        }
    }

    for suffix in [
        format!("{stem}.css"),
        format!("{stem}.scss"),
        format!("{stem}.module.css"),
        format!("{stem}.module.scss"),
    ] {
        let path = if parent_display.is_empty() {
            suffix
        } else {
            format!("{parent_display}/{suffix}")
        };
        if existing_project_file(project_root, &path) {
            style_paths.push(path);
        }
    }

    if test_paths.is_empty() && style_paths.is_empty() {
        return None;
    }

    let mut paths = vec![relative_path.to_string()];
    for path in test_paths {
        push_unique(&mut paths, path);
    }
    for path in style_paths {
        push_unique(&mut paths, path);
    }

    let label = if paths.len() > 2 {
        "Add with test + styles".to_string()
    } else {
        "Add with test file".to_string()
    };

    Some(DetectedBundle {
        id: format!("component:{relative_path}"),
        kind: "component".to_string(),
        label,
        reason: "Attach component implementation with related verification files".to_string(),
        paths,
    })
}

fn rust_module_paths(project_root: &Path, relative_path: &str) -> Option<Vec<String>> {
    let rel = Path::new(relative_path);
    let file_name = rel.file_name()?.to_str()?;
    let ext = rel.extension()?.to_str()?;
    if ext != "rs" {
        return None;
    }

    let module_dir = if file_name == "mod.rs" {
        parent_or_empty(rel)
    } else {
        let parent = parent_or_empty(rel);
        let stem = rel.file_stem()?.to_str()?;
        let candidate = parent.join(stem);
        if project_root.join(candidate.join("mod.rs")).is_file() {
            candidate
        } else if project_root.join(parent.join("mod.rs")).is_file() {
            parent
        } else {
            return None;
        }
    };

    let mut paths = Vec::new();
    let module_abs = project_root.join(&module_dir);
    let entries = std::fs::read_dir(&module_abs).ok()?;
    for entry in entries.flatten() {
        let abs = entry.path();
        if !abs.is_file() {
            continue;
        }
        if abs.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let rel_path = abs.strip_prefix(project_root).ok()?;
        let rel_norm = to_forward_slashes(rel_path);
        push_unique(&mut paths, rel_norm);
    }

    if paths.len() < 2 {
        return None;
    }
    paths.sort();
    Some(paths)
}

fn ts_module_paths(project_root: &Path, relative_path: &str) -> Option<Vec<String>> {
    let rel = Path::new(relative_path);
    let file_name = rel.file_name()?.to_str()?.to_lowercase();
    if !matches!(
        file_name.as_str(),
        "index.ts" | "index.tsx" | "index.js" | "index.jsx"
    ) {
        return None;
    }

    let parent = parent_or_empty(rel);
    let parent_abs = project_root.join(&parent);
    let entries = std::fs::read_dir(&parent_abs).ok()?;

    let mut paths = Vec::new();
    for entry in entries.flatten() {
        let abs = entry.path();
        if !abs.is_file() {
            continue;
        }
        let Some(ext) = abs.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !matches!(ext, "ts" | "tsx" | "js" | "jsx") {
            continue;
        }
        let Some(name) = abs.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.ends_with(".test.ts")
            || name.ends_with(".test.tsx")
            || name.ends_with(".spec.ts")
            || name.ends_with(".spec.tsx")
        {
            continue;
        }
        let rel_path = abs.strip_prefix(project_root).ok()?;
        let rel_norm = to_forward_slashes(rel_path);
        push_unique(&mut paths, rel_norm);
    }

    if paths.len() < 2 {
        return None;
    }
    paths.sort();
    Some(paths)
}

fn module_bundle(project_root: &Path, relative_path: &str) -> Option<DetectedBundle> {
    if let Some(paths) = rust_module_paths(project_root, relative_path) {
        return Some(DetectedBundle {
            id: format!("module:{relative_path}"),
            kind: "module".to_string(),
            label: "Add entire module".to_string(),
            reason: "Attach Rust module sources together for complete context".to_string(),
            paths,
        });
    }
    if let Some(paths) = ts_module_paths(project_root, relative_path) {
        return Some(DetectedBundle {
            id: format!("module:{relative_path}"),
            kind: "module".to_string(),
            label: "Add entire module".to_string(),
            reason: "Attach index-based module files together".to_string(),
            paths,
        });
    }
    None
}

fn custom_bundles(project_root: &Path, relative_path: &str) -> Vec<DetectedBundle> {
    let config_path = project_root.join(".claude").join("bundles.json");
    let Ok(raw) = std::fs::read_to_string(&config_path) else {
        return Vec::new();
    };

    let mut result = Vec::new();
    if let Ok(cfg) = serde_json::from_str::<CustomBundlesFile>(&raw) {
        for custom in cfg.bundles {
            if custom.root != relative_path {
                continue;
            }
            let mut paths = vec![custom.root.clone()];
            for path in custom.files {
                if existing_project_file(project_root, &path) {
                    push_unique(&mut paths, path);
                }
            }
            if paths.len() < 2 {
                continue;
            }
            result.push(DetectedBundle {
                id: format!("custom:{}:{}", custom.name, custom.root),
                kind: "custom".to_string(),
                label: custom.name,
                reason: custom
                    .reason
                    .unwrap_or_else(|| "Custom bundle from .claude/bundles.json".to_string()),
                paths,
            });
        }
        return result;
    }

    // Backward-compatible minimal map format:
    // { "path/to/file.tsx": ["path/to/file.test.tsx", "path/to/file.css"] }
    if let Ok(map_cfg) =
        serde_json::from_str::<std::collections::HashMap<String, Vec<String>>>(&raw)
    {
        if let Some(extra_files) = map_cfg.get(relative_path) {
            let mut paths = vec![relative_path.to_string()];
            for path in extra_files {
                if existing_project_file(project_root, path) {
                    push_unique(&mut paths, path.to_string());
                }
            }
            if paths.len() >= 2 {
                result.push(DetectedBundle {
                    id: format!("custom:{relative_path}"),
                    kind: "custom".to_string(),
                    label: "Add custom bundle".to_string(),
                    reason: "Custom bundle from .claude/bundles.json".to_string(),
                    paths,
                });
            }
        }
    }

    result
}

/// Detect bundle candidates for a given file path.
pub fn detect_bundles(project_root: &Path, relative_path: &str) -> Vec<DetectedBundle> {
    let source_path = project_root.join(relative_path);
    if !source_path.is_file() {
        return Vec::new();
    }

    let mut bundles = Vec::new();

    if let Some(bundle) = component_bundle(project_root, relative_path) {
        bundles.push(bundle);
    }
    if let Some(bundle) = module_bundle(project_root, relative_path) {
        bundles.push(bundle);
    }
    bundles.extend(custom_bundles(project_root, relative_path));

    let mut seen_ids = HashSet::new();
    bundles.retain(|bundle| seen_ids.insert(bundle.id.clone()));
    bundles
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_project(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        for (path, content) in files {
            let file_path = dir.path().join(path);
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent).expect("create parent dirs");
            }
            std::fs::write(file_path, content).expect("write file");
        }
        dir
    }

    #[test]
    fn detects_component_bundle() {
        let dir = temp_project(&[
            (
                "src/Button.tsx",
                "export function Button() { return null; }",
            ),
            ("src/Button.test.tsx", "describe('Button', () => {});"),
            ("src/Button.css", ".btn {}"),
        ]);

        let bundles = detect_bundles(dir.path(), "src/Button.tsx");
        let component = bundles
            .iter()
            .find(|bundle| bundle.kind == "component")
            .expect("component bundle");
        assert!(component.paths.contains(&"src/Button.tsx".to_string()));
        assert!(component.paths.contains(&"src/Button.test.tsx".to_string()));
    }

    #[test]
    fn detects_rust_module_bundle() {
        let dir = temp_project(&[
            ("src/bridge/mod.rs", "pub mod parser;"),
            ("src/bridge/parser.rs", "pub fn parse() {}"),
            ("src/bridge/event.rs", "pub struct Event;"),
        ]);

        let bundles = detect_bundles(dir.path(), "src/bridge/mod.rs");
        let module = bundles
            .iter()
            .find(|bundle| bundle.kind == "module")
            .expect("module bundle");
        assert!(module.paths.contains(&"src/bridge/mod.rs".to_string()));
        assert!(module.paths.contains(&"src/bridge/parser.rs".to_string()));
        assert!(module.paths.contains(&"src/bridge/event.rs".to_string()));
    }

    #[test]
    fn detects_custom_bundle_from_config() {
        let dir = temp_project(&[
            ("src/MessageInput.tsx", "export function MessageInput() {}"),
            (
                "src/MessageInput.test.tsx",
                "describe('MessageInput', () => {});",
            ),
            (
                ".claude/bundles.json",
                r#"{
                  "bundles": [
                    {
                      "name": "Message Input Bundle",
                      "root": "src/MessageInput.tsx",
                      "files": ["src/MessageInput.test.tsx"]
                    }
                  ]
                }"#,
            ),
        ]);

        let bundles = detect_bundles(dir.path(), "src/MessageInput.tsx");
        let custom = bundles
            .iter()
            .find(|bundle| bundle.kind == "custom")
            .expect("custom bundle");
        assert_eq!(custom.label, "Message Input Bundle");
        assert!(custom
            .paths
            .contains(&"src/MessageInput.test.tsx".to_string()));
    }
}
