//! Task-related command routing
//!
//! Handles: create_task, get_task, get_tasks_for_session, update_task,
//! delete_task, import_prd

use crate::commands;
use crate::models::*;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Route task-related commands
pub async fn route_task_command(
    cmd: &str,
    args: Value,
    _state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "create_task" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let task: Task = get_arg(&args, "task")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::create_task(session_id, task, project_path)
            )
        }

        "get_task" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::get_task(task_id, session_id, project_path)
            )
        }

        "get_tasks_for_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::get_tasks_for_session(session_id, project_path)
            )
        }

        "update_task" => {
            let task: Task = get_arg(&args, "task")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::update_task(task, session_id, project_path)
            )
        }

        "delete_task" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::tasks::delete_task(task_id, session_id, project_path))
        }

        "import_prd" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let content: String = get_arg(&args, "content")?;
            let format: Option<String> = get_opt_arg(&args, "format")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::import_prd(session_id, content, format, project_path)
            )
        }

        _ => Err(format!("Unknown task command: {}", cmd)),
    }
}

/// Check if a command is a task command
pub fn is_task_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "create_task"
            | "get_task"
            | "get_tasks_for_session"
            | "update_task"
            | "delete_task"
            | "import_prd"
    )
}
