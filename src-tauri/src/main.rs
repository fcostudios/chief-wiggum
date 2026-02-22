// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[allow(unused_variables)]
fn apply_platform_window_effects(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

        if let Err(e) = apply_vibrancy(window, NSVisualEffectMaterial::Sidebar, None, None) {
            tracing::warn!("Failed to apply macOS vibrancy: {:?}", e);
        } else {
            tracing::info!("Applied macOS vibrancy effect to main window");
        }
    }
}

fn main() {
    // Fix PATH for macOS/Linux GUI apps — launchd doesn't inherit shell profile.
    // Must run before CliLocation::detect() and any process spawning.
    let _ = fix_path_env::fix();

    // Initialize 3-layer tracing: console + rolling file + ring buffer (CHI-94)
    let _ring_buffer = chief_wiggum_lib::logging::init_logging();

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

    // Create the session-to-bridge map for managing CLI processes
    let bridge_map = chief_wiggum_lib::bridge::SessionBridgeMap::new();

    // Create the permission manager for handling CLI permission requests (CHI-50)
    let permission_manager = chief_wiggum_lib::bridge::PermissionManager::new();

    // Project file watcher manager (CHI-115)
    let file_watcher_manager = chief_wiggum_lib::files::watcher::FileWatcherManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .manage(db)
        .manage(cli_location)
        .manage(bridge_map)
        .manage(permission_manager)
        .manage(file_watcher_manager)
        .invoke_handler(tauri::generate_handler![
            chief_wiggum_lib::commands::session::create_session,
            chief_wiggum_lib::commands::session::list_all_sessions,
            chief_wiggum_lib::commands::session::get_session,
            chief_wiggum_lib::commands::session::delete_session,
            chief_wiggum_lib::commands::session::update_session_title,
            chief_wiggum_lib::commands::session::save_message,
            chief_wiggum_lib::commands::session::list_messages,
            chief_wiggum_lib::commands::session::update_session_model,
            chief_wiggum_lib::commands::session::update_session_cli_id,
            chief_wiggum_lib::commands::session::get_session_cost,
            chief_wiggum_lib::commands::session::toggle_session_pinned,
            chief_wiggum_lib::commands::session::duplicate_session,
            chief_wiggum_lib::commands::session::session_has_messages,
            chief_wiggum_lib::commands::cli::get_cli_info,
            chief_wiggum_lib::commands::project::pick_project_folder,
            chief_wiggum_lib::commands::project::create_project,
            chief_wiggum_lib::commands::project::list_projects,
            chief_wiggum_lib::commands::project::read_claude_md,
            chief_wiggum_lib::commands::bridge::send_to_cli,
            chief_wiggum_lib::commands::bridge::stop_session_cli,
            chief_wiggum_lib::commands::bridge::get_cli_status,
            chief_wiggum_lib::commands::bridge::respond_permission,
            chief_wiggum_lib::commands::bridge::toggle_yolo_mode,
            chief_wiggum_lib::commands::bridge::toggle_developer_mode,
            chief_wiggum_lib::commands::bridge::list_active_bridges,
            chief_wiggum_lib::commands::bridge::drain_session_buffer,
            chief_wiggum_lib::commands::slash::list_slash_commands,
            chief_wiggum_lib::commands::slash::refresh_slash_commands,
            chief_wiggum_lib::commands::files::list_project_files,
            chief_wiggum_lib::commands::files::read_project_file,
            chief_wiggum_lib::commands::files::search_project_files,
            chief_wiggum_lib::commands::files::get_file_token_estimate,
            chief_wiggum_lib::commands::files::open_project_file_in_system,
            chief_wiggum_lib::commands::files::start_project_file_watcher,
            chief_wiggum_lib::commands::files::stop_project_file_watcher,
        ])
        .setup(|app| {
            use tauri::Manager;

            let bridge_map = app
                .state::<chief_wiggum_lib::bridge::SessionBridgeMap>()
                .inner()
                .clone();

            if let Some(main_window) = app.get_webview_window("main") {
                apply_platform_window_effects(&main_window);

                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        let bridge_map = bridge_map.clone();
                        tauri::async_runtime::block_on(async move {
                            tracing::info!("App closing — shutting down all CLI processes");
                            if let Err(e) = bridge_map.shutdown_all().await {
                                tracing::warn!("Error during CLI shutdown: {}", e);
                            }
                            tracing::info!("All CLI processes shut down");
                        });
                    }
                });
            } else {
                tracing::warn!("Main window not found during setup — CLI shutdown on close will not be registered");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Chief Wiggum");
}
