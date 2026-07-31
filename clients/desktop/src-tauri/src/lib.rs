#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
