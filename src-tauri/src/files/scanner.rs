//! Gitignore-aware filesystem scanner using the `ignore` crate.
//! Provides directory listing, file reading, and fuzzy name search.

use std::io::{BufRead, Read};
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

/// Canonicalize an existing path and ensure it stays within the project root.
/// This blocks `..` traversal and symlink escapes for file operations.
fn ensure_within_project_root(
    project_root: &Path,
    path: &Path,
    display_path: &str,
) -> Result<PathBuf, AppError> {
    let root = std::fs::canonicalize(project_root)?;
    let resolved = std::fs::canonicalize(path)?;
    if !resolved.starts_with(&root) {
        return Err(AppError::Other(format!(
            "Path escapes project root: {}",
            display_path
        )));
    }
    Ok(resolved)
}

/// Count lines in a UTF-8 text file without loading the entire file into memory.
fn count_lines(path: &Path) -> Result<usize, AppError> {
    let file = std::fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);
    let mut count = 0usize;
    for line in reader.lines() {
        line?;
        count += 1;
    }
    Ok(count)
}

/// Read at most `max_bytes` and convert safely to UTF-8, even if truncated mid-char.
fn read_limited_text(path: &Path, max_bytes: u64) -> Result<String, AppError> {
    let file = std::fs::File::open(path)?;
    let mut buf = Vec::new();
    file.take(max_bytes).read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

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
    tracing::debug!(
        root = %project_root.display(),
        relative_path = ?relative_path,
        max_depth = ?max_depth,
        "listing project files"
    );
    let scan_root = match relative_path {
        Some(rel) if !rel.is_empty() => project_root.join(rel),
        _ => project_root.to_path_buf(),
    };

    if !scan_root.exists() {
        return Ok(Vec::new());
    }

    ensure_within_project_root(project_root, &scan_root, relative_path.unwrap_or("."))?;

    let depth = max_depth.unwrap_or(1);
    let mut entries: Vec<FileNode> = Vec::new();

    // Build a walker that respects .gitignore from the project root
    let walker = ignore::WalkBuilder::new(&scan_root)
        .max_depth(Some(depth))
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| {
            if let Some(name) = entry.file_name().to_str() {
                if entry.file_type().is_some_and(|ft| ft.is_dir()) && ALWAYS_SKIP.contains(&name) {
                    return false;
                }
            }
            true
        })
        .sort_by_file_path(|a, b| {
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

        let rel_path = match entry.path().strip_prefix(project_root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = entry.file_name().to_str().unwrap_or("?").to_string();

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

        // Binary detection — only read first 8KB for the check
        let is_bin = if node_type == FileNodeType::File && metadata.len() > 0 {
            let mut buf = vec![0u8; 8192.min(metadata.len() as usize)];
            match std::fs::File::open(entry.path())
                .and_then(|mut f| std::io::Read::read(&mut f, &mut buf))
            {
                Ok(n) => is_binary(&buf[..n]),
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

    tracing::debug!(
        root = %project_root.display(),
        relative_path = ?relative_path,
        returned_entries = entries.len(),
        "listed project files"
    );
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
    tracing::debug!(
        root = %project_root.display(),
        relative_path = %relative_path,
        start_line = ?start_line,
        end_line = ?end_line,
        "reading project file"
    );
    let full_path = project_root.join(relative_path);

    if !full_path.exists() {
        return Err(AppError::Other(format!(
            "File not found: {}",
            relative_path
        )));
    }

    let safe_path = ensure_within_project_root(project_root, &full_path, relative_path)?;
    let metadata = std::fs::metadata(&safe_path)?;
    let size_bytes = metadata.len();

    // Binary check — read first 8KB
    if size_bytes > 0 {
        let mut buf = vec![0u8; 8192.min(size_bytes as usize)];
        if let Ok(n) =
            std::fs::File::open(&safe_path).and_then(|mut f| std::io::Read::read(&mut f, &mut buf))
        {
            if is_binary(&buf[..n]) {
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
    }

    let truncated = size_bytes > MAX_READ_BYTES;
    let (content, total_lines) = match (start_line, end_line) {
        (Some(_), _) | (None, Some(_)) => {
            let file = std::fs::File::open(&safe_path)?;
            let reader = std::io::BufReader::new(file);
            let mut selected = Vec::new();
            let mut line_no = 0usize;

            for line in reader.lines() {
                let line = line?;
                line_no += 1;

                let include = match (start_line, end_line) {
                    (Some(start), Some(end)) => line_no >= start && line_no < end,
                    (Some(start), None) => line_no >= start,
                    (None, Some(end)) => line_no <= end,
                    (None, None) => false,
                };

                if include {
                    selected.push(line);
                }
            }

            (selected.join("\n"), line_no)
        }
        (None, None) if truncated => {
            let content = read_limited_text(&safe_path, MAX_READ_BYTES)?;
            let total_lines = count_lines(&safe_path)?;
            (content, total_lines)
        }
        (None, None) => {
            let raw_content = std::fs::read_to_string(&safe_path)?;
            let total_lines = raw_content.lines().count();
            (raw_content, total_lines)
        }
    };

    let extension = full_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let language = detect_language(extension);
    let estimated_tokens = content.len() / 4;

    tracing::debug!(
        relative_path = %relative_path,
        total_lines,
        truncated,
        estimated_tokens,
        "read project file"
    );

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
pub fn search_files(
    project_root: &Path,
    query: &str,
    max_results: Option<usize>,
) -> Result<Vec<FileSearchResult>, AppError> {
    tracing::debug!(
        root = %project_root.display(),
        query = %query,
        max_results = ?max_results,
        "searching project files"
    );
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
                if entry.file_type().is_some_and(|ft| ft.is_dir()) && ALWAYS_SKIP.contains(&name) {
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

        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }

        let name = entry.file_name().to_str().unwrap_or("").to_string();
        let name_lower = name.to_lowercase();

        let rel_path = match entry.path().strip_prefix(project_root) {
            Ok(r) => r.to_string_lossy().to_string(),
            Err(_) => continue,
        };
        let rel_lower = rel_path.to_lowercase();

        let score = if name_lower == query_lower {
            1.0
        } else if name_lower.starts_with(&query_lower) {
            0.9
        } else if name_lower.contains(&query_lower) {
            0.7
        } else if rel_lower.contains(&query_lower) {
            0.4
        } else {
            continue;
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

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.cmp(&b.name))
    });

    results.truncate(limit);
    tracing::debug!(query = %query, result_count = results.len(), "searched project files");
    Ok(results)
}

/// Estimate token count for a file (~chars/4).
pub fn estimate_tokens(project_root: &Path, relative_path: &str) -> Result<usize, AppError> {
    tracing::debug!(
        root = %project_root.display(),
        relative_path = %relative_path,
        "estimating file tokens"
    );
    let full_path = project_root.join(relative_path);
    let safe_path = ensure_within_project_root(project_root, &full_path, relative_path)?;
    let metadata = std::fs::metadata(&safe_path)?;
    Ok(metadata.len() as usize / 4)
}

/// Open a file in the system default app/editor after validating path containment.
pub fn open_file_in_system(project_root: &Path, relative_path: &str) -> Result<(), AppError> {
    tracing::debug!(
        root = %project_root.display(),
        relative_path = %relative_path,
        "opening project file in system app"
    );

    let full_path = project_root.join(relative_path);
    let safe_path = ensure_within_project_root(project_root, &full_path, relative_path)?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&safe_path)
            .spawn()
            .map_err(AppError::from)?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&safe_path)
            .spawn()
            .map_err(AppError::from)?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&safe_path)
            .spawn()
            .map_err(AppError::from)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_test_project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
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
        fs::write(dir.path().join(".git/objects/abc"), "git object data").unwrap();
        fs::write(dir.path().join(".gitignore"), "*.log\n").unwrap();
        fs::write(dir.path().join("debug.log"), "log data").unwrap();
        dir
    }

    #[test]
    fn list_files_returns_project_root_entries() {
        let project = create_test_project();
        let result = list_files(project.path(), None, Some(1)).unwrap();
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
    fn list_files_rejects_path_traversal() {
        let base = tempfile::tempdir().unwrap();
        let project_dir = base.path().join("project");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(base.path().join("outside.txt"), "secret").unwrap();

        let result = list_files(&project_dir, Some(".."), Some(1));
        assert!(result.is_err());
    }

    #[test]
    fn list_files_directories_sorted_first() {
        let project = create_test_project();
        let result = list_files(project.path(), None, Some(1)).unwrap();
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
    fn read_file_end_line_without_start_returns_first_n_lines() {
        let project = create_test_project();
        let content = "line1\nline2\nline3\nline4\n";
        fs::write(project.path().join("multi2.txt"), content).unwrap();

        let result = read_file(project.path(), "multi2.txt", None, Some(3)).unwrap();
        assert_eq!(result.content, "line1\nline2\nline3");
    }

    #[test]
    fn read_file_not_found() {
        let project = create_test_project();
        let result = read_file(project.path(), "nonexistent.txt", None, None);
        assert!(result.is_err());
    }

    #[test]
    fn read_file_rejects_path_traversal() {
        let base = tempfile::tempdir().unwrap();
        let project_dir = base.path().join("project");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(project_dir.join("inside.txt"), "ok").unwrap();
        fs::write(base.path().join("outside.txt"), "secret").unwrap();

        let result = read_file(&project_dir, "../outside.txt", None, None);
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
        assert!(!results.iter().any(|r| r.name == "debug.log"));
    }

    #[test]
    fn search_files_skips_always_skip_dirs() {
        let project = create_test_project();
        let results = search_files(project.path(), "index", None).unwrap();
        assert!(!results
            .iter()
            .any(|r| r.relative_path.contains("node_modules")));
    }

    #[test]
    fn search_files_exact_match_scores_highest() {
        let project = create_test_project();
        let results = search_files(project.path(), "README.md", None).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].score, 1.0);
    }

    #[test]
    fn estimate_tokens_returns_reasonable_value() {
        let project = create_test_project();
        let tokens = estimate_tokens(project.path(), "src/main.rs").unwrap();
        assert_eq!(tokens, 3);
    }

    #[test]
    fn estimate_tokens_rejects_path_traversal() {
        let base = tempfile::tempdir().unwrap();
        let project_dir = base.path().join("project");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(base.path().join("outside.txt"), "secret").unwrap();

        let result = estimate_tokens(&project_dir, "../outside.txt");
        assert!(result.is_err());
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
