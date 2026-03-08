//! File and directory permission hardening.
//!
//! Ensures sensitive files (DB, logs, settings, backups) are readable only by
//! the owning user.

use crate::AppError;
use std::path::Path;

/// Set file permissions to owner-only read/write (0o600 on Unix).
/// On Windows, this is a no-op (credential material is protected by OS APIs).
pub fn harden_file_permissions(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Cannot harden permissions — file not found: {:?}", path),
        )));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        tracing::debug!("Hardened file permissions to 0o600: {:?}", path);
    }

    #[cfg(windows)]
    {
        tracing::debug!(
            "File permission hardening skipped on Windows (best-effort ACL unchanged): {:?}",
            path
        );
    }

    Ok(())
}

/// Set directory permissions to owner-only read/write/execute (0o700 on Unix).
pub fn harden_directory_permissions(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "Cannot harden permissions — directory not found: {:?}",
                path
            ),
        )));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
        tracing::debug!("Hardened directory permissions to 0o700: {:?}", path);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn harden_file_permissions_sets_0600() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("sensitive.db");
        std::fs::write(&file, "data").expect("write file");

        harden_file_permissions(&file).expect("harden file permissions");

        let mode = std::fs::metadata(&file)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn harden_directory_permissions_sets_0700() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("secure-dir");
        std::fs::create_dir_all(&nested).expect("create nested");

        harden_directory_permissions(&nested).expect("harden dir permissions");

        let mode = std::fs::metadata(&nested)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o700);
    }

    #[test]
    fn harden_permissions_nonexistent_path_returns_error() {
        let result = harden_file_permissions(std::path::Path::new("/nonexistent/file.db"));
        assert!(result.is_err());
    }
}
