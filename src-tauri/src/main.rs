// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Initialize tracing subscriber for structured logging per GUIDE-001 §2.5
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting Chief Wiggum v{}", env!("CARGO_PKG_VERSION"));

    // Initialize SQLite database (CHI-11)
    match chief_wiggum_lib::db::Database::open_default() {
        Ok(db) => {
            tracing::info!("Database initialized at {:?}", db.path());
        }
        Err(e) => {
            tracing::error!("Failed to initialize database: {}", e);
            // Continue without database — degraded mode
            // TODO(CHI-22): proper error dialog on db init failure
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running Chief Wiggum");
}
