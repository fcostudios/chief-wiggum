//! File explorer: gitignore-aware scanning, content reading, and search.
//! Per CHI-115: foundation for the File Explorer & @-Mention system.

pub mod scanner;
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
