//! File explorer: gitignore-aware scanning, content reading, and search.
//! Per CHI-115: foundation for the File Explorer & @-Mention system.

pub mod bundles;
pub mod scanner;
pub mod suggestions;
pub mod watcher;

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
    /// Whether this file/directory is excluded by .gitignore.
    pub is_git_ignored: bool,
    /// Preview type classification for UI rendering.
    pub preview_type: String,
}

/// Classify file preview type from extension and binary status.
pub fn classify_preview_type(extension: Option<&str>, is_binary: bool) -> &'static str {
    let ext = extension.map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico") => "image",
        Some("svg") => "svg",
        Some("pdf") => "pdf",
        Some("mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a") => "audio",
        Some("mp4" | "webm" | "mov" | "avi" | "mkv") => "video",
        Some(
            "exe" | "dll" | "so" | "dylib" | "bin" | "o" | "obj" | "class" | "pyc" | "pyo" | "wasm"
            | "zip" | "tar" | "gz" | "rar" | "7z" | "tgz" | "db" | "sqlite" | "sqlite3",
        ) => "binary",
        _ if is_binary => "binary",
        _ => "text",
    }
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
    /// Whether the file is read-only on disk (permissions check).
    pub is_readonly: bool,
    /// Last modified timestamp in milliseconds since Unix epoch. None if unavailable.
    pub modified_at_ms: Option<i64>,
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
            is_git_ignored: false,
            preview_type: "text".to_string(),
        };
        let json = serde_json::to_string(&node).expect("should serialize");
        assert!(json.contains("\"name\":\"test.rs\""));
        assert!(json.contains("\"File\""));
        assert!(json.contains("\"preview_type\":\"text\""));
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
            is_readonly: false,
            modified_at_ms: Some(1_709_500_000_000),
        };
        let json = serde_json::to_string(&content).expect("should serialize");
        assert!(json.contains("\"estimated_tokens\":3"));
    }

    #[test]
    fn classify_preview_type_images() {
        assert_eq!(classify_preview_type(Some("png"), false), "image");
        assert_eq!(classify_preview_type(Some("jpg"), false), "image");
        assert_eq!(classify_preview_type(Some("jpeg"), false), "image");
        assert_eq!(classify_preview_type(Some("gif"), false), "image");
        assert_eq!(classify_preview_type(Some("webp"), false), "image");
        assert_eq!(classify_preview_type(Some("bmp"), false), "image");
        assert_eq!(classify_preview_type(Some("ico"), false), "image");
    }

    #[test]
    fn classify_preview_type_svg() {
        assert_eq!(classify_preview_type(Some("svg"), false), "svg");
        assert_eq!(classify_preview_type(Some("svg"), true), "svg");
    }

    #[test]
    fn classify_preview_type_pdf() {
        assert_eq!(classify_preview_type(Some("pdf"), true), "pdf");
    }

    #[test]
    fn classify_preview_type_audio() {
        assert_eq!(classify_preview_type(Some("mp3"), true), "audio");
        assert_eq!(classify_preview_type(Some("wav"), true), "audio");
        assert_eq!(classify_preview_type(Some("ogg"), true), "audio");
        assert_eq!(classify_preview_type(Some("flac"), true), "audio");
        assert_eq!(classify_preview_type(Some("aac"), true), "audio");
        assert_eq!(classify_preview_type(Some("m4a"), true), "audio");
    }

    #[test]
    fn classify_preview_type_video() {
        assert_eq!(classify_preview_type(Some("mp4"), true), "video");
        assert_eq!(classify_preview_type(Some("webm"), true), "video");
        assert_eq!(classify_preview_type(Some("mov"), true), "video");
    }

    #[test]
    fn classify_preview_type_excluded_binary() {
        assert_eq!(classify_preview_type(Some("exe"), true), "binary");
        assert_eq!(classify_preview_type(Some("dll"), true), "binary");
        assert_eq!(classify_preview_type(Some("zip"), true), "binary");
        assert_eq!(classify_preview_type(Some("db"), true), "binary");
        assert_eq!(classify_preview_type(None, true), "binary");
    }

    #[test]
    fn classify_preview_type_text() {
        assert_eq!(classify_preview_type(Some("rs"), false), "text");
        assert_eq!(classify_preview_type(Some("ts"), false), "text");
        assert_eq!(classify_preview_type(None, false), "text");
    }
}
