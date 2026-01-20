// Task database operations

use crate::models::Task;
use rusqlite::{params, Connection, Result};
use chrono::Utc;

/// Clean markdown table syntax from a description string
/// This handles cases where the AI extracted raw table rows instead of clean descriptions
fn clean_task_description(description: &str) -> String {
    let trimmed = description.trim();

    // If it doesn't contain table syntax, return as-is
    if !trimmed.contains('|') {
        return trimmed.to_string();
    }

    // Check if this looks like a markdown table
    let looks_like_table = trimmed.starts_with('|')
        || trimmed.contains("|---|")
        || trimmed.contains("| # |")
        || trimmed.contains("| Task ID |")
        || trimmed.contains("| Status |");

    if !looks_like_table {
        return trimmed.to_string();
    }

    // Try to extract actual description from table format
    let mut cleaned_parts: Vec<String> = Vec::new();

    for line in trimmed.lines() {
        let line = line.trim();

        // Skip header/separator rows
        if line.is_empty()
            || line.contains("|---|")
            || line.contains("| # |")
            || line.contains("| Task ID |")
            || line.contains("| Task |")
            || line.contains("| Status |")
            || line.starts_with("|---")
        {
            continue;
        }

        // Split by pipe and try to find meaningful content
        if line.starts_with('|') {
            let cells: Vec<&str> = line.split('|')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            // For a typical task table: [#, Task ID, Task Title, Description, Status]
            // The Description is usually index 3 (4th column)
            if cells.len() >= 4 {
                let desc_candidate = cells[3];
                if !desc_candidate.is_empty()
                    && !desc_candidate.chars().all(|c| c == '-' || c.is_whitespace())
                    && !desc_candidate.starts_with("P")
                {
                    cleaned_parts.push(desc_candidate.to_string());
                }
            } else if cells.len() >= 2 {
                // Try to find the longest cell as it's likely the description
                if let Some(longest) = cells.iter()
                    .filter(|s| !s.chars().all(|c| c == '-' || c.is_whitespace() || c.is_numeric()))
                    .max_by_key(|s| s.len())
                {
                    if longest.len() > 10 {
                        cleaned_parts.push(longest.to_string());
                    }
                }
            }
        }
    }

    if cleaned_parts.is_empty() {
        // Fallback: strip all pipe characters and clean up
        trimmed
            .replace('|', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        cleaned_parts.join(" ")
    }
}

/// Create a new task in the database
pub fn create_task(conn: &Connection, session_id: &str, task: &Task) -> Result<()> {
    let dependencies_json = serde_json::to_string(&task.dependencies)
        .unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO tasks (
            id, session_id, title, description, status, priority,
            dependencies, assigned_agent, estimated_tokens, actual_tokens,
            started_at, completed_at, branch, worktree_path, error
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            task.id,
            session_id,
            task.title,
            task.description,
            serde_json::to_string(&task.status).unwrap_or_default(),
            task.priority,
            dependencies_json,
            task.assigned_agent,
            task.estimated_tokens,
            task.actual_tokens,
            task.started_at.map(|dt| dt.to_rfc3339()),
            task.completed_at.map(|dt| dt.to_rfc3339()),
            task.branch,
            task.worktree_path,
            task.error,
        ],
    )?;

    Ok(())
}

/// Get a task by ID
pub fn get_task(conn: &Connection, task_id: &str) -> Result<Task> {
    conn.query_row(
        "SELECT id, title, description, status, priority, dependencies,
                assigned_agent, estimated_tokens, actual_tokens, started_at,
                completed_at, branch, worktree_path, error
         FROM tasks WHERE id = ?1",
        params![task_id],
        |row| {
            let dependencies_str: String = row.get(5)?;
            let dependencies = serde_json::from_str(&dependencies_str)
                .unwrap_or_default();

            let status_str: String = row.get(3)?;
            let status = serde_json::from_str(&status_str)
                .unwrap_or(crate::models::TaskStatus::Pending);

            let started_at: Option<String> = row.get(9)?;
            let completed_at: Option<String> = row.get(10)?;

            // Clean description to remove any markdown table syntax
            let raw_description: String = row.get(2)?;
            let description = clean_task_description(&raw_description);

            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description,
                status,
                priority: row.get(4)?,
                dependencies,
                assigned_agent: row.get(6)?,
                estimated_tokens: row.get(7)?,
                actual_tokens: row.get(8)?,
                started_at: started_at.and_then(|s| s.parse().ok()),
                completed_at: completed_at.and_then(|s| s.parse().ok()),
                branch: row.get(11)?,
                worktree_path: row.get(12)?,
                error: row.get(13)?,
            })
        },
    )
}

/// Get all tasks for a session
pub fn get_tasks_for_session(conn: &Connection, session_id: &str) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, priority, dependencies,
                assigned_agent, estimated_tokens, actual_tokens, started_at,
                completed_at, branch, worktree_path, error
         FROM tasks WHERE session_id = ?1
         ORDER BY priority ASC, id ASC",
    )?;

    let tasks = stmt.query_map(params![session_id], |row| {
        let dependencies_str: String = row.get(5)?;
        let dependencies = serde_json::from_str(&dependencies_str)
            .unwrap_or_default();

        let status_str: String = row.get(3)?;
        let status = serde_json::from_str(&status_str)
            .unwrap_or(crate::models::TaskStatus::Pending);

        let started_at: Option<String> = row.get(9)?;
        let completed_at: Option<String> = row.get(10)?;

        // Clean description to remove any markdown table syntax
        let raw_description: String = row.get(2)?;
        let description = clean_task_description(&raw_description);

        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description,
            status,
            priority: row.get(4)?,
            dependencies,
            assigned_agent: row.get(6)?,
            estimated_tokens: row.get(7)?,
            actual_tokens: row.get(8)?,
            started_at: started_at.and_then(|s| s.parse().ok()),
            completed_at: completed_at.and_then(|s| s.parse().ok()),
            branch: row.get(11)?,
            worktree_path: row.get(12)?,
            error: row.get(13)?,
        })
    })?;

    tasks.collect()
}

/// Update a task
pub fn update_task(conn: &Connection, task: &Task) -> Result<()> {
    let dependencies_json = serde_json::to_string(&task.dependencies)
        .unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "UPDATE tasks SET
            title = ?1, description = ?2, status = ?3, priority = ?4,
            dependencies = ?5, assigned_agent = ?6, estimated_tokens = ?7,
            actual_tokens = ?8, started_at = ?9, completed_at = ?10,
            branch = ?11, worktree_path = ?12, error = ?13
         WHERE id = ?14",
        params![
            task.title,
            task.description,
            serde_json::to_string(&task.status).unwrap_or_default(),
            task.priority,
            dependencies_json,
            task.assigned_agent,
            task.estimated_tokens,
            task.actual_tokens,
            task.started_at.map(|dt| dt.to_rfc3339()),
            task.completed_at.map(|dt| dt.to_rfc3339()),
            task.branch,
            task.worktree_path,
            task.error,
            task.id,
        ],
    )?;

    Ok(())
}

/// Delete a task
pub fn delete_task(conn: &Connection, task_id: &str) -> Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])?;
    Ok(())
}

/// Get the session ID for a task
pub fn get_session_id_for_task(conn: &Connection, task_id: &str) -> Result<String> {
    conn.query_row(
        "SELECT session_id FROM tasks WHERE id = ?1",
        params![task_id],
        |row| row.get(0),
    )
}

/// Update task status
pub fn update_task_status(
    conn: &Connection,
    task_id: &str,
    status: crate::models::TaskStatus,
) -> Result<()> {
    let now = Utc::now();

    match status {
        crate::models::TaskStatus::InProgress => {
            conn.execute(
                "UPDATE tasks SET status = ?1, started_at = ?2 WHERE id = ?3",
                params![
                    serde_json::to_string(&status).unwrap_or_default(),
                    now.to_rfc3339(),
                    task_id
                ],
            )?;
        }
        crate::models::TaskStatus::Completed | crate::models::TaskStatus::Failed => {
            conn.execute(
                "UPDATE tasks SET status = ?1, completed_at = ?2 WHERE id = ?3",
                params![
                    serde_json::to_string(&status).unwrap_or_default(),
                    now.to_rfc3339(),
                    task_id
                ],
            )?;
        }
        _ => {
            conn.execute(
                "UPDATE tasks SET status = ?1 WHERE id = ?2",
                params![serde_json::to_string(&status).unwrap_or_default(), task_id],
            )?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Task, TaskStatus};
    use uuid::Uuid;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Enable foreign key enforcement
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                priority INTEGER NOT NULL,
                dependencies TEXT,
                assigned_agent TEXT,
                estimated_tokens INTEGER,
                actual_tokens INTEGER,
                started_at TEXT,
                completed_at TEXT,
                branch TEXT,
                worktree_path TEXT,
                error TEXT
            )",
            [],
        ).unwrap();

        conn
    }

    fn create_test_task(id: &str, title: &str) -> Task {
        Task {
            id: id.to_string(),
            title: title.to_string(),
            description: "Test description".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: vec![],
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        }
    }

    #[test]
    fn test_create_and_get_task() {
        let conn = setup_test_db();
        let session_id = Uuid::new_v4().to_string();
        let task = create_test_task("task-1", "Test Task");

        let result = create_task(&conn, &session_id, &task);
        assert!(result.is_ok());

        let retrieved = get_task(&conn, "task-1");
        assert!(retrieved.is_ok());

        let retrieved_task = retrieved.unwrap();
        assert_eq!(retrieved_task.id, "task-1");
        assert_eq!(retrieved_task.title, "Test Task");
    }

    #[test]
    fn test_get_tasks_for_session() {
        let conn = setup_test_db();
        let session_id = Uuid::new_v4().to_string();

        let task1 = create_test_task("task-1", "Task 1");
        let task2 = create_test_task("task-2", "Task 2");

        create_task(&conn, &session_id, &task1).unwrap();
        create_task(&conn, &session_id, &task2).unwrap();

        let tasks = get_tasks_for_session(&conn, &session_id);
        assert!(tasks.is_ok());

        let tasks = tasks.unwrap();
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn test_update_task() {
        let conn = setup_test_db();
        let session_id = Uuid::new_v4().to_string();
        let mut task = create_test_task("task-1", "Original Title");

        create_task(&conn, &session_id, &task).unwrap();

        task.title = "Updated Title".to_string();
        task.description = "Updated description".to_string();

        let result = update_task(&conn, &task);
        assert!(result.is_ok());

        let updated = get_task(&conn, "task-1").unwrap();
        assert_eq!(updated.title, "Updated Title");
        assert_eq!(updated.description, "Updated description");
    }

    #[test]
    fn test_delete_task() {
        let conn = setup_test_db();
        let session_id = Uuid::new_v4().to_string();
        let task = create_test_task("task-1", "Task to Delete");

        create_task(&conn, &session_id, &task).unwrap();

        let result = delete_task(&conn, "task-1");
        assert!(result.is_ok());

        let retrieved = get_task(&conn, "task-1");
        assert!(retrieved.is_err());
    }

    #[test]
    fn test_update_task_status() {
        let conn = setup_test_db();
        let session_id = Uuid::new_v4().to_string();
        let task = create_test_task("task-1", "Task");

        create_task(&conn, &session_id, &task).unwrap();

        update_task_status(&conn, "task-1", TaskStatus::InProgress).unwrap();
        let updated = get_task(&conn, "task-1").unwrap();
        assert_eq!(updated.status, TaskStatus::InProgress);
        assert!(updated.started_at.is_some());

        update_task_status(&conn, "task-1", TaskStatus::Completed).unwrap();
        let updated = get_task(&conn, "task-1").unwrap();
        assert_eq!(updated.status, TaskStatus::Completed);
        assert!(updated.completed_at.is_some());
    }

    #[test]
    fn test_task_with_dependencies() {
        let conn = setup_test_db();
        let session_id = Uuid::new_v4().to_string();
        let mut task = create_test_task("task-2", "Dependent Task");
        task.dependencies = vec!["task-1".to_string(), "task-0".to_string()];

        create_task(&conn, &session_id, &task).unwrap();

        let retrieved = get_task(&conn, "task-2").unwrap();
        assert_eq!(retrieved.dependencies, vec!["task-1", "task-0"]);
    }
}
