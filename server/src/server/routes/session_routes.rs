//! Session-related command routing
//!
//! Handles: create_session, get_sessions, get_sessions_index, get_session,
//! update_session, delete_session

use crate::commands;
use crate::file_storage;
use crate::models::*;
use crate::utils::as_path;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Route session-related commands
pub async fn route_session_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "create_session" => {
            let name: String = get_arg(&args, "name")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let config: Option<SessionConfig> = get_opt_arg(&args, "config")?;

            let session_config = config.unwrap_or_else(|| {
                state
                    .config_state
                    .get_config()
                    .map(|c| (&c).into())
                    .unwrap_or_default()
            });
            session_config.validate()?;

            let session = Session {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                project_path: project_path.clone(),
                created_at: chrono::Utc::now(),
                last_resumed_at: None,
                status: SessionStatus::Active,
                config: session_config,
                tasks: vec![],
                total_cost: 0.0,
                total_tokens: 0,
            };

            file_storage::sessions::save_session(as_path(&project_path), &session)?;
            serde_json::to_value(session).map_err(|e| e.to_string())
        }

        "get_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::sessions::get_sessions(project_path))
        }

        "get_sessions_index" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::sessions::get_sessions_index(project_path))
        }

        "get_session" => {
            let id: String = get_arg(&args, "id")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::sessions::get_session(id, project_path))
        }

        "update_session" => {
            let session: Session = get_arg(&args, "session")?;
            route_async!(cmd, commands::sessions::update_session(session))
        }

        "delete_session" => {
            let id: String = get_arg(&args, "id")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::sessions::delete_session(id, project_path))
        }

        _ => Err(format!("Unknown session command: {}", cmd)),
    }
}

/// Check if a command is a session command
pub fn is_session_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "create_session"
            | "get_sessions"
            | "get_sessions_index"
            | "get_session"
            | "update_session"
            | "delete_session"
    )
}
