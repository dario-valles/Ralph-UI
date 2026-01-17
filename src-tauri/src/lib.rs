// Module declarations
mod commands;
mod models;
mod database;
mod git;
mod agents;
mod utils;

// Re-export models for use in commands
pub use models::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::create_session,
            commands::get_sessions,
            commands::get_session,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
