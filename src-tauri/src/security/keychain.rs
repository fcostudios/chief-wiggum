//! OS keychain integration for database encryption key storage.
//!
//! Uses the `keyring` crate for cross-platform keychain access:
//! - macOS: Keychain Services
//! - Windows: Credential Manager
//! - Linux: Secret Service (GNOME Keyring / KDE Wallet)

use crate::AppError;
use std::fmt::Write;
use std::path::PathBuf;

const SERVICE_NAME: &str = "com.chiefwiggum.app";
const KEY_NAME: &str = "database-encryption-key";
const LEGACY_SERVICE_NAMES: &[&str] = &["com.chiefwiggum", "chiefwiggum", "chief-wiggum"];
const LEGACY_KEY_NAMES: &[&str] = &["db-encryption-key", "chiefwiggum-db-key"];
const FALLBACK_KEY_FILENAME: &str = ".db-key";

/// Retrieve the database encryption key from the canonical keychain entry.
pub fn get_db_key() -> Result<Option<String>, AppError> {
    let mut backend_errors = Vec::new();

    match get_key_from_keyring_backend() {
        Ok(Some(key)) => return Ok(Some(key)),
        Ok(None) => {}
        Err(e) => backend_errors.push(e),
    }

    #[cfg(target_os = "macos")]
    match get_key_from_macos_security_backend() {
        Ok(Some(key)) => return Ok(Some(key)),
        Ok(None) => {}
        Err(e) => backend_errors.push(e),
    }

    match get_key_from_file_backend() {
        Ok(Some(key)) => return Ok(Some(key)),
        Ok(None) => {}
        Err(e) => backend_errors.push(e),
    }

    if backend_errors.is_empty() {
        Ok(None)
    } else {
        Err(AppError::Keychain(format!(
            "No key found and key storage backends reported errors: {}",
            backend_errors.join(" | ")
        )))
    }
}

/// Store the database encryption key in the canonical keychain entry.
pub fn set_db_key(key: &str) -> Result<(), AppError> {
    let mut stored_backends: usize = 0;
    let mut backend_errors = Vec::new();

    #[cfg(target_os = "macos")]
    match set_key_in_macos_security_backend(key) {
        Ok(()) => stored_backends += 1,
        Err(e) => backend_errors.push(e),
    }

    match set_key_in_keyring_backend(key) {
        Ok(()) => stored_backends += 1,
        Err(e) => backend_errors.push(e),
    }

    match set_key_in_file_backend(key) {
        Ok(()) => stored_backends += 1,
        Err(e) => backend_errors.push(e),
    }

    if stored_backends > 0 {
        if !backend_errors.is_empty() {
            tracing::warn!(
                "Database key stored with partial backend failures: {}",
                backend_errors.join(" | ")
            );
        }
        Ok(())
    } else {
        Err(AppError::Keychain(format!(
            "Failed to store key in any backend: {}",
            backend_errors.join(" | ")
        )))
    }
}

/// Collect keys from older keychain service/key aliases.
pub fn get_legacy_db_keys() -> Result<Vec<String>, AppError> {
    let mut keys = Vec::new();
    for service in LEGACY_SERVICE_NAMES {
        for key_name in LEGACY_KEY_NAMES {
            let entry = keyring::Entry::new(service, key_name).map_err(|e| {
                AppError::Keychain(format!(
                    "Failed to access legacy keychain entry ({}/{}) : {}",
                    service, key_name, e
                ))
            })?;
            match entry.get_password() {
                Ok(key) => keys.push(key),
                Err(keyring::Error::NoEntry) => {}
                Err(e) => {
                    return Err(AppError::Keychain(format!(
                        "Failed to retrieve legacy keychain entry ({}/{}) : {}",
                        service, key_name, e
                    )));
                }
            }
        }
    }
    Ok(keys)
}

/// Optional recovery key from environment.
pub fn get_env_db_key() -> Option<String> {
    std::env::var("CHIEF_WIGGUM_DB_KEY")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Validate expected key format (64-char hex).
pub fn is_valid_db_key_format(key: &str) -> bool {
    key.len() == 64 && key.chars().all(|c| c.is_ascii_hexdigit())
}

/// Retrieve/create the canonical key for new or plaintext migration flows.
pub fn get_or_create_db_key() -> Result<String, AppError> {
    if let Some(key) = get_db_key()? {
        tracing::debug!("Retrieved existing database encryption key from keychain");
        return Ok(key);
    }

    tracing::info!("No existing encryption key found — generating new key");
    let key = generate_hex_key()?;
    set_db_key(&key)?;
    tracing::info!("Stored new database encryption key in OS keychain");
    Ok(key)
}

/// Generate a cryptographically random 256-bit hex key (64 hex chars).
pub fn generate_hex_key() -> Result<String, AppError> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| {
        AppError::DatabaseEncryption(format!("Failed to generate encryption key bytes: {}", e))
    })?;

    let mut hex = String::with_capacity(64);
    for byte in &bytes {
        write!(hex, "{:02x}", byte)
            .map_err(|e| AppError::DatabaseEncryption(format!("Hex encoding failed: {}", e)))?;
    }
    Ok(hex)
}

fn key_file_path() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Keychain("Could not determine home directory".to_string()))?;
    Ok(home
        .join(".chiefwiggum")
        .join("db")
        .join(FALLBACK_KEY_FILENAME))
}

fn get_key_from_keyring_backend() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("keyring entry access failed: {}", e))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring read failed: {}", e)),
    }
}

fn set_key_in_keyring_backend(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("keyring entry access failed: {}", e))?;
    entry
        .set_password(key)
        .map_err(|e| format!("keyring write failed: {}", e))
}

fn get_key_from_file_backend() -> Result<Option<String>, String> {
    let path = key_file_path().map_err(|e| e.to_string())?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("fallback key file read failed ({}): {}", path.display(), e))?;
    let key = raw.trim().to_string();
    if key.is_empty() {
        return Ok(None);
    }
    Ok(Some(key))
}

fn set_key_in_file_backend(key: &str) -> Result<(), String> {
    let path = key_file_path().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "failed to create fallback key directory ({}): {}",
                parent.display(),
                e
            )
        })?;
        let _ = crate::security::permissions::harden_directory_permissions(parent);
    }
    std::fs::write(&path, key.as_bytes())
        .map_err(|e| format!("fallback key file write failed ({}): {}", path.display(), e))?;
    crate::security::permissions::harden_file_permissions(&path)
        .map_err(|e| format!("fallback key file permission hardening failed: {}", e))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn get_key_from_macos_security_backend() -> Result<Option<String>, String> {
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            SERVICE_NAME,
            "-a",
            KEY_NAME,
            "-w",
        ])
        .output()
        .map_err(|e| format!("failed to invoke macOS security tool: {}", e))?;

    if output.status.success() {
        let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if key.is_empty() {
            return Ok(None);
        }
        return Ok(Some(key));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("The specified item could not be found in the keychain") {
        return Ok(None);
    }
    Err(format!(
        "macOS security read failed: {}",
        stderr.trim().to_string()
    ))
}

#[cfg(target_os = "macos")]
fn set_key_in_macos_security_backend(key: &str) -> Result<(), String> {
    let output = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            SERVICE_NAME,
            "-a",
            KEY_NAME,
            "-w",
            key,
        ])
        .output()
        .map_err(|e| format!("failed to invoke macOS security tool: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "macOS security write failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_hex_key_is_64_chars() {
        let key = generate_hex_key().expect("generate hex key");
        assert_eq!(key.len(), 64);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn generate_hex_key_is_unique() {
        let key1 = generate_hex_key().expect("generate first key");
        let key2 = generate_hex_key().expect("generate second key");
        assert_ne!(key1, key2);
    }

    #[test]
    fn key_format_validation_works() {
        assert!(is_valid_db_key_format(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        assert!(!is_valid_db_key_format("short"));
        assert!(!is_valid_db_key_format(
            "ZZZZ456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
    }
}
