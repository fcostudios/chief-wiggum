//! User settings persistence and validation (CHI-122).
//!
//! Settings are stored as a JSON file via `tauri-plugin-store` at platform-specific
//! `app_config_dir()`. Schema-versioned for forward migration.

pub mod validation;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current schema version. Bump when adding/removing/renaming fields.
pub const SETTINGS_VERSION: u32 = 3;
/// Default inactivity window before showing "resume session" UI.
pub const DEFAULT_RESUME_INACTIVITY_MINUTES: u32 = 5;

fn default_resume_inactivity_minutes() -> u32 {
    DEFAULT_RESUME_INACTIVITY_MINUTES
}

fn default_hints_enabled() -> bool {
    true
}

/// Terminal emulator settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalSettings {
    /// Shell binary path. Empty string = auto-detect from $SHELL / %ComSpec%.
    pub default_shell: String,
    /// Terminal font size in px (8–32).
    pub font_size: u8,
    /// Terminal font family (CSS font stack).
    pub font_family: String,
    /// Cursor style: `"block"`, `"underline"`, or `"bar"`.
    pub cursor_style: String,
    /// Whether the cursor blinks.
    pub cursor_blink: bool,
    /// Number of scrollback lines (1_000–100_000).
    pub scrollback_lines: u32,
    /// Copy to clipboard on text selection.
    pub copy_on_select: bool,
    /// Paste clipboard on right-click.
    pub paste_on_right_click: bool,
    /// Bell mode: `"none"`, `"sound"`, or `"visual"`.
    pub bell: String,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        TerminalSettings {
            default_shell: String::new(),
            font_size: 14,
            font_family: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace".to_string(),
            cursor_style: "block".to_string(),
            cursor_blink: true,
            scrollback_lines: 10_000,
            copy_on_select: false,
            paste_on_right_click: false,
            bell: "none".to_string(),
        }
    }
}

/// Root settings structure persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserSettings {
    pub version: u32,
    pub appearance: AppearanceSettings,
    pub i18n: I18nSettings,
    pub cli: CliSettings,
    pub sessions: SessionSettings,
    #[serde(default)]
    pub onboarding: OnboardingSettings,
    pub keybindings: HashMap<String, String>,
    pub privacy: PrivacySettings,
    pub advanced: AdvancedSettings,
    #[serde(default)]
    pub terminal: TerminalSettings,
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
    /// Minutes of inactivity before showing a resume summary card.
    #[serde(default = "default_resume_inactivity_minutes")]
    pub resume_inactivity_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OnboardingSettings {
    /// Whether the first-launch onboarding flow has been completed.
    pub completed: bool,
    /// Hint IDs that have already been displayed and dismissed.
    #[serde(default)]
    pub seen_hints: Vec<String>,
    /// Master toggle for contextual hints.
    #[serde(default = "default_hints_enabled")]
    pub hints_enabled: bool,
}

impl Default for OnboardingSettings {
    fn default() -> Self {
        Self {
            completed: false,
            seen_hints: Vec::new(),
            hints_enabled: default_hints_enabled(),
        }
    }
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
                resume_inactivity_minutes: default_resume_inactivity_minutes(),
            },
            onboarding: OnboardingSettings::default(),
            keybindings: HashMap::new(),
            privacy: PrivacySettings {
                log_redaction_level: "standard".to_string(),
            },
            advanced: AdvancedSettings {
                cli_path_override: String::new(),
                debug_mode: false,
                developer_mode: false,
            },
            terminal: TerminalSettings::default(),
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
        let from_version = self.version;
        if from_version < 3 {
            self.terminal = TerminalSettings::default();
            tracing::info!(
                "Migrated settings from v{} to v3: added terminal defaults",
                from_version
            );
        }
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
