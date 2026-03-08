//! OS keychain integration for database encryption key storage.
//!
//! Uses the `keyring` crate for cross-platform keychain access:
//! - macOS: Keychain Services
//! - Windows: Credential Manager
//! - Linux: Secret Service (GNOME Keyring / KDE Wallet)

use crate::AppError;
use std::fmt::Write;

const SERVICE_NAME: &str = "com.chiefwiggum.app";
const KEY_NAME: &str = "database-encryption-key";
const LEGACY_SERVICE_NAMES: &[&str] = &["com.chiefwiggum", "chiefwiggum", "chief-wiggum"];
const LEGACY_KEY_NAMES: &[&str] = &["db-encryption-key", "chiefwiggum-db-key"];

/// Retrieve the database encryption key from the canonical keychain entry.
pub fn get_db_key() -> Result<Option<String>, AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| AppError::Keychain(format!("Failed to access keychain entry: {}", e)))?;

    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keychain(format!(
            "Failed to retrieve key from keychain: {}",
            e
        ))),
    }
}

/// Store the database encryption key in the canonical keychain entry.
pub fn set_db_key(key: &str) -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| AppError::Keychain(format!("Failed to access keychain entry: {}", e)))?;

    entry
        .set_password(key)
        .map_err(|e| AppError::Keychain(format!("Failed to store key in keychain: {}", e)))
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
