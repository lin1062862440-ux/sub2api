#[cfg(desktop)]
pub mod local_config;
#[cfg(desktop)]
mod text_export;
#[cfg(desktop)]
mod usage_display;

#[cfg(desktop)]
pub fn run() {
    tauri::Builder::default()
        .manage(local_config::LocalConfigHost::default())
        .manage(usage_display::UsageDisplayHost::default())
        // Forward a second-instance deep link to the running window on Windows/Linux.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::{Emitter, Manager};

            let urls: Vec<String> = argv
                .into_iter()
                .filter(|arg| arg.starts_with("linai://"))
                .collect();
            if !urls.is_empty() {
                let _ = app.emit("linai://new-url", urls);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            local_config::detect_local_client,
            local_config::preview_local_client_config,
            local_config::apply_local_client_config,
            local_config::read_local_client_files,
            local_config::validate_local_client_file,
            local_config::preview_expert_local_client_config,
            local_config::cancel_local_client_preview,
            usage_display::configure_usage_display,
            usage_display::set_usage_display_title,
            usage_display::set_floating_usage_expanded,
            usage_display::start_floating_usage_drag,
            usage_display::open_usage_display,
            usage_display::hide_usage_display,
            usage_display::open_usage_main_window,
            usage_display::quit_usage_display,
            text_export::save_text_export,
        ])
        .plugin(tauri_plugin_deep_link::init())
        // HTTP requests go through Rust (reqwest), so they are not subject to
        // the webview's CORS policy. The frontend must import `fetch` from
        // `@tauri-apps/plugin-http` rather than using the global fetch.
        .plugin(tauri_plugin_http::init())
        // Persistent key-value store on disk for auth tokens.
        .plugin(tauri_plugin_store::Builder::default().build())
        // Opens external URLs in the user's default browser (OAuth, docs).
        .plugin(tauri_plugin_opener::init())
        // Lets the shared frontend branch on the host OS instead of forking.
        .plugin(tauri_plugin_os::init())
        // Enables signed in-app desktop updates.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Lets the updater restart the app after installing a new version.
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            usage_display::setup(app)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(mobile)]
#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
