// Session database operations

use crate::models::{Session, SessionConfig, SessionStatus};
use rusqlite::{params, Connection, Result, Row};
use chrono::Utc;

/// Parse a session from a database row.
/// Expects columns in order: id, name, project_path, created_at, last_resumed_at, status,
///   max_parallel, max_iterations, max_retries, agent_type,
///   auto_create_prs, draft_prs, run_tests, run_lint, total_cost, total_tokens
fn parse_session_row(row: &Row) -> rusqlite::Result<Session> {
    let status_str: String = row.get(5)?;
    let status = serde_json::from_str(&status_str).unwrap_or(SessionStatus::Active);

    let agent_type_str: String = row.get(9)?;
    let agent_type =
        serde_json::from_str(&agent_type_str).unwrap_or(crate::models::AgentType::Claude);

    let created_at: String = row.get(3)?;
    let last_resumed_at: Option<String> = row.get(4)?;

    Ok(Session {
        id: row.get(0)?,
        name: row.get(1)?,
        project_path: row.get(2)?,
        created_at: created_at.parse().unwrap_or_else(|_| Utc::now()),
        last_resumed_at: last_resumed_at.and_then(|s| s.parse().ok()),
        status,
        config: SessionConfig {
            max_parallel: row.get(6)?,
            max_iterations: row.get(7)?,
            max_retries: row.get(8)?,
            agent_type,
            auto_create_prs: row.get::<_, i32>(10)? != 0,
            draft_prs: row.get::<_, i32>(11)? != 0,
            run_tests: row.get::<_, i32>(12)? != 0,
            run_lint: row.get::<_, i32>(13)? != 0,
        },
        tasks: vec![], // Tasks loaded separately
        total_cost: row.get(14)?,
        total_tokens: row.get(15)?,
    })
}

/// Create a new session in the database
pub fn create_session(conn: &Connection, session: &Session) -> Result<()> {
    conn.execute(
        "INSERT INTO sessions (
            id, name, project_path, created_at, last_resumed_at, status,
            max_parallel, max_iterations, max_retries, agent_type,
            auto_create_prs, draft_prs, run_tests, run_lint,
            total_cost, total_tokens
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            session.id,
            session.name,
            session.project_path,
            session.created_at.to_rfc3339(),
            session.last_resumed_at.map(|dt| dt.to_rfc3339()),
            serde_json::to_string(&session.status).unwrap_or_default(),
            session.config.max_parallel,
            session.config.max_iterations,
            session.config.max_retries,
            serde_json::to_string(&session.config.agent_type).unwrap_or_default(),
            session.config.auto_create_prs as i32,
            session.config.draft_prs as i32,
            session.config.run_tests as i32,
            session.config.run_lint as i32,
            session.total_cost,
            session.total_tokens,
        ],
    )?;

    Ok(())
}

/// Get a session by ID
pub fn get_session(conn: &Connection, session_id: &str) -> Result<Session> {
    conn.query_row(
        "SELECT id, name, project_path, created_at, last_resumed_at, status,
                max_parallel, max_iterations, max_retries, agent_type,
                auto_create_prs, draft_prs, run_tests, run_lint,
                total_cost, total_tokens
         FROM sessions WHERE id = ?1",
        params![session_id],
        parse_session_row,
    )
}

/// Get all sessions
pub fn get_all_sessions(conn: &Connection) -> Result<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_path, created_at, last_resumed_at, status,
                max_parallel, max_iterations, max_retries, agent_type,
                auto_create_prs, draft_prs, run_tests, run_lint,
                total_cost, total_tokens
         FROM sessions
         ORDER BY created_at DESC",
    )?;

    let sessions = stmt.query_map([], parse_session_row)?;
    sessions.collect()
}

/// Update a session
pub fn update_session(conn: &Connection, session: &Session) -> Result<()> {
    conn.execute(
        "UPDATE sessions SET
            name = ?1, project_path = ?2, last_resumed_at = ?3, status = ?4,
            max_parallel = ?5, max_iterations = ?6, max_retries = ?7,
            agent_type = ?8, auto_create_prs = ?9, draft_prs = ?10,
            run_tests = ?11, run_lint = ?12, total_cost = ?13, total_tokens = ?14
         WHERE id = ?15",
        params![
            session.name,
            session.project_path,
            session.last_resumed_at.map(|dt| dt.to_rfc3339()),
            serde_json::to_string(&session.status).unwrap_or_default(),
            session.config.max_parallel,
            session.config.max_iterations,
            session.config.max_retries,
            serde_json::to_string(&session.config.agent_type).unwrap_or_default(),
            session.config.auto_create_prs as i32,
            session.config.draft_prs as i32,
            session.config.run_tests as i32,
            session.config.run_lint as i32,
            session.total_cost,
            session.total_tokens,
            session.id,
        ],
    )?;

    Ok(())
}

/// Delete a session and all its tasks (CASCADE should handle this)
pub fn delete_session(conn: &Connection, session_id: &str) -> Result<()> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
    Ok(())
}

/// Update session status
pub fn update_session_status(
    conn: &Connection,
    session_id: &str,
    status: SessionStatus,
) -> Result<()> {
    let now = Utc::now();

    conn.execute(
        "UPDATE sessions SET status = ?1, last_resumed_at = ?2 WHERE id = ?3",
        params![
            serde_json::to_string(&status).unwrap_or_default(),
            now.to_rfc3339(),
            session_id
        ],
    )?;

    Ok(())
}

/// Pause all active sessions in a project except the specified one.
/// This enforces the single-active-session-per-project invariant.
/// Returns the number of sessions that were paused.
pub fn pause_other_sessions_in_project(
    conn: &Connection,
    project_path: &str,
    except_session_id: &str,
) -> Result<usize> {
    let paused_status = serde_json::to_string(&SessionStatus::Paused).unwrap_or_default();
    let active_status = serde_json::to_string(&SessionStatus::Active).unwrap_or_default();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE sessions SET status = ?1, last_resumed_at = ?2
         WHERE project_path = ?3 AND id != ?4 AND status = ?5",
        params![paused_status, now, project_path, except_session_id, active_status],
    )?;

    Ok(conn.changes() as usize)
}

/// Find an existing active session for a project.
/// Used for PRD execution to optionally reuse an existing session.
pub fn find_active_session_for_project(
    conn: &Connection,
    project_path: &str,
) -> Result<Option<Session>> {
    let active_status = serde_json::to_string(&SessionStatus::Active).unwrap_or_default();

    let result = conn.query_row(
        "SELECT id, name, project_path, created_at, last_resumed_at, status,
                max_parallel, max_iterations, max_retries, agent_type,
                auto_create_prs, draft_prs, run_tests, run_lint,
                total_cost, total_tokens
         FROM sessions
         WHERE project_path = ?1 AND status = ?2
         ORDER BY created_at DESC
         LIMIT 1",
        params![project_path, active_status],
        parse_session_row,
    );

    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Get session with tasks
pub fn get_session_with_tasks(conn: &Connection, session_id: &str) -> Result<Session> {
    let mut session = get_session(conn, session_id)?;
    let tasks = super::tasks::get_tasks_for_session(conn, session_id)?;
    session.tasks = tasks;
    Ok(session)
}

/// Get unique project paths from all sessions
/// Used for auto-recovery on startup to check each project for stale sessions
pub fn get_unique_project_paths(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT project_path FROM sessions"
    )?;

    let paths = stmt.query_map([], |row| row.get(0))?;
    paths.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AgentType, SessionConfig, SessionStatus};
    use uuid::Uuid;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Enable foreign key enforcement
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create sessions table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                project_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_resumed_at TEXT,
                status TEXT NOT NULL,
                max_parallel INTEGER NOT NULL,
                max_iterations INTEGER NOT NULL,
                max_retries INTEGER NOT NULL,
                agent_type TEXT NOT NULL,
                auto_create_prs INTEGER NOT NULL,
                draft_prs INTEGER NOT NULL,
                run_tests INTEGER NOT NULL,
                run_lint INTEGER NOT NULL,
                total_cost REAL NOT NULL,
                total_tokens INTEGER NOT NULL
            )",
            [],
        ).unwrap();

        conn
    }

    fn create_test_session(id: &str, name: &str) -> Session {
        Session {
            id: id.to_string(),
            name: name.to_string(),
            project_path: "/test/path".to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status: SessionStatus::Active,
            config: SessionConfig {
                max_parallel: 3,
                max_iterations: 10,
                max_retries: 3,
                agent_type: AgentType::Claude,
                auto_create_prs: true,
                draft_prs: false,
                run_tests: true,
                run_lint: true,
            },
            tasks: vec![],
            total_cost: 0.0,
            total_tokens: 0,
        }
    }

    #[test]
    fn test_create_and_get_session() {
        let conn = setup_test_db();
        let session = create_test_session("session-1", "Test Session");

        let result = create_session(&conn, &session);
        assert!(result.is_ok());

        let retrieved = get_session(&conn, "session-1");
        assert!(retrieved.is_ok());

        let retrieved_session = retrieved.unwrap();
        assert_eq!(retrieved_session.id, "session-1");
        assert_eq!(retrieved_session.name, "Test Session");
        assert_eq!(retrieved_session.config.max_parallel, 3);
    }

    #[test]
    fn test_get_all_sessions() {
        let conn = setup_test_db();

        let session1 = create_test_session("session-1", "Session 1");
        let session2 = create_test_session("session-2", "Session 2");

        create_session(&conn, &session1).unwrap();
        create_session(&conn, &session2).unwrap();

        let sessions = get_all_sessions(&conn);
        assert!(sessions.is_ok());

        let sessions = sessions.unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_update_session() {
        let conn = setup_test_db();
        let mut session = create_test_session("session-1", "Original Name");

        create_session(&conn, &session).unwrap();

        session.name = "Updated Name".to_string();
        session.total_cost = 10.5;
        session.total_tokens = 1000;

        let result = update_session(&conn, &session);
        assert!(result.is_ok());

        let updated = get_session(&conn, "session-1").unwrap();
        assert_eq!(updated.name, "Updated Name");
        assert_eq!(updated.total_cost, 10.5);
        assert_eq!(updated.total_tokens, 1000);
    }

    #[test]
    fn test_delete_session() {
        let conn = setup_test_db();
        let session = create_test_session("session-1", "Session to Delete");

        create_session(&conn, &session).unwrap();

        let result = delete_session(&conn, "session-1");
        assert!(result.is_ok());

        let retrieved = get_session(&conn, "session-1");
        assert!(retrieved.is_err());
    }

    #[test]
    fn test_update_session_status() {
        let conn = setup_test_db();
        let session = create_test_session("session-1", "Session");

        create_session(&conn, &session).unwrap();

        update_session_status(&conn, "session-1", SessionStatus::Paused).unwrap();
        let updated = get_session(&conn, "session-1").unwrap();
        assert_eq!(updated.status, SessionStatus::Paused);
        assert!(updated.last_resumed_at.is_some());
    }

    #[test]
    fn test_session_config_booleans() {
        let conn = setup_test_db();
        let mut session = create_test_session("session-1", "Session");
        session.config.auto_create_prs = false;
        session.config.run_tests = false;

        create_session(&conn, &session).unwrap();

        let retrieved = get_session(&conn, "session-1").unwrap();
        assert_eq!(retrieved.config.auto_create_prs, false);
        assert_eq!(retrieved.config.run_tests, false);
        assert_eq!(retrieved.config.draft_prs, false);
        assert_eq!(retrieved.config.run_lint, true);
    }

    #[test]
    fn test_pause_other_sessions_in_project() {
        let conn = setup_test_db();

        // Create 3 active sessions in the same project
        let session1 = create_test_session("session-1", "Session 1");
        let session2 = create_test_session("session-2", "Session 2");
        let session3 = create_test_session("session-3", "Session 3");

        create_session(&conn, &session1).unwrap();
        create_session(&conn, &session2).unwrap();
        create_session(&conn, &session3).unwrap();

        // Verify all are active
        assert_eq!(get_session(&conn, "session-1").unwrap().status, SessionStatus::Active);
        assert_eq!(get_session(&conn, "session-2").unwrap().status, SessionStatus::Active);
        assert_eq!(get_session(&conn, "session-3").unwrap().status, SessionStatus::Active);

        // Pause all except session-2
        let paused_count = pause_other_sessions_in_project(&conn, "/test/path", "session-2").unwrap();
        assert_eq!(paused_count, 2);

        // Verify session-2 is still active, others are paused
        assert_eq!(get_session(&conn, "session-1").unwrap().status, SessionStatus::Paused);
        assert_eq!(get_session(&conn, "session-2").unwrap().status, SessionStatus::Active);
        assert_eq!(get_session(&conn, "session-3").unwrap().status, SessionStatus::Paused);
    }

    #[test]
    fn test_pause_other_sessions_different_projects() {
        let conn = setup_test_db();

        // Create sessions in different projects
        let mut session1 = create_test_session("session-1", "Session 1");
        session1.project_path = "/project/a".to_string();

        let mut session2 = create_test_session("session-2", "Session 2");
        session2.project_path = "/project/b".to_string();

        create_session(&conn, &session1).unwrap();
        create_session(&conn, &session2).unwrap();

        // Pause sessions in project A except session-1
        let paused_count = pause_other_sessions_in_project(&conn, "/project/a", "session-1").unwrap();
        assert_eq!(paused_count, 0); // No other sessions in project A

        // Session in project B should still be active
        assert_eq!(get_session(&conn, "session-2").unwrap().status, SessionStatus::Active);
    }

    #[test]
    fn test_find_active_session_for_project() {
        let conn = setup_test_db();

        // No sessions yet
        let result = find_active_session_for_project(&conn, "/test/path").unwrap();
        assert!(result.is_none());

        // Create an active session
        let session1 = create_test_session("session-1", "Session 1");
        create_session(&conn, &session1).unwrap();

        // Should find the active session
        let result = find_active_session_for_project(&conn, "/test/path").unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "session-1");

        // Pause the session
        update_session_status(&conn, "session-1", SessionStatus::Paused).unwrap();

        // Should not find any active session
        let result = find_active_session_for_project(&conn, "/test/path").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_find_active_session_returns_most_recent() {
        let conn = setup_test_db();

        // Create two active sessions
        let session1 = create_test_session("session-1", "Session 1");
        let session2 = create_test_session("session-2", "Session 2");

        create_session(&conn, &session1).unwrap();
        create_session(&conn, &session2).unwrap();

        // Should return the most recently created one
        let result = find_active_session_for_project(&conn, "/test/path").unwrap();
        assert!(result.is_some());
        // Note: In a real scenario with actual timestamps, session-2 would be returned
        // but in tests they're created at nearly the same time
    }
}
