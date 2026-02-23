//! User settings persistence and validation (CHI-122).
//!
//! Settings are stored as a JSON file via `tauri-plugin-store` at platform-specific
//! `app_config_dir()`. Schema-versioned for forward migration.

pub mod validation;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current schema version. Bump when adding/removing/renaming fields.
pub const SETTINGS_VERSION: u32 = 1;

/// Root settings structure persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserSettings {
    pub version: u32,
    pub appearance: AppearanceSettings,
    pub i18n: I18nSettings,
    pub cli: CliSettings,
    pub sessions: SessionSettings,
    pub keybindings: HashMap<String, String>,
    pub privacy: PrivacySettings,
    pub advanced: AdvancedSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppearanceSettings {
    /// `"light"`, `"dark"`, or `"system"`.
    pub theme: String,
    /// UI font size in px (10–24).
    pub font_size: u32,
    /// Code/mono font size in px (10–24).
    pub code_font_size: u32,
    /// Default sidebar state: `"expanded"`, `"collapsed"`, `"hidden"`.
    pub sidebar_default: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct I18nSettings {
    /// BCP-47 locale tag (e.g., `"en"`, `"es"`).
    pub locale: String,
    /// Date format: `"relative"`, `"iso"`, `"locale"`.
    pub date_format: String,
    /// Number format: `"standard"`, `"compact"`.
    pub number_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CliSettings {
    /// Default model for new sessions.
    pub default_model: String,
    /// Default reasoning effort: `"low"`, `"medium"`, `"high"`.
    pub default_effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionSettings {
    /// Maximum concurrent CLI sessions (1–8).
    pub max_concurrent: u32,
    /// Auto-save interval in seconds (0 = disabled).
    pub auto_save_interval_secs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PrivacySettings {
    /// Log redaction level: `"none"`, `"standard"`, `"aggressive"`.
    pub log_redaction_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AdvancedSettings {
    /// Override CLI binary path (empty string = auto-detect).
    pub cli_path_override: String,
    /// Enable debug logging to console.
    pub debug_mode: bool,
    /// Enable developer permission tier.
    pub developer_mode: bool,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            appearance: AppearanceSettings {
                theme: "dark".to_string(),
                font_size: 13,
                code_font_size: 12,
                sidebar_default: "expanded".to_string(),
            },
            i18n: I18nSettings {
                locale: "en".to_string(),
                date_format: "relative".to_string(),
                number_format: "standard".to_string(),
            },
            cli: CliSettings {
                default_model: "claude-sonnet-4-6".to_string(),
                default_effort: "high".to_string(),
            },
            sessions: SessionSettings {
                max_concurrent: 4,
                auto_save_interval_secs: 0,
            },
            keybindings: HashMap::new(),
            privacy: PrivacySettings {
                log_redaction_level: "standard".to_string(),
            },
            advanced: AdvancedSettings {
                cli_path_override: String::new(),
                debug_mode: false,
                developer_mode: false,
            },
        }
    }
}

impl UserSettings {
    /// Migrate settings from an older schema version to current.
    /// Returns true if migration occurred.
    pub fn migrate(&mut self) -> bool {
        if self.version >= SETTINGS_VERSION {
            return false;
        }
        // Future migrations go here:
        // if self.version < 2 { ... self.version = 2; }
        self.version = SETTINGS_VERSION;
        true
    }
}

/// Describes which category and key changed (for `settings:updated` event).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsChangedPayload {
    pub category: String,
    pub key: Option<String>,
}
