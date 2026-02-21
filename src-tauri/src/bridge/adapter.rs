//! Versioned adapter interface for Claude Code CLI format changes.
//!
//! Implements CHI-15: versioned adapter.
//! Key risk mitigation per SPEC-001 §14 (Risk Matrix):
//! "CLI output format changes break parser → Versioned adapter interface."
//!
//! Architecture: SPEC-004 §2 (bridge/adapter.rs)
//! Standards: GUIDE-001 §2.4 (errors), §2.7 (testing)

use std::process::Command;

use super::parser::StreamParser;
use crate::{AppError, AppResult};

/// Semantic version of a Claude Code CLI release.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CliVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub raw: String,
}

impl CliVersion {
    /// Parse a version string like "1.0.34" or "v1.0.34".
    pub fn parse(version_str: &str) -> Option<Self> {
        let cleaned = version_str.trim().trim_start_matches('v');
        let parts: Vec<&str> = cleaned.split('.').collect();

        if parts.len() < 3 {
            return None;
        }

        Some(Self {
            major: parts[0].parse().ok()?,
            minor: parts[1].parse().ok()?,
            patch: parts[2].parse().ok()?,
            raw: version_str.trim().to_string(),
        })
    }

    /// Check if this version is at least the given minimum.
    pub fn is_at_least(&self, major: u32, minor: u32, patch: u32) -> bool {
        (self.major, self.minor, self.patch) >= (major, minor, patch)
    }
}

impl std::fmt::Display for CliVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

/// Trait for output adapters that handle different CLI versions.
///
/// Each CLI version may output slightly different JSON structures.
/// Adapters normalize these differences into a consistent `StreamParser`.
pub trait OutputAdapter: Send + Sync {
    /// The minimum CLI version this adapter supports (inclusive).
    fn min_version(&self) -> &CliVersion;

    /// The maximum CLI version this adapter supports (inclusive).
    fn max_version(&self) -> &CliVersion;

    /// Create a configured StreamParser for this CLI version.
    fn create_parser(&self, session_id: String) -> StreamParser;

    /// Human-readable name for this adapter.
    fn name(&self) -> &str;
}

/// Default adapter for the current Claude Code stream-json format.
/// Supports the standard `--output-format stream-json` output.
pub struct DefaultAdapter {
    min_ver: CliVersion,
    max_ver: CliVersion,
}

impl DefaultAdapter {
    pub fn new() -> Self {
        Self {
            // Supports from 1.0.0 onwards (initial stream-json support)
            min_ver: CliVersion {
                major: 1,
                minor: 0,
                patch: 0,
                raw: "1.0.0".to_string(),
            },
            // Up to 99.99.99 (effectively "latest")
            max_ver: CliVersion {
                major: 99,
                minor: 99,
                patch: 99,
                raw: "99.99.99".to_string(),
            },
        }
    }
}

impl Default for DefaultAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl OutputAdapter for DefaultAdapter {
    fn min_version(&self) -> &CliVersion {
        &self.min_ver
    }

    fn max_version(&self) -> &CliVersion {
        &self.max_ver
    }

    fn create_parser(&self, session_id: String) -> StreamParser {
        StreamParser::with_session_id(session_id)
    }

    fn name(&self) -> &str {
        "default-stream-json"
    }
}

/// Registry of versioned adapters.
/// Routes to the correct adapter based on detected CLI version.
pub struct AdapterRegistry {
    adapters: Vec<Box<dyn OutputAdapter>>,
}

impl AdapterRegistry {
    /// Create a new registry with the default adapter.
    pub fn new() -> Self {
        let mut registry = Self {
            adapters: Vec::new(),
        };
        registry.register(Box::new(DefaultAdapter::new()));
        registry
    }

    /// Register an adapter for a specific version range.
    pub fn register(&mut self, adapter: Box<dyn OutputAdapter>) {
        tracing::debug!(
            "Registered adapter '{}' for versions {} - {}",
            adapter.name(),
            adapter.min_version(),
            adapter.max_version()
        );
        self.adapters.push(adapter);
    }

    /// Find the best adapter for a given CLI version.
    ///
    /// Returns the adapter whose version range contains the given version.
    /// If multiple adapters match, returns the one with the narrowest range.
    /// If no adapter matches, returns `None`.
    pub fn find_adapter(&self, version: &CliVersion) -> Option<&dyn OutputAdapter> {
        let mut best: Option<&dyn OutputAdapter> = None;

        for adapter in &self.adapters {
            if version >= adapter.min_version() && version <= adapter.max_version() {
                match best {
                    None => best = Some(adapter.as_ref()),
                    Some(current_best) => {
                        // Prefer narrower range (more specific adapter)
                        let current_range = version_distance(
                            current_best.min_version(),
                            current_best.max_version(),
                        );
                        let new_range =
                            version_distance(adapter.min_version(), adapter.max_version());

                        if new_range < current_range {
                            best = Some(adapter.as_ref());
                        }
                    }
                }
            }
        }

        best
    }

    /// Create a parser for the given CLI version.
    ///
    /// If no adapter matches the version, falls back to the default parser
    /// and logs a warning (forward-compatible per CHI-15 acceptance criteria).
    pub fn create_parser_for_version(
        &self,
        version: &CliVersion,
        session_id: String,
    ) -> StreamParser {
        match self.find_adapter(version) {
            Some(adapter) => {
                tracing::info!(
                    "Using adapter '{}' for CLI version {}",
                    adapter.name(),
                    version
                );
                adapter.create_parser(session_id)
            }
            None => {
                tracing::warn!(
                    "No adapter found for CLI version {}, falling back to default parser. \
                     Unknown format fields will be logged but not cause errors.",
                    version
                );
                StreamParser::with_session_id(session_id)
            }
        }
    }
}

impl Default for AdapterRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Detect the Claude Code CLI version by running `claude --version`.
///
/// # Errors
///
/// Returns `AppError::Bridge` if:
/// - The binary cannot be executed
/// - The version output cannot be parsed
pub fn detect_cli_version(cli_path: &str) -> AppResult<CliVersion> {
    let output = Command::new(cli_path)
        .arg("--version")
        .output()
        .map_err(|e| AppError::Bridge(format!("Failed to run '{} --version': {}", cli_path, e)))?;

    let version_str = String::from_utf8_lossy(&output.stdout);
    let version_str = version_str.trim();

    // Claude Code outputs something like "claude v1.0.34" or just "1.0.34"
    // Extract the version number from the output
    let version_part = version_str
        .split_whitespace()
        .find(|part| {
            let cleaned = part.trim_start_matches('v');
            cleaned.split('.').count() >= 3 && cleaned.split('.').all(|p| p.parse::<u32>().is_ok())
        })
        .unwrap_or(version_str);

    CliVersion::parse(version_part).ok_or_else(|| {
        AppError::Bridge(format!(
            "Failed to parse CLI version from output: '{}'",
            version_str
        ))
    })
}

/// Calculate a rough "distance" between two versions for range comparison.
fn version_distance(min: &CliVersion, max: &CliVersion) -> u64 {
    let min_val = (min.major as u64) * 1_000_000 + (min.minor as u64) * 1_000 + min.patch as u64;
    let max_val = (max.major as u64) * 1_000_000 + (max.minor as u64) * 1_000 + max.patch as u64;
    max_val.saturating_sub(min_val)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_string() {
        let v = CliVersion::parse("1.0.34").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 0);
        assert_eq!(v.patch, 34);
    }

    #[test]
    fn parse_version_with_v_prefix() {
        let v = CliVersion::parse("v2.1.0").unwrap();
        assert_eq!(v.major, 2);
        assert_eq!(v.minor, 1);
        assert_eq!(v.patch, 0);
    }

    #[test]
    fn parse_invalid_version_returns_none() {
        assert!(CliVersion::parse("not-a-version").is_none());
        assert!(CliVersion::parse("1.0").is_none());
        assert!(CliVersion::parse("").is_none());
    }

    #[test]
    fn version_comparison() {
        let v1 = CliVersion::parse("1.0.0").unwrap();
        let v2 = CliVersion::parse("1.0.34").unwrap();
        let v3 = CliVersion::parse("2.0.0").unwrap();

        assert!(v1 < v2);
        assert!(v2 < v3);
        assert!(v1.is_at_least(1, 0, 0));
        assert!(!v1.is_at_least(1, 0, 1));
        assert!(v3.is_at_least(1, 0, 0));
    }

    #[test]
    fn registry_finds_default_adapter() {
        let registry = AdapterRegistry::new();
        let version = CliVersion::parse("1.0.34").unwrap();

        let adapter = registry.find_adapter(&version);
        assert!(adapter.is_some());
        assert_eq!(adapter.unwrap().name(), "default-stream-json");
    }

    #[test]
    fn registry_prefers_more_specific_adapter() {
        let mut registry = AdapterRegistry::new();

        // Add a more specific adapter for v1.1.x
        struct SpecificAdapter {
            min_ver: CliVersion,
            max_ver: CliVersion,
        }

        impl OutputAdapter for SpecificAdapter {
            fn min_version(&self) -> &CliVersion {
                &self.min_ver
            }
            fn max_version(&self) -> &CliVersion {
                &self.max_ver
            }
            fn create_parser(&self, session_id: String) -> StreamParser {
                StreamParser::with_session_id(session_id)
            }
            fn name(&self) -> &str {
                "specific-v1.1"
            }
        }

        registry.register(Box::new(SpecificAdapter {
            min_ver: CliVersion::parse("1.1.0").unwrap(),
            max_ver: CliVersion::parse("1.1.99").unwrap(),
        }));

        // v1.1.5 should match the specific adapter
        let v = CliVersion::parse("1.1.5").unwrap();
        let adapter = registry.find_adapter(&v).unwrap();
        assert_eq!(adapter.name(), "specific-v1.1");

        // v1.0.5 should match the default adapter
        let v = CliVersion::parse("1.0.5").unwrap();
        let adapter = registry.find_adapter(&v).unwrap();
        assert_eq!(adapter.name(), "default-stream-json");
    }

    #[test]
    fn create_parser_for_unknown_version_falls_back() {
        let registry = AdapterRegistry::new();
        // Version 0.0.1 — older than any registered adapter
        // The default adapter covers 1.0.0 to 99.99.99, so 0.0.1 won't match
        // Actually the default covers 1.0.0+, so let's test with the fallback
        let version = CliVersion {
            major: 0,
            minor: 0,
            patch: 1,
            raw: "0.0.1".to_string(),
        };
        // Should not panic — just returns a default parser with a warning
        let parser = registry.create_parser_for_version(&version, "test".to_string());
        // Verify it works by feeding valid data
        let mut parser = parser;
        let outputs = parser.feed("{\"type\":\"content_block_delta\",\"text\":\"hi\"}\n");
        assert_eq!(outputs.len(), 1);
    }

    #[test]
    fn version_display() {
        let v = CliVersion::parse("1.2.3").unwrap();
        assert_eq!(format!("{}", v), "1.2.3");
    }
}
