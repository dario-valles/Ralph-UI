// Backend commands for Mission Control dashboard
// Uses file-based storage for aggregating stats across projects

use crate::file_storage::agents as agent_storage;
use crate::file_storage::projects as project_storage;
use crate::file_storage::sessions as session_storage;
use crate::models::{ActivityEvent, ActivityEventType, SessionStatus, TaskStatus};
use crate::utils::as_path;

/// Get activity feed for Mission Control dashboard
/// Aggregates events from tasks and sessions across all projects

pub fn get_activity_feed(
    limit: Option<i32>,
    _offset: Option<i32>,
) -> Result<Vec<ActivityEvent>, String> {
    let limit = limit.unwrap_or(50) as usize;

    let mut events: Vec<ActivityEvent> = Vec::new();

    // Get all registered projects
    let projects = project_storage::get_all_projects().unwrap_or_default();

    for project in projects {
        let project_path = as_path(&project.path);
        if !project_path.exists() {
            continue;
        }

        // Get sessions for this project
        let sessions = session_storage::list_sessions(project_path).unwrap_or_default();

        for session in sessions {
            let project_name = project.name.clone();

            // Add session start event
            let event_type = match session.status {
                SessionStatus::Completed => ActivityEventType::SessionCompleted,
                _ => ActivityEventType::SessionStarted,
            };

            let description = match event_type {
                ActivityEventType::SessionStarted => format!("Session started: {}", session.name),
                ActivityEventType::SessionCompleted => {
                    format!("Session completed: {}", session.name)
                }
                _ => session.name.clone(),
            };

            events.push(ActivityEvent {
                id: format!("session-{}", session.id),
                timestamp: session.created_at,
                event_type,
                project_path: session.project_path.clone(),
                project_name: project_name.clone(),
                session_name: session.name.clone(),
                description,
            });

            // Add task events
            for task in &session.tasks {
                // Determine event type and timestamp
                let (event_type, timestamp) = if let Some(completed_at) = task.completed_at {
                    let event_type = match task.status {
                        TaskStatus::Failed => ActivityEventType::TaskFailed,
                        _ => ActivityEventType::TaskCompleted,
                    };
                    (event_type, completed_at)
                } else if let Some(started_at) = task.started_at {
                    (ActivityEventType::TaskStarted, started_at)
                } else {
                    continue;
                };

                let description = match event_type {
                    ActivityEventType::TaskCompleted => format!("Completed: {}", task.title),
                    ActivityEventType::TaskStarted => format!("Started: {}", task.title),
                    ActivityEventType::TaskFailed => format!("Failed: {}", task.title),
                    _ => task.title.clone(),
                };

                events.push(ActivityEvent {
                    id: format!("task-{}", task.id),
                    timestamp,
                    event_type,
                    project_path: session.project_path.clone(),
                    project_name: project_name.clone(),
                    session_name: session.name.clone(),
                    description,
                });
            }
        }
    }

    // Sort by timestamp descending
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Apply limit
    events.truncate(limit);

    Ok(events)
}

/// Get global statistics for Mission Control dashboard

pub fn get_global_stats() -> Result<GlobalStats, String> {
    // Get all registered projects
    let projects = project_storage::get_all_projects().unwrap_or_default();
    let total_projects = projects.len() as i32;

    let mut active_agents_count = 0i32;
    let mut tasks_in_progress = 0i32;
    let mut tasks_completed_today = 0i32;
    let mut total_cost_today = 0.0f64;
    let mut active_projects_count = 0i32;

    let today = chrono::Utc::now().date_naive();

    for project in projects {
        let project_path = as_path(&project.path);
        if !project_path.exists() {
            continue;
        }

        // Count active agents for this project
        let active_agents = agent_storage::get_all_active_agents(project_path).unwrap_or_default();
        active_agents_count += active_agents.len() as i32;

        // Sum agent costs
        for agent in &active_agents {
            total_cost_today += agent.cost;
        }

        // Get sessions and count tasks
        let sessions = session_storage::list_sessions(project_path).unwrap_or_default();
        let mut project_has_active_session = false;

        for session in sessions {
            if matches!(session.status, SessionStatus::Active) {
                project_has_active_session = true;
            }

            for task in &session.tasks {
                // Count tasks in progress
                if matches!(task.status, TaskStatus::InProgress) {
                    tasks_in_progress += 1;
                }

                // Count tasks completed today
                if matches!(task.status, TaskStatus::Completed) {
                    if let Some(completed_at) = task.completed_at {
                        if completed_at.date_naive() == today {
                            tasks_completed_today += 1;
                        }
                    }
                }
            }
        }

        if project_has_active_session {
            active_projects_count += 1;
        }
    }

    Ok(GlobalStats {
        active_agents_count,
        tasks_in_progress,
        tasks_completed_today,
        total_cost_today,
        active_projects_count,
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
    use super::*;
    use crate::file_storage::{agents as agent_storage, projects as project_storage, sessions as session_storage};
    use crate::models::{
        Agent, AgentStatus, AgentType, Session, SessionConfig, Task,
    };
    use chrono::Utc;
    use tempfile::TempDir;
    use uuid::Uuid;

    fn setup_test_project(temp_dir: &TempDir) -> String {
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();
        temp_dir.path().to_string_lossy().to_string()
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
    // get_global_stats tests (using file storage)
    // =========================================================================

    #[test]
    fn test_get_global_stats_empty_project() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Empty project should have no active agents or tasks
        let active_agents = agent_storage::get_all_active_agents(path).unwrap();
        let sessions = session_storage::list_sessions(path).unwrap();

        assert_eq!(active_agents.len(), 0);
        assert_eq!(sessions.len(), 0);
    }

    #[test]
    fn test_get_global_stats_with_active_agents() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create agents with different statuses
        let agent1 = create_test_agent("session-1", "task-1", AgentStatus::Thinking, 0.05);
        let agent2 = create_test_agent("session-1", "task-1", AgentStatus::Implementing, 0.10);
        let agent3 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.02);
        agent_storage::save_agent_state(path, &agent1).unwrap();
        agent_storage::save_agent_state(path, &agent2).unwrap();
        agent_storage::save_agent_state(path, &agent3).unwrap();

        // Get active agents (non-idle)
        let active_agents = agent_storage::get_all_active_agents(path).unwrap();
        assert_eq!(active_agents.len(), 2); // agent1 and agent2 are active

        // Sum total cost
        let total_cost: f64 = active_agents.iter().map(|a| a.cost).sum();
        assert!((total_cost - 0.15).abs() < 0.001); // 0.05 + 0.10 (idle agent not counted)
    }

    #[test]
    fn test_get_global_stats_with_tasks_in_progress() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create session with tasks
        let mut session = create_test_session("session-1", "Test Session", &project_path, SessionStatus::Active);
        session.tasks = vec![
            create_test_task("task-1", "Task 1", TaskStatus::InProgress),
            create_test_task("task-2", "Task 2", TaskStatus::InProgress),
            create_test_task("task-3", "Task 3", TaskStatus::Completed),
            create_test_task("task-4", "Task 4", TaskStatus::Pending),
        ];
        session_storage::save_session(path, &session).unwrap();

        // Count tasks in progress
        let loaded_session = session_storage::read_session(path, "session-1").unwrap();
        let tasks_in_progress = loaded_session
            .tasks
            .iter()
            .filter(|t| matches!(t.status, TaskStatus::InProgress))
            .count();

        assert_eq!(tasks_in_progress, 2);
    }

    #[test]
    fn test_get_global_stats_active_projects() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create sessions with different statuses
        let session1 = create_test_session("session-1", "Session 1", &project_path, SessionStatus::Active);
        let session2 = create_test_session("session-2", "Session 2", &project_path, SessionStatus::Paused);

        session_storage::save_session(path, &session1).unwrap();
        session_storage::save_session(path, &session2).unwrap();

        // Count active sessions
        let sessions = session_storage::list_sessions(path).unwrap();
        let active_sessions = sessions
            .iter()
            .filter(|s| matches!(s.status, SessionStatus::Active))
            .count();

        assert_eq!(active_sessions, 1);
    }

    // =========================================================================
    // get_activity_feed tests (using file storage)
    // =========================================================================

    #[test]
    fn test_get_activity_feed_empty_project() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Empty project should have no events
        let sessions = session_storage::list_sessions(path).unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_get_activity_feed_with_task_events() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create session with tasks
        let mut session = create_test_session("session-1", "Test Session", &project_path, SessionStatus::Active);
        session.tasks = vec![
            create_test_task("task-1", "Completed Task", TaskStatus::Completed),
            create_test_task("task-2", "In Progress Task", TaskStatus::InProgress),
            create_test_task("task-3", "Failed Task", TaskStatus::Failed),
        ];
        session_storage::save_session(path, &session).unwrap();

        // Count task events (tasks with timestamps)
        let loaded_session = session_storage::read_session(path, "session-1").unwrap();
        let task_events = loaded_session
            .tasks
            .iter()
            .filter(|t| t.completed_at.is_some() || t.started_at.is_some())
            .count();

        assert_eq!(task_events, 3);
    }

    #[test]
    fn test_get_activity_feed_with_session_events() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create multiple sessions
        let session1 = create_test_session("session-1", "Session 1", &project_path, SessionStatus::Active);
        let session2 = create_test_session("session-2", "Session 2", &project_path, SessionStatus::Completed);
        session_storage::save_session(path, &session1).unwrap();
        session_storage::save_session(path, &session2).unwrap();

        // Count sessions
        let sessions = session_storage::list_sessions(path).unwrap();
        assert_eq!(sessions.len(), 2);
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
    // get_all_active_agents tests (using file storage)
    // =========================================================================

    #[test]
    fn test_get_all_active_agents_in_project() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create agents with different statuses
        let agent1 = create_test_agent("session-1", "task-1", AgentStatus::Thinking, 0.05);
        let agent2 = create_test_agent("session-2", "task-2", AgentStatus::Implementing, 0.10);
        let agent3 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.02);
        agent_storage::save_agent_state(path, &agent1).unwrap();
        agent_storage::save_agent_state(path, &agent2).unwrap();
        agent_storage::save_agent_state(path, &agent3).unwrap();

        // Get all active agents
        let active_agents = agent_storage::get_all_active_agents(path).unwrap();

        assert_eq!(active_agents.len(), 2);

        // Verify agents are from different sessions
        let session_ids: std::collections::HashSet<_> = active_agents.iter().map(|a| &a.session_id).collect();
        assert!(session_ids.contains(&"session-1".to_string()));
        assert!(session_ids.contains(&"session-2".to_string()));
    }

    #[test]
    fn test_get_all_active_agents_empty() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        let active_agents = agent_storage::get_all_active_agents(path).unwrap();
        assert_eq!(active_agents.len(), 0);
    }

    #[test]
    fn test_get_all_active_agents_all_idle() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = setup_test_project(&temp_dir);
        let path = as_path(&project_path);

        // Create only idle agents
        let agent1 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.0);
        let agent2 = create_test_agent("session-1", "task-1", AgentStatus::Idle, 0.0);
        agent_storage::save_agent_state(path, &agent1).unwrap();
        agent_storage::save_agent_state(path, &agent2).unwrap();

        let active_agents = agent_storage::get_all_active_agents(path).unwrap();
        assert_eq!(active_agents.len(), 0);
    }
}
