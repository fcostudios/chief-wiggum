// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

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

fn default_db_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    Ok(home
        .join(".chiefwiggum")
        .join("db")
        .join("chiefwiggum.sqlite"))
}

fn archive_existing_db_files(db_path: &Path) -> Result<Vec<PathBuf>, String> {
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let mut archived = Vec::new();

    let db_variants = [
        db_path.to_path_buf(),
        PathBuf::from(format!("{}-wal", db_path.to_string_lossy())),
        PathBuf::from(format!("{}-shm", db_path.to_string_lossy())),
    ];

    for original in db_variants {
        if !original.exists() {
            continue;
        }
        let archive_path = PathBuf::from(format!(
            "{}.unrecoverable-{}",
            original.to_string_lossy(),
            timestamp
        ));
        std::fs::rename(&original, &archive_path).map_err(|e| {
            format!(
                "Failed to archive {:?} -> {:?}: {}",
                original, archive_path, e
            )
        })?;
        archived.push(archive_path);
    }

    Ok(archived)
}

fn prompt_start_fresh_db(encryption_error: &str) -> bool {
    use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};

    let description = format!(
        "Chief Wiggum could not unlock the local encrypted database.\n\n{}\n\n\
Choose OK to archive current DB files and start with a new empty database.\n\
Choose Cancel to exit without changes.",
        encryption_error
    );

    matches!(
        MessageDialog::new()
            .set_level(MessageLevel::Error)
            .set_title("Database Unlock Failed")
            .set_description(description)
            .set_buttons(MessageButtons::OkCancel)
            .show(),
        MessageDialogResult::Ok
    )
}

fn show_start_fresh_success(archived_paths: &[PathBuf]) {
    use rfd::{MessageButtons, MessageDialog, MessageLevel};

    let archived_list = if archived_paths.is_empty() {
        "No existing DB files were found to archive.".to_string()
    } else {
        archived_paths
            .iter()
            .map(|p| format!("- {}", p.to_string_lossy()))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let message = format!(
        "A new database has been created.\n\nArchived files:\n{}",
        archived_list
    );
    let _ = MessageDialog::new()
        .set_level(MessageLevel::Info)
        .set_title("Started With New Database")
        .set_description(message)
        .set_buttons(MessageButtons::Ok)
        .show();
}

fn recoverable_db_startup_error_message(err: &chief_wiggum_lib::AppError) -> Option<String> {
    match err {
        chief_wiggum_lib::AppError::DatabaseEncryption(message)
        | chief_wiggum_lib::AppError::Keychain(message) => Some(message.clone()),
        chief_wiggum_lib::AppError::Database(db_err) => {
            let message = db_err.to_string();
            if message.contains("not an error") || message.contains("file is not a database") {
                Some(format!("Database initialization failed: {}", message))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn initialize_database_with_recovery() -> chief_wiggum_lib::db::Database {
    match chief_wiggum_lib::db::Database::open_default() {
        Ok(db) => db,
        Err(err) => {
            let Some(message) = recoverable_db_startup_error_message(&err) else {
                panic!("Failed to initialize database: {}", err);
            };
            tracing::error!(
                "Database initialization failed due to encryption error: {}",
                message
            );

            if !prompt_start_fresh_db(&message) {
                tracing::warn!("User cancelled database recovery prompt");
                std::process::exit(1);
            }

            let db_path = default_db_path().unwrap_or_else(|e| {
                panic!("Failed to resolve database path for recovery: {}", e);
            });
            let archived = archive_existing_db_files(&db_path).unwrap_or_else(|e| {
                panic!("Failed to archive existing database files: {}", e);
            });

            let db = chief_wiggum_lib::db::Database::open_default().unwrap_or_else(|e| {
                panic!("Failed to initialize new database after recovery: {}", e)
            });
            show_start_fresh_success(&archived);
            db
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
    let db = initialize_database_with_recovery();
    tracing::info!("Database initialized at {:?}", db.path());

    // Detect Claude Code CLI — non-fatal if missing
    let cli_location = match chief_wiggum_lib::bridge::CliLocation::detect(None) {
        Ok(mut loc) => {
            tracing::info!("Claude Code CLI found at: {:?}", loc.resolved_path);
            let _ = loc.detect_version();
            if loc.supports_sdk() {
                tracing::info!(
                    "CLI supports Agent SDK protocol (version: {:?})",
                    loc.version
                );
            } else {
                tracing::info!(
                    "CLI does not support Agent SDK protocol — using legacy -p mode (version: {:?})",
                    loc.version
                );
            }
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
    // Project actions process manager (CHI-140)
    let action_map = chief_wiggum_lib::actions::manager::ActionBridgeMap::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(db)
        .manage(cli_location)
        .manage(bridge_map)
        .manage(permission_manager)
        .manage(file_watcher_manager)
        .manage(action_map)
        .invoke_handler(tauri::generate_handler![
            chief_wiggum_lib::commands::session::create_session,
            chief_wiggum_lib::commands::session::list_all_sessions,
            chief_wiggum_lib::commands::session::list_sessions_page,
            chief_wiggum_lib::commands::session::get_session,
            chief_wiggum_lib::commands::session::delete_session,
            chief_wiggum_lib::commands::session::update_session_title,
            chief_wiggum_lib::commands::session::save_message,
            chief_wiggum_lib::commands::session::list_messages,
            chief_wiggum_lib::commands::session::list_messages_page,
            chief_wiggum_lib::commands::session::delete_messages_after,
            chief_wiggum_lib::commands::session::delete_single_message,
            chief_wiggum_lib::commands::session::update_message_content,
            chief_wiggum_lib::commands::session::update_session_model,
            chief_wiggum_lib::commands::session::update_session_cli_id,
            chief_wiggum_lib::commands::session::get_session_cost,
            chief_wiggum_lib::commands::session::toggle_session_pinned,
            chief_wiggum_lib::commands::session::duplicate_session,
            chief_wiggum_lib::commands::session::fork_session,
            chief_wiggum_lib::commands::session::session_has_messages,
            chief_wiggum_lib::commands::session::extract_session_artifacts,
            chief_wiggum_lib::commands::session::get_session_artifacts,
            chief_wiggum_lib::commands::session::get_session_summary,
            chief_wiggum_lib::commands::settings::get_settings,
            chief_wiggum_lib::commands::settings::update_settings,
            chief_wiggum_lib::commands::settings::reset_settings,
            chief_wiggum_lib::commands::actions::discover_actions,
            chief_wiggum_lib::commands::actions::read_custom_actions,
            chief_wiggum_lib::commands::actions::save_custom_action,
            chief_wiggum_lib::commands::actions::delete_custom_action,
            chief_wiggum_lib::commands::actions::start_action,
            chief_wiggum_lib::commands::actions::stop_action,
            chief_wiggum_lib::commands::actions::restart_action,
            chief_wiggum_lib::commands::actions::list_running_actions,
            chief_wiggum_lib::commands::actions::list_all_running_actions,
            chief_wiggum_lib::commands::actions::get_action_history,
            chief_wiggum_lib::commands::cli::get_cli_info,
            chief_wiggum_lib::commands::diagnostic::export_diagnostic_bundle,
            chief_wiggum_lib::commands::export::save_export_file,
            chief_wiggum_lib::commands::export::open_path_in_shell,
            chief_wiggum_lib::commands::import::check_session_consistency,
            chief_wiggum_lib::commands::import::discover_importable_sessions,
            chief_wiggum_lib::commands::import::import_jsonl_file,
            chief_wiggum_lib::commands::import::import_jsonl_batch,
            chief_wiggum_lib::commands::logging::log_from_frontend,
            chief_wiggum_lib::commands::project::pick_project_folder,
            chief_wiggum_lib::commands::project::create_project,
            chief_wiggum_lib::commands::project::list_projects,
            chief_wiggum_lib::commands::project::read_claude_md,
            chief_wiggum_lib::commands::bridge::start_session_cli,
            chief_wiggum_lib::commands::bridge::send_to_cli,
            chief_wiggum_lib::commands::bridge::set_session_model,
            chief_wiggum_lib::commands::bridge::interrupt_session,
            chief_wiggum_lib::commands::bridge::stop_session_cli,
            chief_wiggum_lib::commands::bridge::get_cli_status,
            chief_wiggum_lib::commands::bridge::respond_permission,
            chief_wiggum_lib::commands::bridge::respond_question,
            chief_wiggum_lib::commands::bridge::toggle_yolo_mode,
            chief_wiggum_lib::commands::bridge::toggle_developer_mode,
            chief_wiggum_lib::commands::bridge::list_active_bridges,
            chief_wiggum_lib::commands::bridge::drain_session_buffer,
            chief_wiggum_lib::commands::slash::list_slash_commands,
            chief_wiggum_lib::commands::slash::refresh_slash_commands,
            chief_wiggum_lib::commands::files::list_project_files,
            chief_wiggum_lib::commands::files::read_project_file,
            chief_wiggum_lib::commands::files::resolve_file_path,
            chief_wiggum_lib::commands::files::get_file_mtime,
            chief_wiggum_lib::commands::files::search_project_files,
            chief_wiggum_lib::commands::files::list_symbols,
            chief_wiggum_lib::commands::files::get_file_token_estimate,
            chief_wiggum_lib::commands::files::get_file_suggestions,
            chief_wiggum_lib::commands::files::get_file_bundles,
            chief_wiggum_lib::commands::files::get_git_file_statuses,
            chief_wiggum_lib::commands::files::open_project_file_in_system,
            chief_wiggum_lib::commands::files::start_project_file_watcher,
            chief_wiggum_lib::commands::files::stop_project_file_watcher,
            chief_wiggum_lib::commands::files::write_file_content,
            chief_wiggum_lib::commands::files::create_file,
            chief_wiggum_lib::commands::files::create_directory,
            chief_wiggum_lib::commands::files::delete_file,
            chief_wiggum_lib::commands::files::rename_file,
            chief_wiggum_lib::commands::files::duplicate_file,
            chief_wiggum_lib::commands::files::read_changelog,
            chief_wiggum_lib::commands::templates::get_prompt_templates,
            chief_wiggum_lib::commands::templates::create_prompt_template,
            chief_wiggum_lib::commands::templates::edit_prompt_template,
            chief_wiggum_lib::commands::templates::remove_prompt_template,
            chief_wiggum_lib::commands::templates::use_prompt_template,
            chief_wiggum_lib::commands::git::git_get_repo_info,
            chief_wiggum_lib::commands::git::git_get_status,
            chief_wiggum_lib::commands::git::git_list_branches,
            chief_wiggum_lib::commands::git::git_switch_branch,
            chief_wiggum_lib::commands::git::git_create_branch,
            chief_wiggum_lib::commands::git::git_delete_branch,
        ])
        .setup(|app| {
            use tauri::Manager;

            let bridge_map = app
                .state::<chief_wiggum_lib::bridge::SessionBridgeMap>()
                .inner()
                .clone();
            let action_map = app
                .state::<chief_wiggum_lib::actions::manager::ActionBridgeMap>()
                .inner()
                .clone();

            if let Some(main_window) = app.get_webview_window("main") {
                apply_platform_window_effects(&main_window);

                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        let bridge_map = bridge_map.clone();
                        let action_map = action_map.clone();
                        tauri::async_runtime::block_on(async move {
                            tracing::info!("App closing — shutting down all CLI processes");
                            if let Err(e) = bridge_map.shutdown_all().await {
                                tracing::warn!("Error during CLI shutdown: {}", e);
                            }
                            tracing::info!("App closing — shutting down all action processes");
                            if let Err(e) = action_map.shutdown_all().await {
                                tracing::warn!("Error during action shutdown: {}", e);
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
