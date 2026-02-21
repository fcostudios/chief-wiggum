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

    // Initialize SQLite database — required for session persistence (CHI-22)
    let db = chief_wiggum_lib::db::Database::open_default().expect("Failed to initialize database");
    tracing::info!("Database initialized at {:?}", db.path());

    // Detect Claude Code CLI — non-fatal if missing
    let cli_location = match chief_wiggum_lib::bridge::CliLocation::detect(None) {
        Ok(loc) => {
            tracing::info!("Claude Code CLI found at: {:?}", loc.resolved_path);
            loc
        }
        Err(e) => {
            tracing::warn!("Claude Code CLI not found: {}", e);
            chief_wiggum_lib::bridge::CliLocation {
                path_override: None,
                resolved_path: None,
                version: None,
            }
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(db)
        .manage(cli_location)
        .invoke_handler(tauri::generate_handler![
            chief_wiggum_lib::commands::session::create_session,
            chief_wiggum_lib::commands::session::list_all_sessions,
            chief_wiggum_lib::commands::session::get_session,
            chief_wiggum_lib::commands::session::delete_session,
            chief_wiggum_lib::commands::session::update_session_title,
            chief_wiggum_lib::commands::session::save_message,
            chief_wiggum_lib::commands::session::list_messages,
            chief_wiggum_lib::commands::session::update_session_model,
            chief_wiggum_lib::commands::cli::get_cli_info,
            chief_wiggum_lib::commands::project::pick_project_folder,
            chief_wiggum_lib::commands::project::create_project,
            chief_wiggum_lib::commands::project::list_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chief Wiggum");
}
