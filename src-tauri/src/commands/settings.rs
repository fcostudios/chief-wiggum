//! IPC commands for user settings persistence (CHI-122).
//! Uses tauri-plugin-store for JSON file storage at platform app_config_dir.

use crate::settings::validation;
use crate::settings::{SettingsChangedPayload, UserSettings, SETTINGS_VERSION};
use crate::AppError;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

/// Settings file name within app_config_dir.
const SETTINGS_FILE: &str = "settings.json";
/// Key used in the store.
const SETTINGS_KEY: &str = "user_settings";

/// Load settings from store, applying defaults and migration if needed.
fn load_settings(app: &AppHandle) -> Result<UserSettings, AppError> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Other(format!("Failed to open settings store: {}", e)))?;

    match store.get(SETTINGS_KEY) {
        Some(value) => {
            let mut settings: UserSettings =
                serde_json::from_value(value.clone()).unwrap_or_else(|_| UserSettings::default());
            if settings.migrate() {
                let json = serde_json::to_value(&settings)?;
                store.set(SETTINGS_KEY, json);
                store.save().map_err(|e| {
                    AppError::Other(format!("Failed to save settings store: {}", e))
                })?;
                tracing::info!("Settings migrated to v{}", SETTINGS_VERSION);
            }
            Ok(settings)
        }
        None => {
            let settings = UserSettings::default();
            let json = serde_json::to_value(&settings)?;
            store.set(SETTINGS_KEY, json);
            store
                .save()
                .map_err(|e| AppError::Other(format!("Failed to save settings store: {}", e)))?;
            tracing::info!("Created default settings v{}", SETTINGS_VERSION);
            Ok(settings)
        }
    }
}

/// Persist settings to store.
fn save_settings(app: &AppHandle, settings: &UserSettings) -> Result<(), AppError> {
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|e| AppError::Other(format!("Failed to open settings store: {}", e)))?;
    let json = serde_json::to_value(settings)?;
    store.set(SETTINGS_KEY, json);
    store
        .save()
        .map_err(|e| AppError::Other(format!("Failed to save settings store: {}", e)))?;
    Ok(())
}

/// Get all user settings. Returns defaults if file doesn't exist.
#[tauri::command(rename_all = "snake_case")]
pub fn get_settings(app: AppHandle) -> Result<UserSettings, AppError> {
    load_settings(&app)
}

/// Update settings by deep-merging a partial JSON patch.
/// Validates after merge, persists, and emits `settings:updated` event.
#[tauri::command(rename_all = "snake_case")]
pub fn update_settings(app: AppHandle, patch: serde_json::Value) -> Result<UserSettings, AppError> {
    let mut settings = load_settings(&app)?;

    let mut current_json = serde_json::to_value(&settings)?;
    deep_merge(&mut current_json, &patch);
    settings = serde_json::from_value(current_json)
        .map_err(|e| AppError::Validation(format!("Invalid settings after merge: {}", e)))?;

    validation::validate(&settings)?;
    save_settings(&app, &settings)?;

    let category = patch
        .as_object()
        .and_then(|obj| obj.keys().next())
        .map(|key| key.as_str())
        .unwrap_or("unknown")
        .to_string();

    let _ = app.emit(
        "settings:updated",
        SettingsChangedPayload {
            category,
            key: None,
        },
    );

    tracing::info!("Settings updated and persisted");
    Ok(settings)
}

/// Reset settings to defaults. If `category` is provided, only that category is reset.
#[tauri::command(rename_all = "snake_case")]
pub fn reset_settings(app: AppHandle, category: Option<String>) -> Result<UserSettings, AppError> {
    let mut settings = load_settings(&app)?;
    let defaults = UserSettings::default();

    match category.as_deref() {
        Some("appearance") => settings.appearance = defaults.appearance,
        Some("i18n") => settings.i18n = defaults.i18n,
        Some("cli") => settings.cli = defaults.cli,
        Some("sessions") => settings.sessions = defaults.sessions,
        Some("onboarding") => settings.onboarding = defaults.onboarding,
        Some("keybindings") => settings.keybindings = defaults.keybindings,
        Some("privacy") => settings.privacy = defaults.privacy,
        Some("advanced") => settings.advanced = defaults.advanced,
        Some(other) => {
            return Err(AppError::Validation(format!(
                "Unknown settings category: '{}'",
                other
            )));
        }
        None => settings = defaults,
    }

    save_settings(&app, &settings)?;

    let reset_category = category.unwrap_or_else(|| "all".to_string());
    let _ = app.emit(
        "settings:updated",
        SettingsChangedPayload {
            category: reset_category.clone(),
            key: None,
        },
    );

    tracing::info!("Settings reset: {}", reset_category);
    Ok(settings)
}

/// Deep merge `patch` into `target`. Objects are merged recursively; scalars are replaced.
fn deep_merge(target: &mut serde_json::Value, patch: &serde_json::Value) {
    if let (Some(target_obj), Some(patch_obj)) = (target.as_object_mut(), patch.as_object()) {
        for (key, value) in patch_obj {
            if value.is_object() && target_obj.contains_key(key) {
                if let Some(existing) = target_obj.get_mut(key) {
                    deep_merge(existing, value);
                }
            } else {
                target_obj.insert(key.clone(), value.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_merge_replaces_scalar() {
        let mut target = serde_json::json!({"a": 1, "b": 2});
        let patch = serde_json::json!({"a": 99});
        deep_merge(&mut target, &patch);
        assert_eq!(target["a"], 99);
        assert_eq!(target["b"], 2);
    }

    #[test]
    fn deep_merge_nested_objects() {
        let mut target = serde_json::json!({"outer": {"a": 1, "b": 2}});
        let patch = serde_json::json!({"outer": {"b": 99}});
        deep_merge(&mut target, &patch);
        assert_eq!(target["outer"]["a"], 1);
        assert_eq!(target["outer"]["b"], 99);
    }

    #[test]
    fn deep_merge_adds_new_key() {
        let mut target = serde_json::json!({"a": 1});
        let patch = serde_json::json!({"b": 2});
        deep_merge(&mut target, &patch);
        assert_eq!(target["a"], 1);
        assert_eq!(target["b"], 2);
    }
}
