//! Shell detection (CHI-335).

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    pub is_default: bool,
}

/// Detects the user's default shell.
/// Uses $SHELL on Unix, %ComSpec% on Windows.
pub fn detect_default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

/// Returns a list of available shells on this system.
pub fn list_available_shells() -> Vec<ShellInfo> {
    let default_shell = detect_default_shell();

    #[cfg(not(windows))]
    {
        let candidates = [
            "/bin/zsh",
            "/bin/bash",
            "/bin/fish",
            "/usr/bin/fish",
            "/bin/sh",
        ];
        let mut shells: Vec<ShellInfo> = candidates
            .iter()
            .filter(|path| Path::new(path).exists())
            .map(|path| ShellInfo {
                name: Path::new(path)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.to_string()),
                path: path.to_string(),
                is_default: *path == default_shell.as_str(),
            })
            .collect();

        if !shells.iter().any(|shell| shell.is_default) {
            shells.push(ShellInfo {
                name: Path::new(&default_shell)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| default_shell.clone()),
                path: default_shell.clone(),
                is_default: true,
            });
        }

        shells
    }

    #[cfg(windows)]
    {
        vec![ShellInfo {
            name: "cmd".to_string(),
            path: default_shell.clone(),
            is_default: true,
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_default_shell, list_available_shells};

    #[test]
    fn detect_default_shell_returns_a_path_like_string() {
        let shell = detect_default_shell();
        assert!(!shell.trim().is_empty());
    }

    #[test]
    fn list_available_shells_marks_a_default_entry() {
        let shells = list_available_shells();
        assert!(!shells.is_empty());
        assert_eq!(shells.iter().filter(|shell| shell.is_default).count(), 1);
    }
}
