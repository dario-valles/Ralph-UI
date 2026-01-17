// Module declarations
mod commands;
mod models;
mod database;
mod git;
mod agents;
mod utils;
mod parsers;

// Re-export models for use in commands
pub use models::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    env_logger::init();

    // Initialize database
    let db_path = std::env::var("RALPH_DB_PATH")
        .unwrap_or_else(|_| {
            let mut path = std::env::current_dir().unwrap();
            path.push("ralph-ui.db");
            path.to_str().unwrap().to_string()
        });

    let db = database::Database::new(&db_path)
        .expect("Failed to open database");

    db.init().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(db))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::create_session,
            commands::get_sessions,
            commands::get_session,
            commands::update_session,
            commands::delete_session,
            commands::update_session_status,
            commands::create_task,
            commands::get_task,
            commands::get_tasks_for_session,
            commands::update_task,
            commands::delete_task,
            commands::update_task_status,
            commands::import_prd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
