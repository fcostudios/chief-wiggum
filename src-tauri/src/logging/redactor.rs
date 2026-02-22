//! Log redaction engine — strips sensitive data from log entries at export time.
//!
//! Key design: Redaction operates on CLONED entries, never mutating the originals.
//! This preserves full logs for local debugging while ensuring exports are safe.
//!
//! CHI-95: Epic CHI-93 (Structured Log Collector)

use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;

use super::ring_buffer::LogEntry;

/// Summary of redaction operations performed.
#[derive(Debug, Clone, Serialize)]
pub struct RedactionSummary {
    pub rules_applied: Vec<String>,
    pub entries_redacted: usize,
    pub total_entries: usize,
    pub fields_redacted: usize,
}

/// A single redaction rule: a named regex + replacement.
struct RedactionRule {
    name: &'static str,
    pattern: Regex,
    replacement: String,
}

/// Strips sensitive data from log entries at export time.
///
/// Rules are compiled once on construction and reused across all entries.
pub struct LogRedactor {
    rules: Vec<RedactionRule>,
}

impl LogRedactor {
    /// Create a redactor with all default rules.
    ///
    /// Detects the user's home directory for path redaction automatically.
    pub fn new() -> Self {
        let home_dir = dirs::home_dir();
        Self::with_home_dir(home_dir)
    }

    /// Create a redactor with an explicit home directory (for testing).
    pub fn with_home_dir(home_dir: Option<PathBuf>) -> Self {
        // Rules 1-5: always-on patterns (constructed via vec![] to satisfy clippy)
        let mut rules = vec![
            // Rule 1: Anthropic API keys (sk-ant-api03-...)
            RedactionRule {
                name: "anthropic_api_key",
                pattern: Regex::new(r"sk-ant-[a-zA-Z0-9_-]{10,}").expect("valid regex"),
                replacement: "sk-ant-***[REDACTED]".to_string(),
            },
            // Rule 2: Generic secret keys (sk-...)
            RedactionRule {
                name: "generic_sk_key",
                pattern: Regex::new(r"sk-[a-zA-Z0-9_-]{20,}").expect("valid regex"),
                replacement: "sk-***[REDACTED]".to_string(),
            },
            // Rule 3: Bearer tokens
            RedactionRule {
                name: "bearer_token",
                pattern: Regex::new(r"Bearer\s+[a-zA-Z0-9._\-/+=]{10,}").expect("valid regex"),
                replacement: "Bearer [REDACTED]".to_string(),
            },
            // Rule 4: Environment variable secrets (KEY=value patterns)
            RedactionRule {
                name: "env_secret",
                pattern: Regex::new(
                    r"(?i)(ANTHROPIC_API_KEY|OPENAI_API_KEY|API_KEY|SECRET_KEY|AUTH_TOKEN|ACCESS_TOKEN)\s*=\s*\S+",
                )
                .expect("valid regex"),
                replacement: "$1=[REDACTED]".to_string(),
            },
            // Rule 5: Email addresses
            RedactionRule {
                name: "email",
                pattern: Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
                    .expect("valid regex"),
                replacement: "[EMAIL]".to_string(),
            },
        ];

        // Rule 6: Home directory paths (platform-specific, conditional)
        if let Some(ref home) = home_dir {
            let home_str = home.to_string_lossy().to_string();
            if !home_str.is_empty() {
                // Escape the path for use in regex (handles backslashes on Windows)
                let escaped = regex::escape(&home_str);
                rules.push(RedactionRule {
                    name: "home_directory",
                    pattern: Regex::new(&escaped).expect("valid regex"),
                    replacement: "~".to_string(),
                });
            }
        }

        // Rule 7: Windows-style home paths (C:\Users\username\...)
        rules.push(RedactionRule {
            name: "windows_user_path",
            pattern: Regex::new(r"[A-Z]:\\Users\\[^\\]+").expect("valid regex"),
            replacement: "~".to_string(),
        });

        Self { rules }
    }

    /// Redact a slice of log entries, returning redacted copies + summary.
    ///
    /// The original entries are not modified.
    pub fn redact_entries(&self, entries: &[LogEntry]) -> (Vec<LogEntry>, RedactionSummary) {
        let total_entries = entries.len();
        let mut entries_redacted = 0;
        let mut fields_redacted = 0;
        let mut rules_hit: Vec<bool> = vec![false; self.rules.len()];

        let redacted: Vec<LogEntry> = entries
            .iter()
            .map(|entry| {
                let mut modified = false;

                // Redact message
                let message = self.apply_rules(&entry.message, &mut rules_hit, &mut modified);

                // Redact field values
                let fields: Vec<(String, String)> = entry
                    .fields
                    .iter()
                    .map(|(key, value)| {
                        let mut field_modified = false;
                        let redacted_value =
                            self.apply_rules(value, &mut rules_hit, &mut field_modified);
                        if field_modified {
                            fields_redacted += 1;
                            modified = true;
                        }
                        (key.clone(), redacted_value)
                    })
                    .collect();

                if modified {
                    entries_redacted += 1;
                }

                LogEntry {
                    timestamp: entry.timestamp.clone(),
                    level: entry.level.clone(),
                    target: entry.target.clone(),
                    message,
                    fields,
                }
            })
            .collect();

        let rules_applied: Vec<String> = self
            .rules
            .iter()
            .zip(rules_hit.iter())
            .filter(|(_, hit)| **hit)
            .map(|(rule, _)| rule.name.to_string())
            .collect();

        let summary = RedactionSummary {
            rules_applied,
            entries_redacted,
            total_entries,
            fields_redacted,
        };

        (redacted, summary)
    }

    /// Apply all rules to a string, tracking which rules matched.
    fn apply_rules(&self, input: &str, rules_hit: &mut [bool], modified: &mut bool) -> String {
        let mut result = input.to_string();
        for (i, rule) in self.rules.iter().enumerate() {
            let after = rule.pattern.replace_all(&result, rule.replacement.as_str());
            if after != result {
                rules_hit[i] = true;
                *modified = true;
                result = after.into_owned();
            }
        }
        result
    }
}

impl Default for LogRedactor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_entry(message: &str) -> LogEntry {
        LogEntry {
            timestamp: "2026-02-22T12:00:00Z".to_string(),
            level: "INFO".to_string(),
            target: "test".to_string(),
            message: message.to_string(),
            fields: vec![],
        }
    }

    fn make_entry_with_fields(message: &str, fields: Vec<(&str, &str)>) -> LogEntry {
        LogEntry {
            timestamp: "2026-02-22T12:00:00Z".to_string(),
            level: "INFO".to_string(),
            target: "test".to_string(),
            message: message.to_string(),
            fields: fields
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    fn redactor_with_home(home: &str) -> LogRedactor {
        LogRedactor::with_home_dir(Some(PathBuf::from(home)))
    }

    #[test]
    fn redacts_anthropic_api_key() {
        let r = LogRedactor::new();
        let entries = vec![make_entry(
            "Using key sk-ant-api03-abc123def456ghi789jkl",
        )];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(!redacted[0].message.contains("abc123"));
        assert!(redacted[0].message.contains("[REDACTED]"));
        assert_eq!(summary.entries_redacted, 1);
        assert!(summary
            .rules_applied
            .contains(&"anthropic_api_key".to_string()));
    }

    #[test]
    fn redacts_generic_sk_key() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("key=sk-1234567890abcdefghijklmn")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("[REDACTED]"));
        assert_eq!(summary.entries_redacted, 1);
    }

    #[test]
    fn redacts_bearer_token() {
        let r = LogRedactor::new();
        let entries = vec![make_entry(
            "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
        )];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("Bearer [REDACTED]"));
        assert!(!redacted[0].message.contains("eyJhb"));
    }

    #[test]
    fn redacts_env_secrets() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("ANTHROPIC_API_KEY=sk-ant-api03-secret123")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(redacted[0]
            .message
            .contains("ANTHROPIC_API_KEY=[REDACTED]"));
        assert!(summary.entries_redacted >= 1);
    }

    #[test]
    fn redacts_email() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("User fcolomas@gmail.com logged in")];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("[EMAIL]"));
        assert!(!redacted[0].message.contains("fcolomas@gmail.com"));
    }

    #[test]
    fn redacts_home_directory() {
        let r = redactor_with_home("/Users/francisco");
        let entries = vec![make_entry(
            "Loading /Users/francisco/projects/chief-wiggum",
        )];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("~/projects/chief-wiggum"));
        assert!(!redacted[0].message.contains("/Users/francisco"));
    }

    #[test]
    fn redacts_windows_user_path() {
        let r = LogRedactor::new();
        let entries = vec![make_entry(r"Loading C:\Users\francisco\projects\cw")];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.starts_with("Loading ~"));
        assert!(!redacted[0].message.contains("francisco"));
    }

    #[test]
    fn redacts_fields_not_just_message() {
        let r = LogRedactor::new();
        let entries = vec![make_entry_with_fields(
            "request sent",
            vec![(
                "auth",
                "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload",
            )],
        )];
        let (redacted, summary) = r.redact_entries(&entries);

        assert_eq!(redacted[0].fields[0].1, "Bearer [REDACTED]");
        assert_eq!(summary.fields_redacted, 1);
    }

    #[test]
    fn preserves_clean_entries() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("Session s1 started successfully")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert_eq!(redacted[0].message, "Session s1 started successfully");
        assert_eq!(summary.entries_redacted, 0);
        assert!(summary.rules_applied.is_empty());
    }

    #[test]
    fn multiple_rules_on_same_entry() {
        let r = redactor_with_home("/Users/francisco");
        let entries = vec![make_entry(
            "User fcolomas@gmail.com at /Users/francisco/app used sk-ant-api03-secretkey123",
        )];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("[EMAIL]"));
        assert!(redacted[0].message.contains("~/app"));
        assert!(redacted[0].message.contains("[REDACTED]"));
        assert!(summary.rules_applied.len() >= 3);
    }

    #[test]
    fn original_entries_not_modified() {
        let r = LogRedactor::new();
        let original = vec![make_entry("key=sk-ant-api03-secret123456789")];
        let original_msg = original[0].message.clone();
        let _ = r.redact_entries(&original);

        assert_eq!(
            original[0].message, original_msg,
            "Original should be untouched"
        );
    }

    #[test]
    fn empty_input_returns_empty() {
        let r = LogRedactor::new();
        let (redacted, summary) = r.redact_entries(&[]);

        assert!(redacted.is_empty());
        assert_eq!(summary.total_entries, 0);
        assert_eq!(summary.entries_redacted, 0);
    }

    #[test]
    fn summary_counts_are_correct() {
        let r = LogRedactor::new();
        let entries = vec![
            make_entry("clean entry"),
            make_entry("has key sk-ant-api03-abc123def456ghi789jkl"),
            make_entry("another clean"),
            make_entry("email: user@example.com"),
        ];
        let (_, summary) = r.redact_entries(&entries);

        assert_eq!(summary.total_entries, 4);
        assert_eq!(summary.entries_redacted, 2);
    }
}
