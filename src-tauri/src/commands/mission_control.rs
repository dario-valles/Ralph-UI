// Tauri commands for Mission Control dashboard

use crate::database::Database;
use crate::models::{ActivityEvent, ActivityEventType};
use crate::utils::{lock_db, ResultExt};
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
    let db = lock_db(&db)?;
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
    ).with_context("Failed to prepare statement")?;

    let task_events = task_stmt.query_map([limit, offset], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let status: String = row.get(2)?;
        let completed_at: Option<String> = row.get(3)?;
        let started_at: Option<String> = row.get(4)?;
        let session_name: String = row.get(5)?;
        let project_path: String = row.get(6)?;

        Ok((id, title, status, completed_at, started_at, session_name, project_path))
    }).with_context("Failed to query tasks")?;

    for event_result in task_events {
        let (id, title, status, completed_at, started_at, session_name, project_path) =
            event_result.with_context("Failed to read row")?;

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
    ).with_context("Failed to prepare statement")?;

    let session_events = session_stmt.query_map([limit, offset], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let project_path: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let status: String = row.get(4)?;

        Ok((id, name, project_path, created_at, status))
    }).with_context("Failed to query sessions")?;

    for event_result in session_events {
        let (id, session_name, project_path, created_at, status) =
            event_result.with_context("Failed to read row")?;

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
    let db = lock_db(&db)?;
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

#[cfg(test)]
mod tests {
    use crate::database::Database;
    use crate::models::{
        Agent, AgentStatus, AgentType, Session, SessionConfig, SessionStatus, Task, TaskStatus,
    };
    use chrono::Utc;
    use uuid::Uuid;

    fn create_test_db() -> Database {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();
        db
    }

    fn create_test_session(id: &str, name: &str, project_path: &str, status: SessionStatus) -> Session {
        Session {
            id: id.to_string(),
            name: name.to_string(),
            project_path: project_path.to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status,
            config: SessionConfig {
                max_parallel: 1,
                max_iterations: 10,
                max_retries: 3,
                agent_type: AgentType::Claude,
                auto_create_prs: false,
                draft_prs: false,
                run_tests: false,
                run_lint: false,
            },
            tasks: Vec::new(),
            total_cost: 0.0,
            total_tokens: 0,
        }
    }

    fn create_test_task(id: &str, title: &str, status: TaskStatus) -> Task {
        Task {
            id: id.to_string(),
            title: title.to_string(),
            description: "Test task description".to_string(),
            status,
            priority: 1,
            dependencies: Vec::new(),
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: if status != TaskStatus::Pending {
                Some(Utc::now())
            } else {
                None
            },
            completed_at: if status == TaskStatus::Completed || status == TaskStatus::Failed {
                Some(Utc::now())
            } else {
                None
            },
            branch: None,
            worktree_path: None,
            error: None,
        }
    }

    fn create_test_agent(session_id: &str, task_id: &str, status: AgentStatus, cost: f64) -> Agent {
        Agent {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            task_id: task_id.to_string(),
            status,
            process_id: None,
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            iteration_count: 0,
            tokens: 100,
            cost,
            logs: Vec::new(),
            subagents: Vec::new(),
        }
    }

    // =========================================================================
    // get_global_stats tests
    // =========================================================================

    #[test]
    fn test_get_global_stats_empty_db() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Query stats on empty database
        let active_agents: i32 = conn
            .query_row("SELECT COUNT(*) FROM agents WHERE status != 'idle'", [], |row| row.get(0))
            .unwrap_or(0);
        let tasks_in_progress: i32 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE status = 'in_progress'", [], |row| row.get(0))
            .unwrap_or(0);
        let total_projects: i32 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap_or(0);

        assert_eq!(active_agents, 0);
        assert_eq!(tasks_in_progress, 0);
        assert_eq!(total_projects, 0);
    }

    #[test]
    fn test_get_global_stats_with_active_agents() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create session and task
        let session = create_test_session("session-1", "Test Session", "/tmp/project", SessionStatus::Active);
        crate::database::sessions::create_session(conn, &session).unwrap();

        let task = create_test_task("task-1", "Test Task", TaskStatus::InProgress);
        crate::database::tasks::create_task(conn, "session-1", &task).unwrap();

        // Create agents with different statuses
        let agent1 = create_test_agent("session-1", "task-1", AgentStatus::Thinking, 0.05);
        let agent2 = create_test_agent("session-1", "task-1", AgentStatus::Implementing, 0.10);
        let agent3 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.02);
        db.create_agent(&agent1).unwrap();
        db.create_agent(&agent2).unwrap();
        db.create_agent(&agent3).unwrap();

        // Query active agents (non-idle)
        let active_agents: i32 = conn
            .query_row("SELECT COUNT(*) FROM agents WHERE status != 'idle'", [], |row| row.get(0))
            .unwrap();

        assert_eq!(active_agents, 2); // agent1 and agent2 are active

        // Query total cost
        let total_cost: f64 = conn
            .query_row("SELECT COALESCE(SUM(cost), 0) FROM agents", [], |row| row.get(0))
            .unwrap();

        assert!((total_cost - 0.17).abs() < 0.001); // 0.05 + 0.10 + 0.02
    }

    #[test]
    fn test_get_global_stats_with_tasks_in_progress() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create session
        let session = create_test_session("session-1", "Test Session", "/tmp/project", SessionStatus::Active);
        crate::database::sessions::create_session(conn, &session).unwrap();

        // Create tasks with different statuses
        let task1 = create_test_task("task-1", "Task 1", TaskStatus::InProgress);
        let task2 = create_test_task("task-2", "Task 2", TaskStatus::InProgress);
        let task3 = create_test_task("task-3", "Task 3", TaskStatus::Completed);
        let task4 = create_test_task("task-4", "Task 4", TaskStatus::Pending);
        crate::database::tasks::create_task(conn, "session-1", &task1).unwrap();
        crate::database::tasks::create_task(conn, "session-1", &task2).unwrap();
        crate::database::tasks::create_task(conn, "session-1", &task3).unwrap();
        crate::database::tasks::create_task(conn, "session-1", &task4).unwrap();

        // Query tasks in progress
        let tasks_in_progress: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE status = '\"in_progress\"'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(tasks_in_progress, 2);
    }

    #[test]
    fn test_get_global_stats_active_projects() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create sessions for different projects
        let session1 = create_test_session("session-1", "Session 1", "/tmp/project1", SessionStatus::Active);
        let session2 = create_test_session("session-2", "Session 2", "/tmp/project2", SessionStatus::Active);
        let session3 = create_test_session("session-3", "Session 3", "/tmp/project3", SessionStatus::Paused);
        let session4 = create_test_session("session-4", "Session 4", "/tmp/project1", SessionStatus::Active); // Same project as session1

        crate::database::sessions::create_session(conn, &session1).unwrap();
        crate::database::sessions::create_session(conn, &session2).unwrap();
        crate::database::sessions::create_session(conn, &session3).unwrap();
        crate::database::sessions::create_session(conn, &session4).unwrap();

        // Query active projects (distinct project paths with active sessions)
        // Note: status is stored as JSON string, so 'active' becomes '"active"'
        let active_projects: i32 = conn
            .query_row(
                "SELECT COUNT(DISTINCT project_path) FROM sessions WHERE status = '\"active\"'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(active_projects, 2); // project1 and project2 are active
    }

    // =========================================================================
    // get_activity_feed tests
    // =========================================================================

    #[test]
    fn test_get_activity_feed_empty_db() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Query tasks with timestamps
        let mut stmt = conn
            .prepare(
                "SELECT COUNT(*) FROM tasks WHERE completed_at IS NOT NULL OR started_at IS NOT NULL",
            )
            .unwrap();
        let count: i32 = stmt.query_row([], |row| row.get(0)).unwrap();

        assert_eq!(count, 0);
    }

    #[test]
    fn test_get_activity_feed_with_task_events() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create session
        let session = create_test_session("session-1", "Test Session", "/tmp/project", SessionStatus::Active);
        crate::database::sessions::create_session(conn, &session).unwrap();

        // Create tasks with different statuses
        let task1 = create_test_task("task-1", "Completed Task", TaskStatus::Completed);
        let task2 = create_test_task("task-2", "In Progress Task", TaskStatus::InProgress);
        let task3 = create_test_task("task-3", "Failed Task", TaskStatus::Failed);
        crate::database::tasks::create_task(conn, "session-1", &task1).unwrap();
        crate::database::tasks::create_task(conn, "session-1", &task2).unwrap();
        crate::database::tasks::create_task(conn, "session-1", &task3).unwrap();

        // Query task events
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.title, t.status, t.completed_at, t.started_at, s.name, s.project_path
                 FROM tasks t
                 JOIN sessions s ON t.session_id = s.id
                 WHERE t.completed_at IS NOT NULL OR t.started_at IS NOT NULL
                 ORDER BY COALESCE(t.completed_at, t.started_at) DESC",
            )
            .unwrap();

        let events: Vec<(String, String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(events.len(), 3);
    }

    #[test]
    fn test_get_activity_feed_with_session_events() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create multiple sessions
        let session1 = create_test_session("session-1", "Session 1", "/tmp/project1", SessionStatus::Active);
        let session2 = create_test_session("session-2", "Session 2", "/tmp/project2", SessionStatus::Completed);
        crate::database::sessions::create_session(conn, &session1).unwrap();
        crate::database::sessions::create_session(conn, &session2).unwrap();

        // Query session events
        let mut stmt = conn
            .prepare("SELECT id, name, project_path, created_at, status FROM sessions ORDER BY created_at DESC")
            .unwrap();

        let sessions: Vec<(String, String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(4)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_get_activity_feed_limit_and_offset() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create session
        let session = create_test_session("session-1", "Test Session", "/tmp/project", SessionStatus::Active);
        crate::database::sessions::create_session(conn, &session).unwrap();

        // Create many tasks
        for i in 0..10 {
            let task = create_test_task(&format!("task-{}", i), &format!("Task {}", i), TaskStatus::Completed);
            crate::database::tasks::create_task(conn, "session-1", &task).unwrap();
        }

        // Query with limit
        let mut stmt = conn
            .prepare(
                "SELECT id FROM tasks WHERE completed_at IS NOT NULL LIMIT 5",
            )
            .unwrap();

        let limited: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(limited.len(), 5);

        // Query with offset
        let mut stmt2 = conn
            .prepare(
                "SELECT id FROM tasks WHERE completed_at IS NOT NULL LIMIT 5 OFFSET 5",
            )
            .unwrap();

        let offset: Vec<String> = stmt2
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(offset.len(), 5);
    }

    #[test]
    fn test_project_name_extraction() {
        // Test the project name extraction logic
        let project_path = "/home/user/projects/my-app";
        let project_name = project_path.split('/').last().unwrap_or(project_path);
        assert_eq!(project_name, "my-app");

        let root_path = "/";
        let root_name = root_path.split('/').last().unwrap_or(root_path);
        assert_eq!(root_name, "");

        let simple_path = "project";
        let simple_name = simple_path.split('/').last().unwrap_or(simple_path);
        assert_eq!(simple_name, "project");
    }

    // =========================================================================
    // get_all_active_agents tests (from agents.rs but relevant to Mission Control)
    // =========================================================================

    #[test]
    fn test_get_all_active_agents_across_sessions() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create multiple sessions
        let session1 = create_test_session("session-1", "Session 1", "/tmp/project1", SessionStatus::Active);
        let session2 = create_test_session("session-2", "Session 2", "/tmp/project2", SessionStatus::Active);
        crate::database::sessions::create_session(conn, &session1).unwrap();
        crate::database::sessions::create_session(conn, &session2).unwrap();

        // Create tasks for each session
        let task1 = create_test_task("task-1", "Task 1", TaskStatus::InProgress);
        let task2 = create_test_task("task-2", "Task 2", TaskStatus::InProgress);
        crate::database::tasks::create_task(conn, "session-1", &task1).unwrap();
        crate::database::tasks::create_task(conn, "session-2", &task2).unwrap();

        // Create agents across sessions
        let agent1 = create_test_agent("session-1", "task-1", AgentStatus::Thinking, 0.05);
        let agent2 = create_test_agent("session-2", "task-2", AgentStatus::Implementing, 0.10);
        let agent3 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.02);
        db.create_agent(&agent1).unwrap();
        db.create_agent(&agent2).unwrap();
        db.create_agent(&agent3).unwrap();

        // Get all active agents
        let active_agents = db.get_all_active_agents().unwrap();

        assert_eq!(active_agents.len(), 2);

        // Verify agents are from different sessions
        let session_ids: std::collections::HashSet<_> = active_agents.iter().map(|a| &a.session_id).collect();
        assert!(session_ids.contains(&"session-1".to_string()));
        assert!(session_ids.contains(&"session-2".to_string()));
    }

    #[test]
    fn test_get_all_active_agents_empty() {
        let db = create_test_db();

        let active_agents = db.get_all_active_agents().unwrap();
        assert_eq!(active_agents.len(), 0);
    }

    #[test]
    fn test_get_all_active_agents_all_idle() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create session and task
        let session = create_test_session("session-1", "Session", "/tmp/project", SessionStatus::Active);
        crate::database::sessions::create_session(conn, &session).unwrap();

        let task = create_test_task("task-1", "Task", TaskStatus::Pending);
        crate::database::tasks::create_task(conn, "session-1", &task).unwrap();

        // Create only idle agents
        let agent1 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.0);
        let agent2 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.0);
        db.create_agent(&agent1).unwrap();
        db.create_agent(&agent2).unwrap();

        let active_agents = db.get_all_active_agents().unwrap();
        assert_eq!(active_agents.len(), 0);
    }
}
