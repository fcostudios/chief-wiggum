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

/// Retrieve the database encryption key from the OS keychain.
/// If no key exists, generates a new 256-bit hex key and stores it.
pub fn get_or_create_db_key() -> Result<String, AppError> {
    let entry = keyring::Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| AppError::Keychain(format!("Failed to access keychain entry: {}", e)))?;

    match entry.get_password() {
        Ok(key) => {
            tracing::debug!("Retrieved existing database encryption key from keychain");
            Ok(key)
        }
        Err(keyring::Error::NoEntry) => {
            tracing::info!("No existing encryption key found — generating new key");
            let key = generate_hex_key()?;
            entry.set_password(&key).map_err(|e| {
                AppError::Keychain(format!("Failed to store key in keychain: {}", e))
            })?;
            tracing::info!("Stored new database encryption key in OS keychain");
            Ok(key)
        }
        Err(e) => Err(AppError::Keychain(format!(
            "Failed to retrieve key from keychain: {}",
            e
        ))),
    }
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
}
