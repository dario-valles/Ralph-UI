// Tauri commands for Mission Control dashboard

use crate::database::Database;
use crate::models::{ActivityEvent, ActivityEventType};
use std::sync::Mutex;
use tauri::State;

/// Get activity feed for Mission Control dashboard
/// Aggregates events from tasks and sessions across all projects
#[tauri::command]
pub fn get_activity_feed(
    db: State<Mutex<Database>>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<ActivityEvent>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let mut events: Vec<ActivityEvent> = Vec::new();

    // Get task completion events
    let mut task_stmt = conn.prepare(
        "SELECT t.id, t.title, t.status, t.completed_at, t.started_at,
                s.name as session_name, s.project_path
         FROM tasks t
         JOIN sessions s ON t.session_id = s.id
         WHERE t.completed_at IS NOT NULL OR t.started_at IS NOT NULL
         ORDER BY COALESCE(t.completed_at, t.started_at) DESC
         LIMIT ?1 OFFSET ?2"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let task_events = task_stmt.query_map([limit, offset], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let status: String = row.get(2)?;
        let completed_at: Option<String> = row.get(3)?;
        let started_at: Option<String> = row.get(4)?;
        let session_name: String = row.get(5)?;
        let project_path: String = row.get(6)?;

        Ok((id, title, status, completed_at, started_at, session_name, project_path))
    }).map_err(|e| format!("Failed to query tasks: {}", e))?;

    for event_result in task_events {
        let (id, title, status, completed_at, started_at, session_name, project_path) =
            event_result.map_err(|e| format!("Failed to read row: {}", e))?;

        // Extract project name from path
        let project_name = project_path
            .split('/')
            .last()
            .unwrap_or(&project_path)
            .to_string();

        // Determine event type and timestamp
        let (event_type, timestamp_str) = if let Some(completed) = completed_at {
            let event_type = match status.as_str() {
                "failed" => ActivityEventType::TaskFailed,
                _ => ActivityEventType::TaskCompleted,
            };
            (event_type, completed)
        } else if let Some(started) = started_at {
            (ActivityEventType::TaskStarted, started)
        } else {
            continue;
        };

        let timestamp = chrono::DateTime::parse_from_rfc3339(&timestamp_str)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(|_| chrono::Utc::now());

        let description = match event_type {
            ActivityEventType::TaskCompleted => format!("Completed: {}", title),
            ActivityEventType::TaskStarted => format!("Started: {}", title),
            ActivityEventType::TaskFailed => format!("Failed: {}", title),
            _ => title.clone(),
        };

        events.push(ActivityEvent {
            id: format!("task-{}", id),
            timestamp,
            event_type,
            project_path,
            project_name,
            session_name,
            description,
        });
    }

    // Get session start events
    let mut session_stmt = conn.prepare(
        "SELECT id, name, project_path, created_at, status
         FROM sessions
         ORDER BY created_at DESC
         LIMIT ?1 OFFSET ?2"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let session_events = session_stmt.query_map([limit, offset], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let project_path: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let status: String = row.get(4)?;

        Ok((id, name, project_path, created_at, status))
    }).map_err(|e| format!("Failed to query sessions: {}", e))?;

    for event_result in session_events {
        let (id, session_name, project_path, created_at, status) =
            event_result.map_err(|e| format!("Failed to read row: {}", e))?;

        let project_name = project_path
            .split('/')
            .last()
            .unwrap_or(&project_path)
            .to_string();

        let timestamp = chrono::DateTime::parse_from_rfc3339(&created_at)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(|_| chrono::Utc::now());

        let event_type = match status.as_str() {
            "completed" => ActivityEventType::SessionCompleted,
            _ => ActivityEventType::SessionStarted,
        };

        let description = match event_type {
            ActivityEventType::SessionStarted => format!("Session started: {}", session_name),
            ActivityEventType::SessionCompleted => format!("Session completed: {}", session_name),
            _ => session_name.clone(),
        };

        events.push(ActivityEvent {
            id: format!("session-{}", id),
            timestamp,
            event_type,
            project_path,
            project_name,
            session_name,
            description,
        });
    }

    // Sort by timestamp descending
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Apply limit
    events.truncate(limit as usize);

    Ok(events)
}

/// Get global statistics for Mission Control dashboard
#[tauri::command]
pub fn get_global_stats(
    db: State<Mutex<Database>>,
) -> Result<GlobalStats, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    // Count active agents
    let active_agents: i32 = conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE status != 'idle'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    // Count tasks in progress
    let tasks_in_progress: i32 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE status = 'in_progress'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    // Count tasks completed today
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let tasks_completed_today: i32 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND date(completed_at) = ?1",
        [&today],
        |row| row.get(0)
    ).unwrap_or(0);

    // Total cost today (from agents)
    let total_cost_today: f64 = conn.query_row(
        "SELECT COALESCE(SUM(cost), 0) FROM agents",
        [],
        |row| row.get(0)
    ).unwrap_or(0.0);

    // Count active projects (projects with active sessions)
    let active_projects: i32 = conn.query_row(
        "SELECT COUNT(DISTINCT project_path) FROM sessions WHERE status = 'active'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    // Total projects
    let total_projects: i32 = conn.query_row(
        "SELECT COUNT(*) FROM projects",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

    Ok(GlobalStats {
        active_agents_count: active_agents,
        tasks_in_progress,
        tasks_completed_today,
        total_cost_today,
        active_projects_count: active_projects,
        total_projects,
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStats {
    pub active_agents_count: i32,
    pub tasks_in_progress: i32,
    pub tasks_completed_today: i32,
    pub total_cost_today: f64,
    pub active_projects_count: i32,
    pub total_projects: i32,
}
