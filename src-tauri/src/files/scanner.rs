//! Gitignore-aware filesystem scanner using the `ignore` crate.
//! Provides directory listing, file reading, and fuzzy name search.

use std::collections::HashSet;
use std::ffi::OsStr;
use std::io::{BufRead, Read};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

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

/// A code symbol found by regex pattern scanning.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SymbolMatch {
    pub name: String,
    pub kind: String,       // function | class | variable
    pub file_path: String,  // relative to root, forward-slash separated
    pub line_number: usize, // 1-indexed
    pub snippet: String,    // up to 20 lines starting at declaration
    pub estimated_tokens: usize,
}

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

/// Normalize path components without requiring the full path to exist.
fn normalize_path(path: &Path) -> PathBuf {
    use std::path::Component;

    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(seg) => out.push(seg),
        }
    }
    out
}

/// Validate that a path resolves within the project root (path traversal prevention).
fn validate_path_within_root(path: &Path, root: &Path) -> Result<(), AppError> {
    let root_resolved = root.canonicalize()?;
    let absolute_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    };

    let resolved = if absolute_path.exists() {
        absolute_path.canonicalize()?
    } else {
        // Resolve via nearest existing ancestor to catch symlink escapes.
        let mut ancestor = absolute_path.clone();
        let mut suffix: Vec<std::ffi::OsString> = Vec::new();
        while !ancestor.exists() {
            let name = ancestor
                .file_name()
                .ok_or_else(|| AppError::InvalidPath)?
                .to_os_string();
            suffix.push(name);
            if !ancestor.pop() {
                return Err(AppError::InvalidPath);
            }
        }
        let mut rebuilt = ancestor.canonicalize()?;
        for segment in suffix.iter().rev() {
            rebuilt.push(segment);
        }
        normalize_path(&rebuilt)
    };

    if !resolved.starts_with(&root_resolved) {
        return Err(AppError::PathTraversal(path.display().to_string()));
    }
    Ok(())
}

/// Validate that a filename doesn't contain reserved names or invalid characters.
fn validate_filename(name: &OsStr) -> Result<(), AppError> {
    let name_str = name.to_string_lossy();
    if name_str.trim().is_empty() {
        return Err(AppError::InvalidFileName("empty filename".to_string()));
    }
    if name_str == "." || name_str == ".." {
        return Err(AppError::InvalidFileName(format!(
            "invalid filename segment: {}",
            name_str
        )));
    }

    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3", "LPT4",
    ];
    let upper = name_str.to_uppercase();
    let stem = upper.split('.').next().unwrap_or(&upper);
    if reserved.contains(&stem) {
        return Err(AppError::InvalidFileName(format!(
            "reserved name: {}",
            name_str
        )));
    }

    let invalid_chars = ['<', '>', ':', '"', '|', '?', '*', '\0'];
    if name_str
        .chars()
        .any(|ch| invalid_chars.contains(&ch) || ch.is_control())
    {
        return Err(AppError::InvalidFileName(format!(
            "invalid characters in: {}",
            name_str
        )));
    }

    Ok(())
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
    show_ignored: bool,
) -> Result<Vec<FileNode>, AppError> {
    tracing::debug!(
        root = %project_root.display(),
        relative_path = ?relative_path,
        max_depth = ?max_depth,
        show_ignored,
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

    let non_ignored_set: HashSet<String> = if show_ignored {
        let clean_walker = ignore::WalkBuilder::new(&scan_root)
            .max_depth(Some(depth))
            .hidden(false)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .filter_entry(|entry| {
                if let Some(name) = entry.file_name().to_str() {
                    if entry.file_type().is_some_and(|ft| ft.is_dir())
                        && ALWAYS_SKIP.contains(&name)
                    {
                        return false;
                    }
                }
                true
            })
            .build();

        clean_walker
            .filter_map(|result| result.ok())
            .filter(|entry| entry.path() != scan_root)
            .filter_map(|entry| {
                entry
                    .path()
                    .strip_prefix(project_root)
                    .ok()
                    .map(|relative| relative.to_string_lossy().replace('\\', "/"))
            })
            .collect()
    } else {
        HashSet::new()
    };

    // Build a walker that respects .gitignore from the project root
    let walker = ignore::WalkBuilder::new(&scan_root)
        .max_depth(Some(depth))
        .hidden(false)
        .git_ignore(!show_ignored)
        .git_global(!show_ignored)
        .git_exclude(!show_ignored)
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
        let is_ignored = show_ignored && !non_ignored_set.contains(&rel_path);

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
            is_git_ignored: is_ignored,
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
    let is_readonly = metadata.permissions().readonly();
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|timestamp| timestamp.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64);

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
                    is_readonly,
                    modified_at_ms,
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
        is_readonly,
        modified_at_ms,
    })
}

/// Write `content` to `relative_path` within `project_root`.
/// Validates path containment. Creates/overwrites the file atomically on most platforms.
pub fn write_file(project_root: &Path, relative_path: &str, content: &str) -> Result<(), AppError> {
    tracing::debug!(
        root = %project_root.display(),
        relative_path = %relative_path,
        content_bytes = content.len(),
        "writing project file"
    );

    let full_path = project_root.join(relative_path);
    let parent = full_path
        .parent()
        .ok_or_else(|| AppError::Other(format!("Invalid path (no parent): {}", relative_path)))?;

    // Parent must exist. Canonicalize it (not the file -- it may not exist yet).
    if !parent.exists() {
        return Err(AppError::Other(format!(
            "Parent directory does not exist: {}",
            relative_path
        )));
    }
    let safe_parent = std::fs::canonicalize(parent)?;
    let root = std::fs::canonicalize(project_root)?;
    if !safe_parent.starts_with(&root) {
        return Err(AppError::Other(format!(
            "Path escapes project root: {}",
            relative_path
        )));
    }

    std::fs::write(&full_path, content).map_err(AppError::from)?;
    tracing::debug!(relative_path = %relative_path, "wrote project file");
    Ok(())
}

/// Create a new file at the given relative path within the project root.
/// Creates parent directories as needed.
pub fn create_file(
    project_root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<FileNode, AppError> {
    let full_path = project_root.join(relative_path);
    validate_path_within_root(&full_path, project_root)?;

    let name = full_path.file_name().ok_or(AppError::InvalidPath)?;
    validate_filename(name)?;

    if full_path.exists() {
        return Err(AppError::FileAlreadyExists(relative_path.to_string()));
    }

    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full_path, content)?;

    Ok(FileNode {
        name: full_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        relative_path: relative_path.replace('\\', "/"),
        node_type: FileNodeType::File,
        size_bytes: Some(content.len() as u64),
        extension: full_path
            .extension()
            .map(|value| value.to_string_lossy().to_string()),
        children: None,
        is_binary: false,
        is_git_ignored: false,
    })
}

/// Create a new directory at the given relative path.
pub fn create_directory(project_root: &Path, relative_path: &str) -> Result<FileNode, AppError> {
    let full_path = project_root.join(relative_path);
    validate_path_within_root(&full_path, project_root)?;

    let name = full_path.file_name().ok_or(AppError::InvalidPath)?;
    validate_filename(name)?;

    if full_path.exists() {
        return Err(AppError::FileAlreadyExists(relative_path.to_string()));
    }

    std::fs::create_dir_all(&full_path)?;

    Ok(FileNode {
        name: full_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        relative_path: relative_path.replace('\\', "/"),
        node_type: FileNodeType::Directory,
        size_bytes: None,
        extension: None,
        children: Some(Vec::new()),
        is_binary: false,
        is_git_ignored: false,
    })
}

/// Delete a file or directory. Uses OS trash when `use_trash` is true.
pub fn delete_file(
    project_root: &Path,
    relative_path: &str,
    use_trash: bool,
) -> Result<(), AppError> {
    let full_path = project_root.join(relative_path);
    validate_path_within_root(&full_path, project_root)?;

    if !full_path.exists() {
        return Err(AppError::FileNotFound(relative_path.to_string()));
    }

    if use_trash {
        trash::delete(&full_path).map_err(|err| AppError::TrashError(err.to_string()))?;
    } else if full_path.is_dir() {
        std::fs::remove_dir_all(&full_path)?;
    } else {
        std::fs::remove_file(&full_path)?;
    }

    Ok(())
}

/// Rename or move a file/folder within the project.
pub fn rename_file(
    project_root: &Path,
    old_path: &str,
    new_path: &str,
) -> Result<FileNode, AppError> {
    let old_full = project_root.join(old_path);
    let new_full = project_root.join(new_path);

    validate_path_within_root(&old_full, project_root)?;
    validate_path_within_root(&new_full, project_root)?;

    if !old_full.exists() {
        return Err(AppError::FileNotFound(old_path.to_string()));
    }
    if new_full.exists() {
        return Err(AppError::FileAlreadyExists(new_path.to_string()));
    }

    let new_name = new_full.file_name().ok_or(AppError::InvalidPath)?;
    validate_filename(new_name)?;

    if let Some(parent) = new_full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(&old_full, &new_full)?;

    let is_dir = new_full.is_dir();
    Ok(FileNode {
        name: new_full
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        relative_path: new_path.replace('\\', "/"),
        node_type: if is_dir {
            FileNodeType::Directory
        } else {
            FileNodeType::File
        },
        size_bytes: if is_dir {
            None
        } else {
            std::fs::metadata(&new_full).ok().map(|meta| meta.len())
        },
        extension: new_full
            .extension()
            .map(|value| value.to_string_lossy().to_string()),
        children: if is_dir { Some(Vec::new()) } else { None },
        is_binary: false,
        is_git_ignored: false,
    })
}

/// Duplicate a file in the same directory with "(copy)" suffix.
pub fn duplicate_file(project_root: &Path, relative_path: &str) -> Result<FileNode, AppError> {
    let full_path = project_root.join(relative_path);
    validate_path_within_root(&full_path, project_root)?;

    if !full_path.exists() {
        return Err(AppError::FileNotFound(relative_path.to_string()));
    }
    if full_path.is_dir() {
        return Err(AppError::InvalidOperation(
            "Can only duplicate files".to_string(),
        ));
    }

    let stem = full_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = full_path
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    let parent = full_path.parent().ok_or(AppError::InvalidPath)?;

    let mut copy_path = parent.join(format!("{stem} (copy){ext}"));
    let mut counter = 2usize;
    while copy_path.exists() {
        copy_path = parent.join(format!("{stem} (copy {counter}){ext}"));
        counter += 1;
    }
    std::fs::copy(&full_path, &copy_path)?;
    let relative_copy = copy_path
        .strip_prefix(project_root)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| copy_path.to_string_lossy().replace('\\', "/"));

    Ok(FileNode {
        name: copy_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        relative_path: relative_copy,
        node_type: FileNodeType::File,
        size_bytes: std::fs::metadata(&copy_path).ok().map(|meta| meta.len()),
        extension: copy_path
            .extension()
            .map(|value| value.to_string_lossy().to_string()),
        children: None,
        is_binary: false,
        is_git_ignored: false,
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
    let query_path_normalized = query_lower.replace('\\', "/");
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
        let rel_path = rel_path.replace('\\', "/");
        let rel_lower = rel_path.to_lowercase();
        let rel_lower_normalized = rel_lower.clone();

        let score = if name_lower == query_lower {
            1.0
        } else if name_lower.starts_with(&query_lower) {
            0.9
        } else if name_lower.contains(&query_lower) {
            0.7
        } else if rel_lower.contains(&query_lower)
            || rel_lower_normalized.contains(&query_path_normalized)
        {
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

fn ts_symbol_patterns(kind: &str) -> Vec<(&'static regex::Regex, &'static str)> {
    static FN_KEYWORD: OnceLock<regex::Regex> = OnceLock::new();
    static FN_ARROW: OnceLock<regex::Regex> = OnceLock::new();
    static CLASS: OnceLock<regex::Regex> = OnceLock::new();
    static VAR_EXPORT: OnceLock<regex::Regex> = OnceLock::new();

    let fn_kw = FN_KEYWORD.get_or_init(|| {
        regex::Regex::new(r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)").expect("valid regex")
    });
    let fn_arr = FN_ARROW.get_or_init(|| {
        regex::Regex::new(r"^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(")
            .expect("valid regex")
    });
    let cls = CLASS.get_or_init(|| {
        regex::Regex::new(r"^(?:export\s+)?(?:default\s+)?class\s+(\w+)").expect("valid regex")
    });
    let var = VAR_EXPORT.get_or_init(|| {
        regex::Regex::new(r"^export\s+(?:const|let)\s+(\w+)\s*[=:]").expect("valid regex")
    });

    let want_fn = kind == "all" || kind == "function";
    let want_cls = kind == "all" || kind == "class";
    let want_var = kind == "all" || kind == "variable";

    let mut patterns: Vec<(&'static regex::Regex, &'static str)> = Vec::new();
    if want_fn {
        patterns.push((fn_kw, "function"));
        patterns.push((fn_arr, "function"));
    }
    if want_cls {
        patterns.push((cls, "class"));
    }
    if want_var {
        patterns.push((var, "variable"));
    }
    patterns
}

fn rs_symbol_patterns(kind: &str) -> Vec<(&'static regex::Regex, &'static str)> {
    static FN: OnceLock<regex::Regex> = OnceLock::new();
    static STRUCT: OnceLock<regex::Regex> = OnceLock::new();
    static CONST: OnceLock<regex::Regex> = OnceLock::new();

    let fn_re = FN.get_or_init(|| {
        regex::Regex::new(r"^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)").expect("valid regex")
    });
    let struct_re = STRUCT
        .get_or_init(|| regex::Regex::new(r"^(?:pub\s+)?struct\s+(\w+)").expect("valid regex"));
    let const_re = CONST.get_or_init(|| {
        regex::Regex::new(r"^(?:pub\s+)?const\s+([A-Z_][A-Z0-9_]*)").expect("valid regex")
    });

    let want_fn = kind == "all" || kind == "function";
    let want_cls = kind == "all" || kind == "class";
    let want_var = kind == "all" || kind == "variable";

    let mut patterns: Vec<(&'static regex::Regex, &'static str)> = Vec::new();
    if want_fn {
        patterns.push((fn_re, "function"));
    }
    if want_cls {
        patterns.push((struct_re, "class"));
    }
    if want_var {
        patterns.push((const_re, "variable"));
    }
    patterns
}

fn py_symbol_patterns(kind: &str) -> Vec<(&'static regex::Regex, &'static str)> {
    static FN: OnceLock<regex::Regex> = OnceLock::new();
    static CLS: OnceLock<regex::Regex> = OnceLock::new();

    let fn_re =
        FN.get_or_init(|| regex::Regex::new(r"^(?:async\s+)?def\s+(\w+)").expect("valid regex"));
    let cls_re = CLS.get_or_init(|| regex::Regex::new(r"^class\s+(\w+)").expect("valid regex"));

    let want_fn = kind == "all" || kind == "function";
    let want_cls = kind == "all" || kind == "class";

    let mut patterns: Vec<(&'static regex::Regex, &'static str)> = Vec::new();
    if want_fn {
        patterns.push((fn_re, "function"));
    }
    if want_cls {
        patterns.push((cls_re, "class"));
    }
    patterns
}

/// Scan source files for symbols by regex, filtered by kind/query.
/// Returns at most 20 matches.
pub fn scan_symbols(root: &Path, query: &str, kind: &str) -> Result<Vec<SymbolMatch>, AppError> {
    use ignore::WalkBuilder;

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    'walk: for entry in WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build()
    {
        let entry = match entry {
            Ok(value) => value,
            Err(err) => return Err(AppError::Other(err.to_string())),
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        let patterns: Vec<(&'static regex::Regex, &'static str)> = match ext {
            "ts" | "tsx" | "js" | "jsx" => ts_symbol_patterns(kind),
            "rs" => rs_symbol_patterns(kind),
            "py" => py_symbol_patterns(kind),
            _ => continue,
        };
        if patterns.is_empty() {
            continue;
        }

        let content = match std::fs::read_to_string(path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let lines: Vec<&str> = content.lines().collect();
        let relative = path
            .strip_prefix(root)
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"));

        for (line_idx, line) in lines.iter().enumerate() {
            for (pattern, symbol_kind) in &patterns {
                let Some(caps) = pattern.captures(line) else {
                    continue;
                };
                let Some(symbol_name) = caps.get(1).map(|value| value.as_str().to_string()) else {
                    continue;
                };
                if symbol_name.is_empty() {
                    continue;
                }
                if !query.is_empty() && !symbol_name.to_lowercase().contains(&query_lower) {
                    continue;
                }

                let end = (line_idx + 20).min(lines.len());
                let snippet = lines[line_idx..end].join("\n");
                results.push(SymbolMatch {
                    name: symbol_name,
                    kind: (*symbol_kind).to_string(),
                    file_path: relative.clone(),
                    line_number: line_idx + 1,
                    estimated_tokens: snippet.len() / 4,
                    snippet,
                });

                if results.len() >= 20 {
                    break 'walk;
                }
            }
        }
    }

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
        let result = list_files(project.path(), None, Some(1), false).unwrap();
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
    fn list_files_show_ignored_reveals_gitignored_files_and_marks_them() {
        let project = create_test_project();

        let default_result = list_files(project.path(), None, Some(1), false).unwrap();
        assert!(!default_result.iter().any(|node| node.name == "debug.log"));

        let show_ignored_result = list_files(project.path(), None, Some(1), true).unwrap();
        let ignored_node = show_ignored_result
            .iter()
            .find(|node| node.name == "debug.log");
        assert!(
            ignored_node.is_some(),
            "debug.log should appear when show_ignored=true"
        );
        assert!(
            ignored_node
                .expect("debug.log should be present")
                .is_git_ignored,
            "debug.log should be marked as gitignored"
        );

        let readme = show_ignored_result
            .iter()
            .find(|node| node.name == "README.md")
            .expect("README should be present");
        assert!(!readme.is_git_ignored);
    }

    #[test]
    fn list_files_subdirectory() {
        let project = create_test_project();
        let result = list_files(project.path(), Some("src"), Some(1), false).unwrap();
        let names: Vec<&str> = result.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"main.rs"));
        assert!(names.contains(&"lib"));
    }

    #[test]
    fn list_files_nonexistent_returns_empty() {
        let project = create_test_project();
        let result = list_files(project.path(), Some("nonexistent"), Some(1), false).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn list_files_rejects_path_traversal() {
        let base = tempfile::tempdir().unwrap();
        let project_dir = base.path().join("project");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(base.path().join("outside.txt"), "secret").unwrap();

        let result = list_files(&project_dir, Some(".."), Some(1), false);
        assert!(result.is_err());
    }

    #[test]
    fn list_files_directories_sorted_first() {
        let project = create_test_project();
        let result = list_files(project.path(), None, Some(1), false).unwrap();
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
    fn write_file_creates_and_reads_back() {
        let project = create_test_project();
        write_file(project.path(), "src/new-file.ts", "export const x = 1;\n").unwrap();
        let content = std::fs::read_to_string(project.path().join("src/new-file.ts")).unwrap();
        assert_eq!(content, "export const x = 1;\n");
    }

    #[test]
    fn write_file_overwrites_existing() {
        let project = create_test_project();
        write_file(project.path(), "README.md", "Updated\n").unwrap();
        let content = std::fs::read_to_string(project.path().join("README.md")).unwrap();
        assert_eq!(content, "Updated\n");
    }

    #[test]
    fn write_file_rejects_path_traversal() {
        let base = tempfile::tempdir().unwrap();
        let project_dir = base.path().join("project");
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::create_dir_all(project_dir.join("src")).unwrap();
        let result = write_file(&project_dir, "../outside.txt", "evil");
        assert!(result.is_err(), "Should reject path traversal");
    }

    #[test]
    fn write_file_rejects_nonexistent_parent_dir() {
        let project = create_test_project();
        let result = write_file(project.path(), "no-such-dir/file.txt", "content");
        assert!(result.is_err());
    }

    #[test]
    fn read_file_exposes_is_readonly_flag() {
        let project = create_test_project();
        let result = read_file(project.path(), "README.md", None, None).unwrap();
        // Regular file in a temp dir should NOT be readonly
        assert!(!result.is_readonly, "README.md should not be readonly");
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
        let results = search_files(project.path(), "src/main", None).unwrap();
        assert!(!results.is_empty());
        assert!(results.iter().any(|r| r.name == "main.rs"));
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
    fn search_files_returns_empty_for_no_match() {
        let project = create_test_project();
        let results = search_files(project.path(), "nonexistent_xyz", Some(10)).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn search_files_respects_max_results_limit() {
        let project = create_test_project();
        fs::write(project.path().join("alpha-one.txt"), "a").unwrap();
        fs::write(project.path().join("alpha-two.txt"), "a").unwrap();
        fs::write(project.path().join("alpha-three.txt"), "a").unwrap();

        let results = search_files(project.path(), "alpha", Some(2)).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn search_files_normalizes_windows_style_query_paths() {
        let project = create_test_project();
        let results = search_files(project.path(), "src\\main", None).unwrap();
        assert!(!results.is_empty());
        assert!(results
            .iter()
            .any(|r| r.relative_path.ends_with("src/main.rs")));
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
    fn read_file_start_line_without_end_returns_tail() {
        let project = create_test_project();
        let content = "line1\nline2\nline3\nline4\n";
        fs::write(project.path().join("multi3.txt"), content).unwrap();

        let result = read_file(project.path(), "multi3.txt", Some(3), None).unwrap();
        assert_eq!(result.content, "line3\nline4");
        assert_eq!(result.line_count, 4);
    }

    #[test]
    fn read_file_large_file_sets_truncated_flag() {
        let project = create_test_project();
        let large = "x".repeat((MAX_READ_BYTES as usize) + 4096);
        fs::write(project.path().join("large.txt"), large).unwrap();

        let result = read_file(project.path(), "large.txt", None, None).unwrap();
        assert!(result.truncated);
        assert!(result.content.len() <= MAX_READ_BYTES as usize);
        assert_eq!(result.line_count, 1);
    }

    #[test]
    fn is_binary_detects_null_bytes() {
        assert!(is_binary(&[0x89, 0x50, 0x4E, 0x47, 0x00]));
        assert!(!is_binary(b"Hello world"));
    }

    #[test]
    fn validate_path_within_root_allows_valid() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src")).expect("create src");
        let child = root.join("src/main.rs");
        assert!(validate_path_within_root(&child, root).is_ok());
    }

    #[test]
    fn validate_path_within_root_rejects_traversal() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let root = tmp.path().join("root");
        std::fs::create_dir_all(&root).expect("create root");
        let escaped = root.join("../../etc/passwd");
        assert!(validate_path_within_root(&escaped, &root).is_err());
    }

    #[test]
    fn validate_filename_allows_valid() {
        assert!(validate_filename(OsStr::new("main.rs")).is_ok());
        assert!(validate_filename(OsStr::new("my-file.test.ts")).is_ok());
    }

    #[test]
    fn validate_filename_rejects_reserved() {
        assert!(validate_filename(OsStr::new("CON")).is_err());
        assert!(validate_filename(OsStr::new("NUL.txt")).is_err());
    }

    #[test]
    fn validate_filename_rejects_invalid_chars() {
        assert!(validate_filename(OsStr::new("file<>.rs")).is_err());
        assert!(validate_filename(OsStr::new("file?.rs")).is_err());
    }

    #[test]
    fn validate_filename_rejects_empty() {
        assert!(validate_filename(OsStr::new("")).is_err());
        assert!(validate_filename(OsStr::new("   ")).is_err());
    }

    #[test]
    fn create_file_basic() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let node = create_file(tmp.path(), "hello.txt", "content").expect("create file");
        assert_eq!(node.name, "hello.txt");
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("hello.txt")).expect("read"),
            "content"
        );
    }

    #[test]
    fn create_file_with_nested_dirs() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let node = create_file(tmp.path(), "src/lib/util.rs", "fn main() {}").expect("create file");
        assert_eq!(node.relative_path, "src/lib/util.rs");
        assert!(tmp.path().join("src/lib/util.rs").exists());
    }

    #[test]
    fn create_file_rejects_existing() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::write(tmp.path().join("exists.txt"), "data").expect("seed");
        let result = create_file(tmp.path(), "exists.txt", "new");
        assert!(result.is_err());
    }

    #[test]
    fn create_file_rejects_traversal() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let result = create_file(tmp.path(), "../escape.txt", "bad");
        assert!(result.is_err());
    }

    #[test]
    fn create_directory_basic() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let node = create_directory(tmp.path(), "new-dir").expect("create dir");
        assert_eq!(node.name, "new-dir");
        assert!(tmp.path().join("new-dir").is_dir());
    }

    #[test]
    fn create_directory_nested() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let _node = create_directory(tmp.path(), "a/b/c").expect("create nested");
        assert!(tmp.path().join("a/b/c").is_dir());
    }

    #[test]
    fn delete_file_permanent() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::write(tmp.path().join("del.txt"), "bye").expect("seed");
        delete_file(tmp.path(), "del.txt", false).expect("delete");
        assert!(!tmp.path().join("del.txt").exists());
    }

    #[test]
    fn delete_file_not_found() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let result = delete_file(tmp.path(), "nope.txt", false);
        assert!(result.is_err());
    }

    #[test]
    fn rename_file_basic() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::write(tmp.path().join("old.txt"), "data").expect("seed");
        let node = rename_file(tmp.path(), "old.txt", "new.txt").expect("rename");
        assert_eq!(node.name, "new.txt");
        assert!(!tmp.path().join("old.txt").exists());
        assert!(tmp.path().join("new.txt").exists());
    }

    #[test]
    fn rename_file_rejects_overwrite() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::write(tmp.path().join("a.txt"), "a").expect("seed a");
        std::fs::write(tmp.path().join("b.txt"), "b").expect("seed b");
        let result = rename_file(tmp.path(), "a.txt", "b.txt");
        assert!(result.is_err());
    }

    #[test]
    fn duplicate_file_basic() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::write(tmp.path().join("orig.txt"), "data").expect("seed");
        let node = duplicate_file(tmp.path(), "orig.txt").expect("duplicate");
        assert_eq!(node.name, "orig (copy).txt");
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("orig (copy).txt")).expect("read copy"),
            "data"
        );
    }

    #[test]
    fn duplicate_file_handles_collision() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::write(tmp.path().join("file.rs"), "code").expect("seed");
        std::fs::write(tmp.path().join("file (copy).rs"), "old copy").expect("seed copy");
        let node = duplicate_file(tmp.path(), "file.rs").expect("duplicate");
        assert_eq!(node.name, "file (copy 2).rs");
    }

    #[test]
    fn duplicate_rejects_directory() {
        let tmp = tempfile::tempdir().expect("temp dir");
        std::fs::create_dir(tmp.path().join("dir")).expect("seed dir");
        let result = duplicate_file(tmp.path(), "dir");
        assert!(result.is_err());
    }
}

#[cfg(test)]
mod symbol_tests {
    use super::*;
    use std::io::Write as _;
    use tempfile::TempDir;

    fn write_file(dir: &TempDir, name: &str, content: &str) {
        let path = dir.path().join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create parent directory");
        }
        let mut file = std::fs::File::create(path).expect("create file");
        file.write_all(content.as_bytes()).expect("write file");
    }

    #[test]
    fn scan_ts_function_by_name() {
        let dir = TempDir::new().expect("temp dir");
        write_file(
            &dir,
            "utils.ts",
            "export function greetUser(name: string): string {\n  return `Hello ${name}`;\n}\n",
        );
        let results = scan_symbols(dir.path(), "greet", "function").expect("scan symbols");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "greetUser");
        assert_eq!(results[0].kind, "function");
        assert_eq!(results[0].line_number, 1);
    }

    #[test]
    fn scan_ts_class_by_name() {
        let dir = TempDir::new().expect("temp dir");
        write_file(
            &dir,
            "service.ts",
            "export class UserService {\n  id = 1;\n}\n",
        );
        let results = scan_symbols(dir.path(), "UserService", "class").expect("scan symbols");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "UserService");
        assert_eq!(results[0].kind, "class");
    }

    #[test]
    fn scan_rust_fn() {
        let dir = TempDir::new().expect("temp dir");
        write_file(
            &dir,
            "lib.rs",
            "pub fn compute_total(x: i32) -> i32 {\n    x * 2\n}\n",
        );
        let results = scan_symbols(dir.path(), "compute", "function").expect("scan symbols");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].kind, "function");
    }

    #[test]
    fn scan_query_is_case_insensitive() {
        let dir = TempDir::new().expect("temp dir");
        write_file(&dir, "helpers.ts", "export function calculateTotal() {}\n");
        let results = scan_symbols(dir.path(), "CALC", "all").expect("scan symbols");
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn scan_kind_filter_excludes_other_kinds() {
        let dir = TempDir::new().expect("temp dir");
        write_file(
            &dir,
            "mixed.ts",
            "export function doWork() {}\nexport class DoClass {}\n",
        );
        let fn_only = scan_symbols(dir.path(), "", "function").expect("scan symbols");
        assert!(fn_only.iter().all(|value| value.kind == "function"));

        let class_only = scan_symbols(dir.path(), "", "class").expect("scan symbols");
        assert!(class_only.iter().all(|value| value.kind == "class"));
    }

    #[test]
    fn scan_snippet_capped_at_20_lines() {
        let dir = TempDir::new().expect("temp dir");
        let body: String = (0..30)
            .map(|idx| format!("  let line{} = {};\n", idx, idx))
            .collect();
        write_file(
            &dir,
            "big.ts",
            &format!("export function bigFn() {{\n{body}}}\n"),
        );
        let results = scan_symbols(dir.path(), "bigFn", "function").expect("scan symbols");
        assert!(!results.is_empty());
        assert!(results[0].snippet.lines().count() <= 20);
    }
}
