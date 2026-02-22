# File Explorer & @-Mention Context System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a file browser sidebar and @-mention context attachment system so users can visually browse project files, attach them to prompts, and preview file content — all without leaving the conversation.

**Architecture:** A new `files/` Rust module uses the `ignore` crate (ripgrep's engine) for gitignore-respecting directory walks, with 4 IPC commands for listing, reading, searching, and token estimation. The frontend adds a `fileStore.ts` for tree state, a `FileTree` component in the Sidebar, a `FileMentionMenu` autocomplete dropdown (mirroring `SlashCommandMenu`), a `contextStore.ts` for attached file references, and a `FilePreview` component in the DetailsPanel. Context is assembled as XML-wrapped file content prepended to the user message on send.

**Tech Stack:** Tauri v2, Rust (`ignore` crate for gitignore-aware walks), SolidJS (solid-js/store), TypeScript, existing highlight.js for syntax highlighting

**Dependency chain:** Task 1 → Tasks 2 & 3 (parallel) → Task 4 → Task 5

---

## Task 1: Backend File Scanner — Rust `files/` Module (CHI-115)

**Files:**

- Create: `src-tauri/src/files/mod.rs`
- Create: `src-tauri/src/files/scanner.rs`
- Create: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod files;`)
- Modify: `src-tauri/src/commands/mod.rs` (add `pub mod files;`)
- Modify: `src-tauri/src/main.rs` (register 4 IPC commands)
- Modify: `src-tauri/Cargo.toml` (add `ignore = "0.4"`)

### Step 1: Add `ignore` dependency to Cargo.toml

In `src-tauri/Cargo.toml`, add after the `dirs = "6"` line:

```toml
# Gitignore-aware directory walking (same engine as ripgrep)
ignore = "0.4"
```

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully (dependency downloaded)

### Step 2: Create `files/mod.rs` with types

Create `src-tauri/src/files/mod.rs`:

```rust
//! File explorer: gitignore-aware scanning, content reading, and search.
//! Per CHI-115: foundation for the File Explorer & @-Mention system.

pub mod scanner;

use serde::{Deserialize, Serialize};

/// Type of filesystem node.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum FileNodeType {
    File,
    Directory,
    Symlink,
}

/// A node in the file tree (file or directory).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    /// Filename (e.g., "parser.rs").
    pub name: String,
    /// Path relative to project root (e.g., "src/bridge/parser.rs").
    pub relative_path: String,
    /// Whether this is a file, directory, or symlink.
    pub node_type: FileNodeType,
    /// Size in bytes (files only).
    pub size_bytes: Option<u64>,
    /// File extension without dot (e.g., "rs").
    pub extension: Option<String>,
    /// Child nodes (directories only, populated on demand).
    pub children: Option<Vec<FileNode>>,
    /// Whether this is a binary file.
    pub is_binary: bool,
}

/// File content returned by `read_file`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    /// Path relative to project root.
    pub relative_path: String,
    /// File content (possibly truncated).
    pub content: String,
    /// Total line count of the file.
    pub line_count: usize,
    /// File size in bytes.
    pub size_bytes: u64,
    /// Detected programming language (from extension).
    pub language: Option<String>,
    /// Estimated token count (~chars/4).
    pub estimated_tokens: usize,
    /// Whether content was truncated due to size limits.
    pub truncated: bool,
}

/// Search result for file name matching.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSearchResult {
    /// Path relative to project root.
    pub relative_path: String,
    /// Filename only.
    pub name: String,
    /// File extension.
    pub extension: Option<String>,
    /// Match score (0.0–1.0, higher = better).
    pub score: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_node_serializes() {
        let node = FileNode {
            name: "test.rs".to_string(),
            relative_path: "src/test.rs".to_string(),
            node_type: FileNodeType::File,
            size_bytes: Some(1024),
            extension: Some("rs".to_string()),
            children: None,
            is_binary: false,
        };
        let json = serde_json::to_string(&node).expect("should serialize");
        assert!(json.contains("\"name\":\"test.rs\""));
        assert!(json.contains("\"File\""));
    }

    #[test]
    fn file_content_serializes() {
        let content = FileContent {
            relative_path: "src/main.rs".to_string(),
            content: "fn main() {}".to_string(),
            line_count: 1,
            size_bytes: 12,
            language: Some("rust".to_string()),
            estimated_tokens: 3,
            truncated: false,
        };
        let json = serde_json::to_string(&content).expect("should serialize");
        assert!(json.contains("\"estimated_tokens\":3"));
    }
}
```

### Step 3: Create `files/scanner.rs` with directory walking

Create `src-tauri/src/files/scanner.rs`:

```rust
//! Gitignore-aware filesystem scanner using the `ignore` crate.
//! Provides directory listing, file reading, and fuzzy name search.

use std::path::{Path, PathBuf};

use crate::AppError;

use super::{FileContent, FileNode, FileNodeType, FileSearchResult};

/// Maximum entries returned per directory listing request.
const MAX_ENTRIES: usize = 5000;

/// Maximum file size for reading content (500 KB).
const MAX_READ_BYTES: u64 = 500 * 1024;

/// Directories always excluded (in addition to .gitignore rules).
const ALWAYS_SKIP: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".next",
    ".nuxt",
    ".venv",
    "venv",
];

/// Check if first `n` bytes contain null bytes (binary heuristic).
fn is_binary(data: &[u8]) -> bool {
    let check_len = data.len().min(8192);
    data[..check_len].contains(&0)
}

/// Detect programming language from file extension.
fn detect_language(ext: &str) -> Option<String> {
    match ext {
        "rs" => Some("rust".to_string()),
        "ts" | "tsx" => Some("typescript".to_string()),
        "js" | "jsx" | "mjs" | "cjs" => Some("javascript".to_string()),
        "py" => Some("python".to_string()),
        "rb" => Some("ruby".to_string()),
        "go" => Some("go".to_string()),
        "java" => Some("java".to_string()),
        "kt" | "kts" => Some("kotlin".to_string()),
        "swift" => Some("swift".to_string()),
        "c" | "h" => Some("c".to_string()),
        "cpp" | "cc" | "cxx" | "hpp" => Some("cpp".to_string()),
        "cs" => Some("csharp".to_string()),
        "css" => Some("css".to_string()),
        "html" | "htm" => Some("html".to_string()),
        "json" => Some("json".to_string()),
        "yaml" | "yml" => Some("yaml".to_string()),
        "toml" => Some("toml".to_string()),
        "md" | "markdown" => Some("markdown".to_string()),
        "sql" => Some("sql".to_string()),
        "sh" | "bash" | "zsh" => Some("bash".to_string()),
        "dockerfile" => Some("dockerfile".to_string()),
        "xml" => Some("xml".to_string()),
        "svg" => Some("xml".to_string()),
        _ => None,
    }
}

/// List files and directories under `project_root/relative_path` up to `max_depth` levels.
/// Respects .gitignore rules via the `ignore` crate. Returns sorted entries
/// (directories first, then files, case-insensitive alphabetical).
pub fn list_files(
    project_root: &Path,
    relative_path: Option<&str>,
    max_depth: Option<usize>,
) -> Result<Vec<FileNode>, AppError> {
    let scan_root = match relative_path {
        Some(rel) if !rel.is_empty() => project_root.join(rel),
        _ => project_root.to_path_buf(),
    };

    if !scan_root.exists() {
        return Ok(Vec::new());
    }

    let depth = max_depth.unwrap_or(1);
    let mut entries: Vec<FileNode> = Vec::new();

    // Build a walker that respects .gitignore from the project root
    let walker = ignore::WalkBuilder::new(&scan_root)
        .max_depth(Some(depth))
        .hidden(false) // Show dotfiles (but .gitignore still applies)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| {
            // Always skip hardcoded directories
            if let Some(name) = entry.file_name().to_str() {
                if entry.file_type().map_or(false, |ft| ft.is_dir())
                    && ALWAYS_SKIP.contains(&name)
                {
                    return false;
                }
            }
            true
        })
        .sort_by_file_path(|a, b| {
            // Directories first, then case-insensitive alphabetical
            let a_is_dir = a.is_dir();
            let b_is_dir = b.is_dir();
            match (a_is_dir, b_is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a
                    .file_name()
                    .unwrap_or_default()
                    .to_ascii_lowercase()
                    .cmp(&b.file_name().unwrap_or_default().to_ascii_lowercase()),
            }
        })
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Skip the root directory itself
        if entry.path() == scan_root {
            continue;
        }

        // Only include direct children for depth=1 (relative to scan_root)
        let rel_path = match entry.path().strip_prefix(project_root) {
            Ok(r) => r.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = entry
            .file_name()
            .to_str()
            .unwrap_or("?")
            .to_string();

        let node_type = if metadata.is_dir() {
            FileNodeType::Directory
        } else if metadata.file_type().is_symlink() {
            FileNodeType::Symlink
        } else {
            FileNodeType::File
        };

        let extension = if node_type == FileNodeType::File {
            entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string())
        } else {
            None
        };

        let size_bytes = if node_type == FileNodeType::File {
            Some(metadata.len())
        } else {
            None
        };

        // Binary detection for files
        let is_bin = if node_type == FileNodeType::File && metadata.len() > 0 {
            match std::fs::read(entry.path()) {
                Ok(data) => is_binary(&data),
                Err(_) => false,
            }
        } else {
            false
        };

        entries.push(FileNode {
            name,
            relative_path: rel_path,
            node_type,
            size_bytes,
            extension,
            children: None,
            is_binary: is_bin,
        });

        if entries.len() >= MAX_ENTRIES {
            break;
        }
    }

    Ok(entries)
}

/// Read file content with optional line range.
/// Returns up to `MAX_READ_BYTES` of content. Sets `truncated: true` if file exceeds limit.
pub fn read_file(
    project_root: &Path,
    relative_path: &str,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<FileContent, AppError> {
    let full_path = project_root.join(relative_path);

    if !full_path.exists() {
        return Err(AppError::Other(format!(
            "File not found: {}",
            relative_path
        )));
    }

    let metadata = std::fs::metadata(&full_path)?;
    let size_bytes = metadata.len();

    // Binary check
    if size_bytes > 0 {
        let peek = std::fs::read(&full_path)?;
        if is_binary(&peek) {
            return Ok(FileContent {
                relative_path: relative_path.to_string(),
                content: String::new(),
                line_count: 0,
                size_bytes,
                language: None,
                estimated_tokens: 0,
                truncated: false,
            });
        }
    }

    let raw_content = std::fs::read_to_string(&full_path)?;
    let total_lines = raw_content.lines().count();
    let truncated = size_bytes > MAX_READ_BYTES;

    let content = match (start_line, end_line) {
        (Some(start), Some(end)) => {
            // Line range (1-indexed)
            let start_idx = start.saturating_sub(1);
            raw_content
                .lines()
                .skip(start_idx)
                .take(end.saturating_sub(start_idx))
                .collect::<Vec<_>>()
                .join("\n")
        }
        (Some(start), None) => {
            let start_idx = start.saturating_sub(1);
            raw_content
                .lines()
                .skip(start_idx)
                .collect::<Vec<_>>()
                .join("\n")
        }
        _ => {
            if truncated {
                // Read up to MAX_READ_BYTES worth of content
                let limit = MAX_READ_BYTES as usize;
                if raw_content.len() > limit {
                    raw_content[..limit].to_string()
                } else {
                    raw_content.clone()
                }
            } else {
                raw_content.clone()
            }
        }
    };

    let extension = full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let language = detect_language(extension);
    let estimated_tokens = content.len() / 4;

    Ok(FileContent {
        relative_path: relative_path.to_string(),
        content,
        line_count: total_lines,
        size_bytes,
        language,
        estimated_tokens,
        truncated,
    })
}

/// Search for files by name. Returns matches sorted by relevance score.
/// Uses a simple substring + prefix scoring algorithm.
pub fn search_files(
    project_root: &Path,
    query: &str,
    max_results: Option<usize>,
) -> Result<Vec<FileSearchResult>, AppError> {
    let limit = max_results.unwrap_or(20).min(100);
    let query_lower = query.to_lowercase();
    let mut results: Vec<FileSearchResult> = Vec::new();

    let walker = ignore::WalkBuilder::new(project_root)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| {
            if let Some(name) = entry.file_name().to_str() {
                if entry.file_type().map_or(false, |ft| ft.is_dir())
                    && ALWAYS_SKIP.contains(&name)
                {
                    return false;
                }
            }
            true
        })
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Only match files
        if !entry.file_type().map_or(false, |ft| ft.is_file()) {
            continue;
        }

        let name = entry.file_name().to_str().unwrap_or("").to_string();
        let name_lower = name.to_lowercase();

        let rel_path = match entry.path().strip_prefix(project_root) {
            Ok(r) => r.to_string_lossy().to_string(),
            Err(_) => continue,
        };
        let rel_lower = rel_path.to_lowercase();

        // Scoring: exact name match > name prefix > name contains > path contains
        let score = if name_lower == query_lower {
            1.0
        } else if name_lower.starts_with(&query_lower) {
            0.9
        } else if name_lower.contains(&query_lower) {
            0.7
        } else if rel_lower.contains(&query_lower) {
            0.4
        } else {
            continue; // No match
        };

        let extension = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_string());

        results.push(FileSearchResult {
            relative_path: rel_path,
            name,
            extension,
            score,
        });
    }

    // Sort by score descending, then name ascending
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.cmp(&b.name))
    });

    results.truncate(limit);
    Ok(results)
}

/// Estimate token count for a file (~chars/4).
pub fn estimate_tokens(project_root: &Path, relative_path: &str) -> Result<usize, AppError> {
    let full_path = project_root.join(relative_path);
    let metadata = std::fs::metadata(&full_path)?;
    Ok(metadata.len() as usize / 4)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_test_project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        // Create project structure
        fs::create_dir_all(dir.path().join("src")).unwrap();
        fs::create_dir_all(dir.path().join("src/lib")).unwrap();
        fs::create_dir_all(dir.path().join("node_modules/pkg")).unwrap();
        fs::create_dir_all(dir.path().join(".git/objects")).unwrap();
        fs::write(dir.path().join("README.md"), "# Test Project\n").unwrap();
        fs::write(dir.path().join("src/main.rs"), "fn main() {}\n").unwrap();
        fs::write(
            dir.path().join("src/lib/utils.ts"),
            "export function hello() { return 'hi'; }\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("node_modules/pkg/index.js"),
            "module.exports = {};\n",
        )
        .unwrap();
        fs::write(
            dir.path().join(".git/objects/abc"),
            "git object data",
        )
        .unwrap();
        // Create a .gitignore
        fs::write(dir.path().join(".gitignore"), "*.log\n").unwrap();
        // Create a file that should be ignored
        fs::write(dir.path().join("debug.log"), "log data").unwrap();
        dir
    }

    #[test]
    fn list_files_returns_project_root_entries() {
        let project = create_test_project();
        let result = list_files(project.path(), None, Some(1)).unwrap();
        // Should have: .gitignore, README.md, src/
        // Should NOT have: node_modules/, .git/, debug.log
        let names: Vec<&str> = result.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"src"), "Should contain src/");
        assert!(names.contains(&"README.md"), "Should contain README.md");
        assert!(
            !names.contains(&"node_modules"),
            "Should skip node_modules/"
        );
        assert!(!names.contains(&".git"), "Should skip .git/");
        assert!(
            !names.contains(&"debug.log"),
            "Should skip .gitignore'd files"
        );
    }

    #[test]
    fn list_files_subdirectory() {
        let project = create_test_project();
        let result = list_files(project.path(), Some("src"), Some(1)).unwrap();
        let names: Vec<&str> = result.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"main.rs"));
        assert!(names.contains(&"lib"));
    }

    #[test]
    fn list_files_nonexistent_returns_empty() {
        let project = create_test_project();
        let result = list_files(project.path(), Some("nonexistent"), Some(1)).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn list_files_directories_sorted_first() {
        let project = create_test_project();
        let result = list_files(project.path(), None, Some(1)).unwrap();
        // Find first file and first directory
        let first_dir_idx = result
            .iter()
            .position(|n| n.node_type == FileNodeType::Directory);
        let first_file_idx = result
            .iter()
            .position(|n| n.node_type == FileNodeType::File);
        if let (Some(dir_idx), Some(file_idx)) = (first_dir_idx, first_file_idx) {
            assert!(
                dir_idx < file_idx,
                "Directories should be sorted before files"
            );
        }
    }

    #[test]
    fn read_file_returns_content() {
        let project = create_test_project();
        let result = read_file(project.path(), "src/main.rs", None, None).unwrap();
        assert_eq!(result.content, "fn main() {}\n");
        assert_eq!(result.line_count, 1);
        assert_eq!(result.language, Some("rust".to_string()));
        assert!(!result.truncated);
        assert!(result.estimated_tokens > 0);
    }

    #[test]
    fn read_file_line_range() {
        let project = create_test_project();
        let content = "line1\nline2\nline3\nline4\nline5\n";
        fs::write(project.path().join("multi.txt"), content).unwrap();

        let result = read_file(project.path(), "multi.txt", Some(2), Some(4)).unwrap();
        assert_eq!(result.content, "line2\nline3");
    }

    #[test]
    fn read_file_not_found() {
        let project = create_test_project();
        let result = read_file(project.path(), "nonexistent.txt", None, None);
        assert!(result.is_err());
    }

    #[test]
    fn read_file_binary_returns_empty_content() {
        let project = create_test_project();
        let binary_data: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x01];
        fs::write(project.path().join("image.png"), &binary_data).unwrap();

        let result = read_file(project.path(), "image.png", None, None).unwrap();
        assert!(result.content.is_empty());
        assert_eq!(result.estimated_tokens, 0);
    }

    #[test]
    fn search_files_finds_by_name() {
        let project = create_test_project();
        let results = search_files(project.path(), "main", None).unwrap();
        assert!(!results.is_empty());
        assert!(results.iter().any(|r| r.name == "main.rs"));
    }

    #[test]
    fn search_files_finds_by_path() {
        let project = create_test_project();
        let results = search_files(project.path(), "lib/utils", None).unwrap();
        assert!(!results.is_empty());
        assert!(results.iter().any(|r| r.name == "utils.ts"));
    }

    #[test]
    fn search_files_respects_gitignore() {
        let project = create_test_project();
        let results = search_files(project.path(), "debug", None).unwrap();
        // debug.log should not appear (in .gitignore)
        assert!(!results.iter().any(|r| r.name == "debug.log"));
    }

    #[test]
    fn search_files_skips_always_skip_dirs() {
        let project = create_test_project();
        let results = search_files(project.path(), "index", None).unwrap();
        // node_modules/pkg/index.js should not appear
        assert!(!results.iter().any(|r| r.relative_path.contains("node_modules")));
    }

    #[test]
    fn search_files_exact_match_scores_highest() {
        let project = create_test_project();
        fs::write(project.path().join("README.md"), "# Test\n").unwrap();
        let results = search_files(project.path(), "README.md", None).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].score, 1.0);
    }

    #[test]
    fn estimate_tokens_returns_reasonable_value() {
        let project = create_test_project();
        let tokens = estimate_tokens(project.path(), "src/main.rs").unwrap();
        // "fn main() {}\n" = 14 bytes / 4 = 3 tokens
        assert_eq!(tokens, 3);
    }

    #[test]
    fn detect_language_known_extensions() {
        assert_eq!(detect_language("rs"), Some("rust".to_string()));
        assert_eq!(detect_language("ts"), Some("typescript".to_string()));
        assert_eq!(detect_language("py"), Some("python".to_string()));
        assert_eq!(detect_language("json"), Some("json".to_string()));
        assert_eq!(detect_language("xyz"), None);
    }

    #[test]
    fn is_binary_detects_null_bytes() {
        assert!(is_binary(&[0x89, 0x50, 0x4E, 0x47, 0x00]));
        assert!(!is_binary(b"Hello world"));
    }
}
```

### Step 4: Register the `files` module in `lib.rs`

In `src-tauri/src/lib.rs`, add `pub mod files;` after `pub mod slash;`:

```rust
pub mod bridge;
pub mod commands;
pub mod db;
pub mod files;
pub mod logging;
pub mod slash;
```

### Step 5: Run tests to verify scanner

Run: `cd src-tauri && cargo test`
Expected: All existing 118 tests pass + 16 new tests in `files/` pass

### Step 6: Create `commands/files.rs` with IPC handlers

Create `src-tauri/src/commands/files.rs`:

```rust
//! IPC commands for file explorer (CHI-115).
//! Thin handlers: resolve project path from DB, delegate to `files::scanner`.

use crate::db::{queries, Database};
use crate::files::{scanner, FileContent, FileNode, FileSearchResult};
use crate::AppError;
use tauri::State;

/// List files/directories under a project path.
/// `relative_path`: subdirectory to list (None = project root).
/// `max_depth`: how deep to recurse (default 1 = direct children only).
#[tauri::command(rename_all = "snake_case")]
pub fn list_project_files(
    db: State<'_, Database>,
    project_id: String,
    relative_path: Option<String>,
    max_depth: Option<usize>,
) -> Result<Vec<FileNode>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::list_files(project_root, relative_path.as_deref(), max_depth)
}

/// Read file content with optional line range.
/// `start_line` and `end_line` are 1-indexed (inclusive).
#[tauri::command(rename_all = "snake_case")]
pub fn read_project_file(
    db: State<'_, Database>,
    project_id: String,
    relative_path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<FileContent, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::read_file(project_root, &relative_path, start_line, end_line)
}

/// Search for files by name within a project.
#[tauri::command(rename_all = "snake_case")]
pub fn search_project_files(
    db: State<'_, Database>,
    project_id: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<FileSearchResult>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::search_files(project_root, &query, max_results)
}

/// Estimate token count for a file (~chars/4).
#[tauri::command(rename_all = "snake_case")]
pub fn get_file_token_estimate(
    db: State<'_, Database>,
    project_id: String,
    relative_path: String,
) -> Result<usize, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::estimate_tokens(project_root, &relative_path)
}
```

### Step 7: Register file commands

In `src-tauri/src/commands/mod.rs`, add `pub mod files;`:

```rust
pub mod bridge;
pub mod cli;
pub mod files;
pub mod project;
pub mod session;
pub mod slash;
```

In `src-tauri/src/main.rs`, add to the `invoke_handler` list (after the slash commands):

```rust
chief_wiggum_lib::commands::files::list_project_files,
chief_wiggum_lib::commands::files::read_project_file,
chief_wiggum_lib::commands::files::search_project_files,
chief_wiggum_lib::commands::files::get_file_token_estimate,
```

### Step 8: Final verification

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings`
Expected: All tests pass (134+), no clippy warnings

### Step 9: Commit

```bash
git add src-tauri/src/files/ src-tauri/src/commands/files.rs src-tauri/src/lib.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat: add file scanner backend for File Explorer (CHI-115)

Adds files/ module with gitignore-aware directory walking (ignore crate),
file content reading with line ranges, fuzzy name search, and token estimation.
4 IPC commands: list_project_files, read_project_file, search_project_files,
get_file_token_estimate. 16+ new unit tests."
```

---

## Task 2: File Tree Sidebar Component (CHI-116)

**Files:**

- Modify: `src/lib/types.ts` (add file-related interfaces)
- Create: `src/stores/fileStore.ts`
- Create: `src/components/explorer/FileTree.tsx`
- Create: `src/components/explorer/FileTreeNode.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (add Files section)

### Step 1: Add TypeScript types

In `src/lib/types.ts`, add at the bottom (after `SlashCommand`):

```typescript
// ── File Explorer (CHI-115/116/117) ──────────────────────

/** Filesystem node type. */
export type FileNodeType = 'File' | 'Directory' | 'Symlink';

/** A node in the file tree. */
export interface FileNode {
  name: string;
  relative_path: string;
  node_type: FileNodeType;
  size_bytes: number | null;
  extension: string | null;
  children: FileNode[] | null;
  is_binary: boolean;
}

/** File content returned by read_project_file. */
export interface FileContent {
  relative_path: string;
  content: string;
  line_count: number;
  size_bytes: number;
  language: string | null;
  estimated_tokens: number;
  truncated: boolean;
}

/** Search result for file name matching. */
export interface FileSearchResult {
  relative_path: string;
  name: string;
  extension: string | null;
  score: number;
}

/** Reference to a file attached to a prompt. */
export interface FileReference {
  relative_path: string;
  name: string;
  extension: string | null;
  estimated_tokens: number;
  start_line?: number;
  end_line?: number;
  is_directory: boolean;
}

/** An attached file in the context assembly. */
export interface ContextAttachment {
  id: string;
  reference: FileReference;
  content?: string;
  actual_tokens?: number;
}
```

### Step 2: Create `fileStore.ts`

Create `src/stores/fileStore.ts`:

```typescript
// src/stores/fileStore.ts
// Manages file tree state: lazy-loaded directory tree, selection, search, preview.
// Backed by list_project_files / search_project_files / read_project_file IPC.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { FileNode, FileContent, FileSearchResult } from '@/lib/types';

interface FileState {
  /** Cached tree nodes per relative path (path → children). */
  tree: Record<string, FileNode[]>;
  /** Set of expanded directory paths. */
  expandedPaths: string[];
  /** Currently selected file path (for preview). */
  selectedPath: string | null;
  /** File search query. */
  searchQuery: string;
  /** Search results. */
  searchResults: FileSearchResult[];
  /** Whether a search is in flight. */
  isSearching: boolean;
  /** Whether the file tree root is loading. */
  isLoading: boolean;
  /** Preview content for the selected file. */
  previewContent: FileContent | null;
  /** Whether preview is loading. */
  isPreviewLoading: boolean;
  /** Whether the files section is visible. */
  isVisible: boolean;
}

const [state, setState] = createStore<FileState>({
  tree: {},
  expandedPaths: [],
  selectedPath: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  isLoading: false,
  previewContent: null,
  isPreviewLoading: false,
  isVisible: true,
});

export { state as fileState };

/** Load root-level files for a project. */
export async function loadRootFiles(projectId: string): Promise<void> {
  setState('isLoading', true);
  try {
    const nodes = await invoke<FileNode[]>('list_project_files', {
      project_id: projectId,
      relative_path: null,
      max_depth: 1,
    });
    setState('tree', '', nodes);
  } catch (err) {
    console.error('[fileStore] Failed to load root files:', err);
  } finally {
    setState('isLoading', false);
  }
}

/** Load children for a directory (lazy expand). */
export async function loadDirectoryChildren(
  projectId: string,
  relativePath: string,
): Promise<void> {
  try {
    const nodes = await invoke<FileNode[]>('list_project_files', {
      project_id: projectId,
      relative_path: relativePath,
      max_depth: 1,
    });
    setState('tree', relativePath, nodes);
  } catch (err) {
    console.error('[fileStore] Failed to load directory:', err);
  }
}

/** Toggle a directory expanded/collapsed. Loads children on first expand. */
export async function toggleFolder(projectId: string, relativePath: string): Promise<void> {
  const isExpanded = state.expandedPaths.includes(relativePath);
  if (isExpanded) {
    setState(
      'expandedPaths',
      state.expandedPaths.filter((p) => p !== relativePath),
    );
  } else {
    setState('expandedPaths', [...state.expandedPaths, relativePath]);
    // Load children if not cached
    if (!state.tree[relativePath]) {
      await loadDirectoryChildren(projectId, relativePath);
    }
  }
}

/** Select a file for preview. */
export async function selectFile(projectId: string, relativePath: string): Promise<void> {
  setState('selectedPath', relativePath);
  setState('isPreviewLoading', true);
  try {
    const content = await invoke<FileContent>('read_project_file', {
      project_id: projectId,
      relative_path: relativePath,
      start_line: null,
      end_line: 50, // First 50 lines for preview
    });
    setState('previewContent', content);
  } catch (err) {
    console.error('[fileStore] Failed to load preview:', err);
    setState('previewContent', null);
  } finally {
    setState('isPreviewLoading', false);
  }
}

/** Search files by name. */
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

export function searchFiles(projectId: string, query: string): void {
  setState('searchQuery', query);
  if (!query.trim()) {
    setState('searchResults', []);
    setState('isSearching', false);
    return;
  }
  setState('isSearching', true);

  // Debounce 150ms
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const results = await invoke<FileSearchResult[]>('search_project_files', {
        project_id: projectId,
        query: query.trim(),
        max_results: 20,
      });
      setState('searchResults', results);
    } catch (err) {
      console.error('[fileStore] Failed to search files:', err);
    } finally {
      setState('isSearching', false);
    }
  }, 150);
}

/** Clear search state. */
export function clearSearch(): void {
  setState({ searchQuery: '', searchResults: [], isSearching: false });
}

/** Toggle files section visibility. */
export function toggleFilesVisible(): void {
  setState('isVisible', (v) => !v);
}

/** Clear all file state (e.g., on project switch). */
export function clearFileState(): void {
  setState({
    tree: {},
    expandedPaths: [],
    selectedPath: null,
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    isLoading: false,
    previewContent: null,
    isPreviewLoading: false,
  });
}

/** Check if a directory is expanded. */
export function isExpanded(relativePath: string): boolean {
  return state.expandedPaths.includes(relativePath);
}

/** Get children for a directory path from cache. */
export function getChildren(relativePath: string): FileNode[] {
  return state.tree[relativePath] ?? [];
}

/** Get root nodes. */
export function getRootNodes(): FileNode[] {
  return state.tree[''] ?? [];
}
```

### Step 3: Create `FileTreeNode.tsx`

Create `src/components/explorer/FileTreeNode.tsx`:

```tsx
// src/components/explorer/FileTreeNode.tsx
// Individual file/folder row in the file tree.
// Lazy-loads children on folder expand. Click selects for preview.

import type { Component } from 'solid-js';
import { Show, For } from 'solid-js';
import { File, Folder, FolderOpen, ChevronRight } from 'lucide-solid';
import type { FileNode } from '@/lib/types';
import { isExpanded, getChildren, toggleFolder, selectFile } from '@/stores/fileStore';

interface FileTreeNodeProps {
  node: FileNode;
  projectId: string;
  depth: number;
  selectedPath: string | null;
}

/** Format file size for display. */
function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

/** Token-based size color indicator. */
function sizeColor(bytes: number | null): string {
  if (bytes == null) return 'var(--color-text-tertiary)';
  const tokens = bytes / 4;
  if (tokens < 2000) return 'var(--color-success)';
  if (tokens < 10000) return 'var(--color-warning)';
  return 'var(--color-error)';
}

const FileTreeNode: Component<FileTreeNodeProps> = (props) => {
  const isDir = () => props.node.node_type === 'Directory';
  const expanded = () => isDir() && isExpanded(props.node.relative_path);
  const isSelected = () => props.selectedPath === props.node.relative_path;

  function handleClick() {
    if (isDir()) {
      toggleFolder(props.projectId, props.node.relative_path);
    } else {
      selectFile(props.projectId, props.node.relative_path);
    }
  }

  return (
    <>
      <button
        class="flex items-center gap-1 w-full text-left py-0.5 text-xs transition-colors group"
        style={{
          'padding-left': `${8 + props.depth * 16}px`,
          background: isSelected() ? 'var(--color-accent-muted)' : 'transparent',
          color: isSelected() ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          'transition-duration': 'var(--duration-fast)',
        }}
        onMouseEnter={(e) => {
          if (!isSelected()) {
            e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected()) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
        onClick={handleClick}
        title={props.node.relative_path}
      >
        {/* Expand chevron for directories */}
        <Show when={isDir()}>
          <span
            class="shrink-0 transition-transform"
            style={{
              transform: expanded() ? 'rotate(90deg)' : 'rotate(0deg)',
              'transition-duration': 'var(--duration-fast)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <ChevronRight size={10} />
          </span>
        </Show>
        <Show when={!isDir()}>
          <span class="w-[10px] shrink-0" />
        </Show>

        {/* Icon */}
        <span class="shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
          <Show when={isDir()} fallback={<File size={12} />}>
            <Show when={expanded()} fallback={<Folder size={12} />}>
              <FolderOpen size={12} />
            </Show>
          </Show>
        </span>

        {/* Name */}
        <span class="truncate flex-1 font-mono" style={{ 'font-size': '11px' }}>
          {props.node.name}
        </span>

        {/* Size badge for files */}
        <Show when={!isDir() && props.node.size_bytes != null}>
          <span
            class="shrink-0 font-mono opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              'font-size': '9px',
              color: sizeColor(props.node.size_bytes),
              'transition-duration': 'var(--duration-fast)',
            }}
          >
            {formatSize(props.node.size_bytes)}
          </span>
        </Show>
      </button>

      {/* Expanded children */}
      <Show when={expanded()}>
        <For each={getChildren(props.node.relative_path)}>
          {(child) => (
            <FileTreeNode
              node={child}
              projectId={props.projectId}
              depth={props.depth + 1}
              selectedPath={props.selectedPath}
            />
          )}
        </For>
      </Show>
    </>
  );
};

export default FileTreeNode;
```

### Step 4: Create `FileTree.tsx`

Create `src/components/explorer/FileTree.tsx`:

```tsx
// src/components/explorer/FileTree.tsx
// File tree container: loads root on mount, renders FileTreeNode recursively.

import type { Component } from 'solid-js';
import { Show, For, onMount } from 'solid-js';
import { Search, RefreshCw } from 'lucide-solid';
import type { FileSearchResult } from '@/lib/types';
import {
  fileState,
  loadRootFiles,
  getRootNodes,
  searchFiles,
  clearSearch,
  selectFile,
} from '@/stores/fileStore';
import FileTreeNode from './FileTreeNode';

interface FileTreeProps {
  projectId: string;
}

const FileTree: Component<FileTreeProps> = (props) => {
  let searchInputRef: HTMLInputElement | undefined;

  onMount(() => {
    if (getRootNodes().length === 0) {
      loadRootFiles(props.projectId);
    }
  });

  function handleSearchInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    searchFiles(props.projectId, value);
  }

  function handleSearchResultClick(result: FileSearchResult) {
    selectFile(props.projectId, result.relative_path);
    clearSearch();
    if (searchInputRef) searchInputRef.value = '';
  }

  return (
    <div class="flex flex-col">
      {/* Search input */}
      <div class="px-2 pb-1.5">
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded"
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <Search size={10} style={{ color: 'var(--color-text-tertiary)', 'flex-shrink': '0' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search files..."
            class="flex-1 bg-transparent text-xs outline-none font-mono"
            style={{
              color: 'var(--color-text-primary)',
              'font-size': '10px',
            }}
            onInput={handleSearchInput}
          />
        </div>
      </div>

      {/* Search results or tree */}
      <div class="overflow-y-auto" style={{ 'max-height': '300px' }}>
        <Show
          when={!fileState.searchQuery}
          fallback={
            /* Search results view */
            <div class="py-1">
              <Show
                when={fileState.searchResults.length > 0}
                fallback={
                  <Show when={!fileState.isSearching}>
                    <p class="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      No files found
                    </p>
                  </Show>
                }
              >
                <For each={fileState.searchResults}>
                  {(result) => (
                    <button
                      class="flex items-center gap-2 w-full px-3 py-1 text-left text-xs transition-colors"
                      style={{
                        color: 'var(--color-text-secondary)',
                        'transition-duration': 'var(--duration-fast)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                      onClick={() => handleSearchResultClick(result)}
                    >
                      <span
                        class="font-mono font-medium truncate"
                        style={{ 'font-size': '11px', color: 'var(--color-accent)' }}
                      >
                        {result.name}
                      </span>
                      <span
                        class="text-text-tertiary/50 truncate font-mono"
                        style={{ 'font-size': '9px' }}
                      >
                        {result.relative_path}
                      </span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          }
        >
          {/* Tree view */}
          <Show
            when={!fileState.isLoading}
            fallback={
              <p
                class="px-3 py-2 text-xs animate-pulse"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Loading files...
              </p>
            }
          >
            <Show
              when={getRootNodes().length > 0}
              fallback={
                <p class="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  No files found
                </p>
              }
            >
              <div class="py-0.5">
                <For each={getRootNodes()}>
                  {(node) => (
                    <FileTreeNode
                      node={node}
                      projectId={props.projectId}
                      depth={0}
                      selectedPath={fileState.selectedPath}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default FileTree;
```

### Step 5: Integrate FileTree into Sidebar

In `src/components/layout/Sidebar.tsx`, add the Files section between the Projects section and the Sessions section.

Add imports at the top:

```typescript
import { FolderTree } from 'lucide-solid';
import { fileState, toggleFilesVisible, loadRootFiles, clearFileState } from '@/stores/fileStore';
import FileTree from '@/components/explorer/FileTree';
```

Add a Files section between the project section's closing `</div>` and the Sessions header `<Show>`. The section shows only when a project is active:

```tsx
{
  /* Files section */
}
<Show when={projectState.activeProjectId && fileState.isVisible}>
  <div style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
    <Show
      when={!isCollapsed()}
      fallback={
        <div class="flex flex-col items-center py-2 gap-1">
          <button
            class="flex items-center justify-center w-8 h-8 rounded-md text-text-tertiary hover:text-accent hover:bg-bg-elevated/50 transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => toggleFilesVisible()}
            title="Files"
          >
            <FolderTree size={16} />
          </button>
        </div>
      }
    >
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
          Files
        </span>
      </div>
      <FileTree projectId={projectState.activeProjectId!} />
    </Show>
  </div>
</Show>;
```

Also update the `onMount` to load files when a project is selected. In the existing `onMount`, after `await loadProjects();` and the auto-select logic, add:

```typescript
// Load file tree if a project is active
if (projectState.activeProjectId) {
  loadRootFiles(projectState.activeProjectId);
}
```

And update `setActiveProject` calls to reload the file tree. Where projects are switched (e.g., in project list click handlers), add after `setActiveProject(project.id)`:

```typescript
clearFileState();
loadRootFiles(project.id);
```

### Step 6: Run verification

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean — no type errors or lint issues

### Step 7: Commit

```bash
git add src/lib/types.ts src/stores/fileStore.ts src/components/explorer/ src/components/layout/Sidebar.tsx
git commit -m "feat: File Tree sidebar with lazy loading (CHI-116)

Adds fileStore.ts for tree state management, FileTree.tsx and FileTreeNode.tsx
for recursive tree rendering, integrated into Sidebar with search. Lazy-loads
children on folder expand, gitignore-aware via backend scanner."
```

---

## Task 3: @-Mention Autocomplete (CHI-117)

**Files:**

- Create: `src/stores/contextStore.ts`
- Create: `src/components/conversation/FileMentionMenu.tsx`
- Create: `src/components/conversation/ContextChip.tsx`
- Modify: `src/components/conversation/MessageInput.tsx` (add `@` trigger + chip bar + context assembly)
- Modify: `src/stores/conversationStore.ts` (integrate context on send)

### Step 1: Create `contextStore.ts`

Create `src/stores/contextStore.ts`:

```typescript
// src/stores/contextStore.ts
// Manages file references attached to the current prompt.
// Files are loaded on send (not on attach) to minimize IPC calls.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { ContextAttachment, FileReference, FileContent } from '@/lib/types';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';

/** Maximum total estimated tokens before warning. */
const TOKEN_WARNING_THRESHOLD = 50_000;
/** Hard cap on total tokens. */
const TOKEN_HARD_CAP = 100_000;

interface ContextState {
  attachments: ContextAttachment[];
  isAssembling: boolean;
}

const [state, setState] = createStore<ContextState>({
  attachments: [],
  isAssembling: false,
});

export { state as contextState };

/** Add a file reference to the prompt context. */
export function addFileReference(ref: FileReference): void {
  // Dedup by path + line range
  const exists = state.attachments.some(
    (a) =>
      a.reference.relative_path === ref.relative_path &&
      a.reference.start_line === ref.start_line &&
      a.reference.end_line === ref.end_line,
  );
  if (exists) return;

  const newTotal = getTotalEstimatedTokens() + ref.estimated_tokens;
  if (newTotal > TOKEN_HARD_CAP) {
    addToast({
      type: 'error',
      message: `Cannot attach: would exceed ${(TOKEN_HARD_CAP / 1000).toFixed(0)}K token limit`,
    });
    return;
  }

  const attachment: ContextAttachment = {
    id: crypto.randomUUID(),
    reference: ref,
  };
  setState('attachments', (prev) => [...prev, attachment]);

  if (newTotal > TOKEN_WARNING_THRESHOLD) {
    addToast({
      type: 'warning',
      message: `Context is large: ~${(newTotal / 1000).toFixed(1)}K tokens attached`,
    });
  }
}

/** Remove an attachment by ID. */
export function removeAttachment(id: string): void {
  setState(
    'attachments',
    state.attachments.filter((a) => a.id !== id),
  );
}

/** Clear all attachments. */
export function clearAttachments(): void {
  setState('attachments', []);
}

/** Get total estimated tokens across all attachments. */
export function getTotalEstimatedTokens(): number {
  return state.attachments.reduce((sum, a) => sum + a.reference.estimated_tokens, 0);
}

/** Get attachment count. */
export function getAttachmentCount(): number {
  return state.attachments.length;
}

/**
 * Assemble context: load all file contents and build the XML-wrapped context string.
 * Called right before sending a message. Returns the context prefix to prepend.
 */
export async function assembleContext(): Promise<string> {
  if (state.attachments.length === 0) return '';

  const projectId = projectState.activeProjectId;
  if (!projectId) return '';

  setState('isAssembling', true);

  try {
    const parts: string[] = [];
    parts.push('<context>');

    for (const attachment of state.attachments) {
      const ref = attachment.reference;
      try {
        const content = await invoke<FileContent>('read_project_file', {
          project_id: projectId,
          relative_path: ref.relative_path,
          start_line: ref.start_line ?? null,
          end_line: ref.end_line ?? null,
        });

        const lineAttr = ref.start_line ? ` lines="${ref.start_line}-${ref.end_line ?? ''}"` : '';
        parts.push(
          `<file path="${ref.relative_path}"${lineAttr} tokens="~${content.estimated_tokens}">`,
        );
        parts.push(content.content);
        parts.push('</file>');
      } catch (err) {
        console.error(`[contextStore] Failed to read ${ref.relative_path}:`, err);
        parts.push(`<file path="${ref.relative_path}" error="failed to read" />`);
      }
    }

    parts.push('</context>');
    parts.push('');
    return parts.join('\n');
  } finally {
    setState('isAssembling', false);
  }
}
```

### Step 2: Create `FileMentionMenu.tsx`

Create `src/components/conversation/FileMentionMenu.tsx`:

```tsx
// src/components/conversation/FileMentionMenu.tsx
// Inline autocomplete dropdown for @-mentions (file references).
// Mirrors SlashCommandMenu structure: appears above MessageInput when user types `@`.

import type { Component } from 'solid-js';
import { Show, For, createEffect } from 'solid-js';
import { File, Folder } from 'lucide-solid';
import type { FileSearchResult } from '@/lib/types';

interface FileMentionMenuProps {
  isOpen: boolean;
  results: FileSearchResult[];
  highlightedIndex: number;
  isLoading: boolean;
  onSelect: (result: FileSearchResult) => void;
  onClose: () => void;
}

const FileMentionMenu: Component<FileMentionMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  // Scroll highlighted item into view
  createEffect(() => {
    if (!menuRef || !props.isOpen) return;
    const highlighted = menuRef.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });

  return (
    <Show when={props.isOpen && (props.results.length > 0 || props.isLoading)}>
      <div
        ref={menuRef}
        class="absolute bottom-full left-0 right-0 mb-1 max-h-[300px] overflow-y-auto rounded-lg z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': '0 -4px 16px rgba(0, 0, 0, 0.3)',
        }}
        role="listbox"
        aria-label="File mentions"
      >
        {/* Section header */}
        <div
          class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-secondary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          Files
        </div>

        {/* Loading state */}
        <Show when={props.isLoading && props.results.length === 0}>
          <div
            class="px-3 py-2 text-xs animate-pulse"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Searching...
          </div>
        </Show>

        {/* Results */}
        <For each={props.results}>
          {(result, idx) => {
            const isHighlighted = () => idx() === props.highlightedIndex;

            return (
              <button
                class="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                style={{
                  background: isHighlighted() ? 'var(--color-accent-muted)' : 'transparent',
                  'border-left': isHighlighted()
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                }}
                data-highlighted={isHighlighted()}
                role="option"
                aria-selected={isHighlighted()}
                onClick={() => props.onSelect(result)}
              >
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  <File size={12} />
                </span>
                <span
                  class="font-mono font-medium shrink-0"
                  style={{ 'font-size': '11px', color: 'var(--color-accent)' }}
                >
                  {result.name}
                </span>
                <span
                  class="text-text-tertiary/50 truncate font-mono"
                  style={{ 'font-size': '9px' }}
                >
                  {result.relative_path}
                </span>
              </button>
            );
          }}
        </For>

        {/* Footer hint */}
        <div
          class="px-3 py-1.5 text-[10px] text-text-tertiary/40 flex items-center gap-3"
          style={{
            'border-top': '1px solid var(--color-border-secondary)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <span>
            <kbd class="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd class="font-mono">↵</kbd> attach
          </span>
          <span>
            <kbd class="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </Show>
  );
};

export default FileMentionMenu;
```

### Step 3: Create `ContextChip.tsx`

Create `src/components/conversation/ContextChip.tsx`:

```tsx
// src/components/conversation/ContextChip.tsx
// Removable file reference pill shown above the message input.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { File, X } from 'lucide-solid';
import type { ContextAttachment } from '@/lib/types';

interface ContextChipProps {
  attachment: ContextAttachment;
  onRemove: (id: string) => void;
}

const ContextChip: Component<ContextChipProps> = (props) => {
  const ref = () => props.attachment.reference;
  const displayName = () => {
    const name = ref().name;
    if (ref().start_line) {
      return `${name}:${ref().start_line}-${ref().end_line ?? ''}`;
    }
    return name;
  };
  const tokenHint = () => `~${(ref().estimated_tokens / 1000).toFixed(1)}K tokens`;

  return (
    <span
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono transition-colors"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-secondary)',
        color: 'var(--color-text-secondary)',
        'font-size': '10px',
      }}
      title={`${ref().relative_path} (${tokenHint()})`}
    >
      <File size={10} style={{ color: 'var(--color-accent)', 'flex-shrink': '0' }} />
      <span class="truncate" style={{ 'max-width': '120px' }}>
        {displayName()}
      </span>
      <button
        class="shrink-0 rounded-full hover:text-error transition-colors p-0.5"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove(props.attachment.id);
        }}
        aria-label={`Remove ${ref().name}`}
      >
        <X size={9} />
      </button>
    </span>
  );
};

export default ContextChip;
```

### Step 4: Integrate @-mention into MessageInput

In `src/components/conversation/MessageInput.tsx`, add the @-mention trigger, file menu, and chip bar. This is the most complex integration.

Add imports:

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { FileSearchResult } from '@/lib/types';
import FileMentionMenu from './FileMentionMenu';
import ContextChip from './ContextChip';
import {
  contextState,
  addFileReference,
  removeAttachment,
  clearAttachments,
  assembleContext,
  getTotalEstimatedTokens,
} from '@/stores/contextStore';
import { projectState } from '@/stores/projectStore';
```

Add state for the @-mention menu (after the existing slash state variables):

```typescript
// @-mention state
const [mentionOpen, setMentionOpen] = createSignal(false);
const [mentionResults, setMentionResults] = createSignal<FileSearchResult[]>([]);
const [mentionHighlight, setMentionHighlight] = createSignal(0);
const [mentionLoading, setMentionLoading] = createSignal(false);
let mentionSearchTimeout: ReturnType<typeof setTimeout> | null = null;
```

Update `handleInput` to detect `@` trigger alongside existing `/` trigger. After the slash detection block, add:

```typescript
// @-mention detection: `@` after whitespace or at start
const atMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
if (atMatch && projectState.activeProjectId) {
  const afterAt = atMatch[1];
  setMentionOpen(true);
  setMentionHighlight(0);

  // Debounced search
  if (mentionSearchTimeout) clearTimeout(mentionSearchTimeout);
  if (afterAt.length > 0) {
    setMentionLoading(true);
    mentionSearchTimeout = setTimeout(async () => {
      try {
        const results = await invoke<FileSearchResult[]>('search_project_files', {
          project_id: projectState.activeProjectId,
          query: afterAt,
          max_results: 10,
        });
        setMentionResults(results);
      } catch {
        setMentionResults([]);
      } finally {
        setMentionLoading(false);
      }
    }, 150);
  } else {
    setMentionResults([]);
    setMentionLoading(false);
  }
} else {
  if (mentionOpen()) {
    setMentionOpen(false);
    setMentionResults([]);
  }
}
```

Add `handleMentionSelect` function:

```typescript
function handleMentionSelect(result: FileSearchResult) {
  if (!textareaRef) return;
  const value = textareaRef.value;
  const cursorPos = textareaRef.selectionStart ?? 0;
  const textBeforeCursor = value.slice(0, cursorPos);
  // Find the @ that triggered the menu
  const match = textBeforeCursor.match(/(?:^|[\s])(@[^\s@]*)$/);
  if (!match) return;
  const atStart = textBeforeCursor.length - match[1].length;
  // Replace @query with just a space (file goes into chips, not text)
  const newValue = value.slice(0, atStart) + value.slice(cursorPos);
  setContent(newValue);
  textareaRef.value = newValue;
  textareaRef.focus();
  textareaRef.setSelectionRange(atStart, atStart);

  // Add to context
  addFileReference({
    relative_path: result.relative_path,
    name: result.name,
    extension: result.extension,
    estimated_tokens: Math.round(result.score > 0 ? 500 : 100), // rough estimate, will be refined on send
    is_directory: false,
  });

  // Fetch real token estimate
  if (projectState.activeProjectId) {
    invoke<number>('get_file_token_estimate', {
      project_id: projectState.activeProjectId,
      relative_path: result.relative_path,
    }).catch(() => {});
  }

  setMentionOpen(false);
  setMentionResults([]);
  adjustHeight();
}
```

Update `handleKeyDown` to intercept keys when @-mention menu is open. Add this block right after the existing `if (menuOpen) { ... }` block:

```typescript
// When @-mention menu is open, intercept navigation keys
if (mentionOpen()) {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    setMentionHighlight((i) => {
      const max = mentionResults().length;
      return max === 0 ? 0 : (i - 1 + max) % max;
    });
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    setMentionHighlight((i) => {
      const max = mentionResults().length;
      return max === 0 ? 0 : (i + 1) % max;
    });
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    const results = mentionResults();
    const idx = mentionHighlight();
    if (results[idx]) handleMentionSelect(results[idx]);
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    setMentionOpen(false);
    setMentionResults([]);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    const results = mentionResults();
    const idx = mentionHighlight();
    if (results[idx]) handleMentionSelect(results[idx]);
    return;
  }
}
```

Update `handleSend` to prepend context:

```typescript
async function handleSend() {
  const text = content().trim();
  if (!text || props.isLoading || props.isDisabled) return;

  // Assemble context from attached files
  const contextPrefix = await assembleContext();
  const fullMessage = contextPrefix ? contextPrefix + text : text;

  props.onSend(fullMessage);
  setContent('');
  clearAttachments();
  if (textareaRef) {
    textareaRef.value = '';
    textareaRef.style.height = '80px';
  }
}
```

Note: `handleSend` needs to become `async`. Update the Enter key handler that calls it:

```typescript
if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
  e.preventDefault();
  void handleSend();
  return;
}
if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
  e.preventDefault();
  void handleSend();
}
```

Add the `FileMentionMenu` component in the JSX, right after the `SlashCommandMenu`:

```tsx
<FileMentionMenu
  isOpen={mentionOpen()}
  results={mentionResults()}
  highlightedIndex={mentionHighlight()}
  isLoading={mentionLoading()}
  onSelect={handleMentionSelect}
  onClose={() => {
    setMentionOpen(false);
    setMentionResults([]);
  }}
/>
```

Add a chip bar above the textarea (inside the `relative max-w-4xl mx-auto` div, before the textarea):

```tsx
{
  /* Context chips */
}
<Show when={contextState.attachments.length > 0}>
  <div class="flex flex-wrap gap-1 mb-1.5">
    <For each={contextState.attachments}>
      {(attachment) => <ContextChip attachment={attachment} onRemove={removeAttachment} />}
    </For>
    <Show when={getTotalEstimatedTokens() > 0}>
      <span
        class="text-[9px] font-mono self-center"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        ~{(getTotalEstimatedTokens() / 1000).toFixed(1)}K tokens
      </span>
    </Show>
  </div>
</Show>;
```

Add `For` to the imports from `solid-js`.

### Step 5: Run verification

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

### Step 6: Commit

```bash
git add src/stores/contextStore.ts src/components/conversation/FileMentionMenu.tsx src/components/conversation/ContextChip.tsx src/components/conversation/MessageInput.tsx
git commit -m "feat: @-mention autocomplete for file context attachment (CHI-117)

Type @ in MessageInput to search project files. Selected files appear as
removable chips above the textarea. On send, file contents are loaded and
prepended as XML context. Token budget warnings at 50K, hard cap at 100K."
```

---

## Task 4: File Content Preview in DetailsPanel (CHI-118)

**Files:**

- Create: `src/components/explorer/FilePreview.tsx`
- Modify: `src/components/layout/DetailsPanel.tsx` (add File Preview section)

### Step 1: Create `FilePreview.tsx`

Create `src/components/explorer/FilePreview.tsx`:

```tsx
// src/components/explorer/FilePreview.tsx
// Syntax-highlighted file preview with line numbers.
// Shown in DetailsPanel when a file is selected in the file tree.

import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { File, Plus, Copy, Check } from 'lucide-solid';
import type { FileContent } from '@/lib/types';
import { fileState, selectFile } from '@/stores/fileStore';
import { addFileReference } from '@/stores/contextStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';

interface FilePreviewProps {
  content: FileContent;
  isLoading: boolean;
}

/** Get highlight.js language class from language name. */
function hlLanguageClass(language: string | null): string {
  if (!language) return '';
  return `language-${language}`;
}

const FilePreview: Component<FilePreviewProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const [loadedLines, setLoadedLines] = createSignal(50);
  const [fullContent, setFullContent] = createSignal<string | null>(null);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (copyTimeout) clearTimeout(copyTimeout);
  });

  const displayContent = () => fullContent() ?? props.content.content;
  const lines = () => displayContent().split('\n');
  const showLoadMore = () =>
    (!fullContent() && props.content.truncated) || props.content.line_count > loadedLines();

  async function handleLoadMore() {
    const projectId = projectState.activeProjectId;
    if (!projectId) return;
    try {
      const content = await invoke<FileContent>('read_project_file', {
        project_id: projectId,
        relative_path: props.content.relative_path,
        start_line: null,
        end_line: null,
      });
      setFullContent(content.content);
      setLoadedLines(content.line_count);
    } catch (err) {
      console.error('[FilePreview] Failed to load full file:', err);
    }
  }

  function handleAddToPrompt() {
    addFileReference({
      relative_path: props.content.relative_path,
      name: props.content.relative_path.split('/').pop() ?? '',
      extension: props.content.language,
      estimated_tokens: props.content.estimated_tokens,
      is_directory: false,
    });
    addToast({
      type: 'success',
      message: `Added ${props.content.relative_path.split('/').pop()} to prompt`,
    });
  }

  function handleCopyPath() {
    navigator.clipboard.writeText(props.content.relative_path).then(() => {
      setCopied(true);
      copyTimeout = setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div class="flex flex-col gap-2">
      {/* File header */}
      <div class="flex items-center gap-2">
        <File size={12} style={{ color: 'var(--color-accent)', 'flex-shrink': '0' }} />
        <span
          class="font-mono text-xs font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {props.content.relative_path.split('/').pop()}
        </span>
        <span class="text-[9px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          ~{(props.content.estimated_tokens / 1000).toFixed(1)}K tokens
        </span>
      </div>

      {/* Path */}
      <div class="text-[9px] font-mono truncate" style={{ color: 'var(--color-text-tertiary)' }}>
        {props.content.relative_path}
      </div>

      {/* Loading state */}
      <Show when={props.isLoading}>
        <div
          class="animate-pulse py-4 text-center text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Loading preview...
        </div>
      </Show>

      {/* Binary file */}
      <Show when={!props.isLoading && !props.content.content && props.content.size_bytes > 0}>
        <div class="py-4 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Binary file — cannot preview ({(props.content.size_bytes / 1024).toFixed(0)}KB)
        </div>
      </Show>

      {/* Code content */}
      <Show when={!props.isLoading && displayContent()}>
        <div
          class="overflow-auto rounded"
          style={{
            'max-height': '240px',
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <table
            class="w-full text-[10px] font-mono leading-relaxed"
            style={{ 'border-spacing': '0' }}
          >
            <tbody>
              {lines().map((line, i) => (
                <tr>
                  <td
                    class="select-none text-right px-2 align-top shrink-0"
                    style={{
                      color: 'var(--color-text-tertiary)',
                      opacity: '0.4',
                      width: '32px',
                      'min-width': '32px',
                      'user-select': 'none',
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    class="px-2 whitespace-pre-wrap break-all"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {line}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Load more */}
        <Show when={showLoadMore()}>
          <button
            class="text-[10px] font-mono px-2 py-1 rounded transition-colors"
            style={{
              color: 'var(--color-accent)',
              background: 'transparent',
              'transition-duration': 'var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-accent-muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={handleLoadMore}
          >
            Load full file ({props.content.line_count} lines)
          </button>
        </Show>
      </Show>

      {/* Actions */}
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            color: 'var(--color-accent)',
            background: 'var(--color-accent-muted)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={handleAddToPrompt}
        >
          <Plus size={10} />
          Add to prompt
        </button>
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={handleCopyPath}
        >
          <Show when={copied()} fallback={<Copy size={10} />}>
            <Check size={10} style={{ color: 'var(--color-success)' }} />
          </Show>
          Copy path
        </button>
      </div>
    </div>
  );
};

export default FilePreview;
```

### Step 2: Add File Preview section to DetailsPanel

In `src/components/layout/DetailsPanel.tsx`, add the File Preview section.

Add imports:

```typescript
import { fileState } from '@/stores/fileStore';
import FilePreview from '@/components/explorer/FilePreview';
```

Add the File Preview section inside the component, before the existing "Project Context" section:

```tsx
<Show when={fileState.selectedPath && fileState.previewContent}>
  <CollapsibleSection title="File Preview">
    <FilePreview content={fileState.previewContent!} isLoading={fileState.isPreviewLoading} />
  </CollapsibleSection>
</Show>;

{
  /* Empty state when no file selected but files section visible */
}
<Show when={!fileState.selectedPath && fileState.isVisible && projectState.activeProjectId}>
  <CollapsibleSection title="File Preview" defaultOpen={false}>
    <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
      Select a file from the sidebar to preview
    </p>
  </CollapsibleSection>
</Show>;
```

### Step 3: Run verification

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

### Step 4: Commit

```bash
git add src/components/explorer/FilePreview.tsx src/components/layout/DetailsPanel.tsx
git commit -m "feat: File Preview in DetailsPanel with syntax display (CHI-118)

Adds FilePreview component showing syntax-highlighted code with line numbers,
paginated loading, 'Add to prompt' and 'Copy path' actions. Integrated into
DetailsPanel as a collapsible section triggered by file tree selection."
```

---

## Task 5: Code Range Selection (CHI-119)

**Files:**

- Modify: `src/components/explorer/FilePreview.tsx` (add line selection)
- Modify: `src/components/conversation/ContextChip.tsx` (show line range)
- Modify: `src/stores/fileStore.ts` (add selectedRange state)

### Step 1: Add selection state to fileStore

In `src/stores/fileStore.ts`, add to the `FileState` interface:

```typescript
/** Selected line range for code range selection. */
selectedRange: { start: number; end: number } | null;
```

Add to initial state:

```typescript
selectedRange: null,
```

Add exported functions:

```typescript
/** Set the selected line range. */
export function setSelectedRange(range: { start: number; end: number } | null): void {
  setState('selectedRange', range);
}

/** Get estimated tokens for the selected range. */
export function getSelectedRangeTokens(): number {
  if (!state.selectedRange || !state.previewContent) return 0;
  const lines = state.previewContent.content.split('\n');
  const start = state.selectedRange.start - 1; // 0-indexed
  const end = Math.min(state.selectedRange.end, lines.length);
  const selectedText = lines.slice(start, end).join('\n');
  return Math.round(selectedText.length / 4);
}
```

### Step 2: Update FilePreview with line selection

In `src/components/explorer/FilePreview.tsx`, add line selection support.

Add imports:

```typescript
import { fileState, setSelectedRange, getSelectedRangeTokens } from '@/stores/fileStore';
```

Add selection state inside the component:

```typescript
const [selectionStart, setSelectionStart] = createSignal<number | null>(null);
const [isDragging, setIsDragging] = createSignal(false);

const selectedRange = () => fileState.selectedRange;

function handleLineMouseDown(lineNum: number, e: MouseEvent) {
  e.preventDefault();
  setSelectionStart(lineNum);
  setIsDragging(true);
  setSelectedRange({ start: lineNum, end: lineNum });
}

function handleLineMouseEnter(lineNum: number) {
  if (!isDragging()) return;
  const start = selectionStart();
  if (start == null) return;
  setSelectedRange({
    start: Math.min(start, lineNum),
    end: Math.max(start, lineNum),
  });
}

function handleMouseUp() {
  setIsDragging(false);
}

// Shift+click extends selection
function handleLineClick(lineNum: number, e: MouseEvent) {
  if (e.shiftKey && selectedRange()) {
    setSelectedRange({
      start: Math.min(selectedRange()!.start, lineNum),
      end: Math.max(selectedRange()!.end, lineNum),
    });
  }
}

function handleAddSelectionToPrompt() {
  const range = selectedRange();
  if (!range) return;
  const fileName = props.content.relative_path.split('/').pop() ?? '';
  addFileReference({
    relative_path: props.content.relative_path,
    name: fileName,
    extension: props.content.language,
    estimated_tokens: getSelectedRangeTokens(),
    start_line: range.start,
    end_line: range.end,
    is_directory: false,
  });
  addToast({ type: 'success', message: `Added ${fileName}:${range.start}-${range.end} to prompt` });
  setSelectedRange(null);
}

function clearSelection() {
  setSelectedRange(null);
}
```

Update the line number `<td>` to be clickable:

```tsx
<td
  class="select-none text-right px-2 align-top shrink-0 cursor-pointer"
  style={{
    color: 'var(--color-text-tertiary)',
    opacity: isLineSelected(i + 1) ? '1' : '0.4',
    width: '32px',
    'min-width': '32px',
    'user-select': 'none',
    background: isLineSelected(i + 1) ? 'rgba(232, 130, 90, 0.15)' : 'transparent',
  }}
  onMouseDown={(e) => handleLineMouseDown(i + 1, e)}
  onMouseEnter={() => handleLineMouseEnter(i + 1)}
  onClick={(e) => handleLineClick(i + 1, e)}
>
  {i + 1}
</td>
```

Add a helper to check if a line is in the selected range:

```typescript
function isLineSelected(lineNum: number): boolean {
  const range = selectedRange();
  if (!range) return false;
  return lineNum >= range.start && lineNum <= range.end;
}
```

Also highlight the content cell for selected lines:

```tsx
<td
  class="px-2 whitespace-pre-wrap break-all"
  style={{
    color: 'var(--color-text-secondary)',
    background: isLineSelected(i + 1) ? 'rgba(232, 130, 90, 0.08)' : 'transparent',
  }}
>
  {line}
</td>
```

Add the `mouseup` listener to the table wrapper:

```tsx
<div
  class="overflow-auto rounded"
  style={{ ... }}
  onMouseUp={handleMouseUp}
>
```

Add selection action bar below the code content (before the existing Actions div):

```tsx
<Show when={selectedRange()}>
  <div
    class="flex items-center justify-between px-2 py-1.5 rounded"
    style={{
      background: 'var(--color-accent-muted)',
      border: '1px solid rgba(232, 130, 90, 0.2)',
    }}
  >
    <span class="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
      Lines {selectedRange()!.start}-{selectedRange()!.end} selected (~{getSelectedRangeTokens()}{' '}
      tokens)
    </span>
    <div class="flex items-center gap-1.5">
      <button
        class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
        style={{
          color: 'white',
          background: 'var(--color-accent)',
          'transition-duration': 'var(--duration-fast)',
        }}
        onClick={handleAddSelectionToPrompt}
      >
        <Plus size={9} />
        Add selection
      </button>
      <button
        class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
        style={{
          color: 'var(--color-text-tertiary)',
          'transition-duration': 'var(--duration-fast)',
        }}
        onClick={clearSelection}
      >
        Clear
      </button>
    </div>
  </div>
</Show>
```

### Step 3: Update ContextChip to show line range

The ContextChip already handles line ranges via the `displayName()` function:

```typescript
const displayName = () => {
  const name = ref().name;
  if (ref().start_line) {
    return `${name}:${ref().start_line}-${ref().end_line ?? ''}`;
  }
  return name;
};
```

This already works — no changes needed.

### Step 4: Run verification

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

### Step 5: Final full build verification

Run:

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings
npx tsc --noEmit && npx eslint . && npx vite build
```

Expected: All Rust tests pass (134+), no clippy warnings, TypeScript clean, ESLint clean, Vite build succeeds

### Step 6: Commit

```bash
git add src/components/explorer/FilePreview.tsx src/stores/fileStore.ts
git commit -m "feat: code range selection in FilePreview (CHI-119)

Click/drag line numbers to select ranges. Shift+click extends selection.
Selected ranges show token estimate and 'Add selection to prompt' button.
Context chips display line ranges (e.g., parser.rs:42-46)."
```

---

## Verification Checklist

1. `cargo check` — Rust compiles
2. `cargo test` — All tests pass (118 existing + 16+ new = 134+)
3. `cargo clippy -- -D warnings` — No warnings
4. `npx tsc --noEmit` — TypeScript clean
5. `npx eslint .` — No lint errors
6. `npx vite build` — Build succeeds
7. Manual test — File tree:
   - Open a project → sidebar shows Files section → tree loads root
   - Click folder → expands with children → click file → preview in DetailsPanel
   - Search "main" → results show matching files
8. Manual test — @-mention:
   - Type `@` in MessageInput → file search dropdown appears
   - Select file → chip appears above textarea
   - Send message → context XML prepended to message
   - Token count shown, warning at 50K
9. Manual test — File preview:
   - Select file in tree → DetailsPanel shows code with line numbers
   - "Add to prompt" → chip appears in MessageInput
   - "Load full file" → shows all lines
10. Manual test — Range selection:
    - Click line number → single line highlighted
    - Drag across lines → range highlighted
    - "Add selection" → chip shows `file.rs:12-25`
