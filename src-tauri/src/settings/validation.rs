//! Type-safe validation for user settings fields (CHI-122).

use super::{TerminalSettings, UserSettings};
use crate::AppError;

/// Allowed theme values.
const VALID_THEMES: &[&str] = &["light", "dark", "system"];
/// Allowed sidebar defaults.
const VALID_SIDEBAR_DEFAULTS: &[&str] = &["expanded", "collapsed", "hidden"];
/// Allowed locales (expand as translations land).
const VALID_LOCALES: &[&str] = &["en", "es"];
/// Allowed date formats.
const VALID_DATE_FORMATS: &[&str] = &["relative", "iso", "locale"];
/// Allowed number formats.
const VALID_NUMBER_FORMATS: &[&str] = &["standard", "compact"];
/// Allowed models.
const VALID_MODELS: &[&str] = &["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"];
/// Allowed effort levels.
const VALID_EFFORTS: &[&str] = &["low", "medium", "high"];
/// Allowed redaction levels.
const VALID_REDACTION_LEVELS: &[&str] = &["none", "standard", "aggressive"];

/// Validate the entire settings struct. Returns Ok(()) or a descriptive error.
pub fn validate(settings: &UserSettings) -> Result<(), AppError> {
    validate_appearance(settings)?;
    validate_i18n(settings)?;
    validate_cli(settings)?;
    validate_sessions(settings)?;
    validate_privacy(settings)?;
    validate_terminal(&settings.terminal)?;
    Ok(())
}

fn validate_appearance(s: &UserSettings) -> Result<(), AppError> {
    if !VALID_THEMES.contains(&s.appearance.theme.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid theme '{}'. Must be one of: {}",
            s.appearance.theme,
            VALID_THEMES.join(", ")
        )));
    }
    if !(10..=24).contains(&s.appearance.font_size) {
        return Err(AppError::Validation(format!(
            "font_size must be 10–24, got {}",
            s.appearance.font_size
        )));
    }
    if !(10..=24).contains(&s.appearance.code_font_size) {
        return Err(AppError::Validation(format!(
            "code_font_size must be 10–24, got {}",
            s.appearance.code_font_size
        )));
    }
    if !VALID_SIDEBAR_DEFAULTS.contains(&s.appearance.sidebar_default.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid sidebar_default '{}'. Must be one of: {}",
            s.appearance.sidebar_default,
            VALID_SIDEBAR_DEFAULTS.join(", ")
        )));
    }
    Ok(())
}

fn validate_i18n(s: &UserSettings) -> Result<(), AppError> {
    if !VALID_LOCALES.contains(&s.i18n.locale.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid locale '{}'. Must be one of: {}",
            s.i18n.locale,
            VALID_LOCALES.join(", ")
        )));
    }
    if !VALID_DATE_FORMATS.contains(&s.i18n.date_format.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid date_format '{}'. Must be one of: {}",
            s.i18n.date_format,
            VALID_DATE_FORMATS.join(", ")
        )));
    }
    if !VALID_NUMBER_FORMATS.contains(&s.i18n.number_format.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid number_format '{}'. Must be one of: {}",
            s.i18n.number_format,
            VALID_NUMBER_FORMATS.join(", ")
        )));
    }
    Ok(())
}

fn validate_cli(s: &UserSettings) -> Result<(), AppError> {
    if !VALID_MODELS.contains(&s.cli.default_model.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid default_model '{}'. Must be one of: {}",
            s.cli.default_model,
            VALID_MODELS.join(", ")
        )));
    }
    if !VALID_EFFORTS.contains(&s.cli.default_effort.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid default_effort '{}'. Must be one of: {}",
            s.cli.default_effort,
            VALID_EFFORTS.join(", ")
        )));
    }
    Ok(())
}

fn validate_sessions(s: &UserSettings) -> Result<(), AppError> {
    if !(1..=8).contains(&s.sessions.max_concurrent) {
        return Err(AppError::Validation(format!(
            "max_concurrent must be 1–8, got {}",
            s.sessions.max_concurrent
        )));
    }
    if !(1..=120).contains(&s.sessions.resume_inactivity_minutes) {
        return Err(AppError::Validation(format!(
            "resume_inactivity_minutes must be 1–120, got {}",
            s.sessions.resume_inactivity_minutes
        )));
    }
    Ok(())
}

fn validate_privacy(s: &UserSettings) -> Result<(), AppError> {
    if !VALID_REDACTION_LEVELS.contains(&s.privacy.log_redaction_level.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid log_redaction_level '{}'. Must be one of: {}",
            s.privacy.log_redaction_level,
            VALID_REDACTION_LEVELS.join(", ")
        )));
    }
    Ok(())
}

/// Allowed cursor styles.
const VALID_CURSOR_STYLES: &[&str] = &["block", "underline", "bar"];
/// Allowed bell modes.
const VALID_BELL_MODES: &[&str] = &["none", "sound", "visual"];

fn validate_terminal(t: &TerminalSettings) -> Result<(), AppError> {
    if t.font_size < 8 || t.font_size > 32 {
        return Err(AppError::Validation(format!(
            "terminal.font_size must be 8–32, got {}",
            t.font_size
        )));
    }
    if !VALID_CURSOR_STYLES.contains(&t.cursor_style.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid terminal.cursor_style '{}'. Must be one of: {}",
            t.cursor_style,
            VALID_CURSOR_STYLES.join(", ")
        )));
    }
    if t.scrollback_lines < 1_000 || t.scrollback_lines > 100_000 {
        return Err(AppError::Validation(format!(
            "terminal.scrollback_lines must be 1000–100000, got {}",
            t.scrollback_lines
        )));
    }
    if !VALID_BELL_MODES.contains(&t.bell.as_str()) {
        return Err(AppError::Validation(format!(
            "Invalid terminal.bell '{}'. Must be one of: {}",
            t.bell,
            VALID_BELL_MODES.join(", ")
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_pass_validation() {
        let settings = UserSettings::default();
        assert!(validate(&settings).is_ok());
    }

    #[test]
    fn invalid_theme_rejected() {
        let mut settings = UserSettings::default();
        settings.appearance.theme = "neon".to_string();
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("Invalid theme"));
    }

    #[test]
    fn font_size_too_small_rejected() {
        let mut settings = UserSettings::default();
        settings.appearance.font_size = 5;
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("font_size must be 10–24"));
    }

    #[test]
    fn font_size_too_large_rejected() {
        let mut settings = UserSettings::default();
        settings.appearance.font_size = 30;
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("font_size must be 10–24"));
    }

    #[test]
    fn font_size_boundary_accepted() {
        let mut settings = UserSettings::default();
        settings.appearance.font_size = 10;
        assert!(validate(&settings).is_ok());
        settings.appearance.font_size = 24;
        assert!(validate(&settings).is_ok());
    }

    #[test]
    fn invalid_locale_rejected() {
        let mut settings = UserSettings::default();
        settings.i18n.locale = "xx".to_string();
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("Invalid locale"));
    }

    #[test]
    fn invalid_model_rejected() {
        let mut settings = UserSettings::default();
        settings.cli.default_model = "gpt-4".to_string();
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("Invalid default_model"));
    }

    #[test]
    fn max_concurrent_zero_rejected() {
        let mut settings = UserSettings::default();
        settings.sessions.max_concurrent = 0;
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("max_concurrent must be 1–8"));
    }

    #[test]
    fn max_concurrent_nine_rejected() {
        let mut settings = UserSettings::default();
        settings.sessions.max_concurrent = 9;
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("max_concurrent must be 1–8"));
    }

    #[test]
    fn resume_inactivity_zero_rejected() {
        let mut settings = UserSettings::default();
        settings.sessions.resume_inactivity_minutes = 0;
        let err = validate(&settings).unwrap_err();
        assert!(err
            .to_string()
            .contains("resume_inactivity_minutes must be 1–120"));
    }

    #[test]
    fn resume_inactivity_121_rejected() {
        let mut settings = UserSettings::default();
        settings.sessions.resume_inactivity_minutes = 121;
        let err = validate(&settings).unwrap_err();
        assert!(err
            .to_string()
            .contains("resume_inactivity_minutes must be 1–120"));
    }

    #[test]
    fn invalid_redaction_level_rejected() {
        let mut settings = UserSettings::default();
        settings.privacy.log_redaction_level = "extreme".to_string();
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("Invalid log_redaction_level"));
    }

    #[test]
    fn terminal_font_size_out_of_range_rejected() {
        let mut settings = UserSettings::default();
        settings.terminal.font_size = 40;
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("terminal.font_size must be 8–32"));
    }

    #[test]
    fn invalid_terminal_cursor_style_rejected() {
        let mut settings = UserSettings::default();
        settings.terminal.cursor_style = "beam".to_string();
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("Invalid terminal.cursor_style"));
    }

    #[test]
    fn terminal_scrollback_out_of_range_rejected() {
        let mut settings = UserSettings::default();
        settings.terminal.scrollback_lines = 100;
        let err = validate(&settings).unwrap_err();
        assert!(err
            .to_string()
            .contains("terminal.scrollback_lines must be 1000–100000"));
    }

    #[test]
    fn invalid_terminal_bell_rejected() {
        let mut settings = UserSettings::default();
        settings.terminal.bell = "beep".to_string();
        let err = validate(&settings).unwrap_err();
        assert!(err.to_string().contains("Invalid terminal.bell"));
    }

    #[test]
    fn migration_from_v1_updates_version() {
        let mut settings = UserSettings {
            version: 1,
            ..UserSettings::default()
        };
        assert!(settings.migrate());
        assert_eq!(settings.version, 3);
        assert_eq!(settings.terminal, TerminalSettings::default());
    }

    #[test]
    fn serialization_roundtrip() {
        let settings = UserSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: UserSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(settings, deserialized);
    }
}
