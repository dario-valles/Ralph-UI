//! CRUD operations for Ralph Loop iteration tracking
//!
//! This module provides database operations for:
//! - Iteration history (ralph_iteration_history table)
//! - Execution state snapshots (ralph_execution_state table)

use crate::ralph_loop::{ExecutionStateSnapshot, IterationOutcome, IterationRecord};
use chrono::Utc;
use rusqlite::{params, Connection, Result};

// ============================================================================
// Iteration History Operations
// ============================================================================

/// Insert a new iteration record
pub fn insert_iteration(conn: &Connection, record: &IterationRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO ralph_iteration_history (
            id, execution_id, iteration, outcome, duration_secs, agent_type,
            rate_limit_encountered, error_message, started_at, completed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            record.id,
            record.execution_id,
            record.iteration,
            record.outcome.to_string(),
            record.duration_secs,
            format!("{:?}", record.agent_type),
            record.rate_limit_encountered as i32,
            record.error_message,
            record.started_at,
            record.completed_at,
        ],
    )?;
    Ok(())
}

/// Update an existing iteration record (e.g., when completing)
pub fn update_iteration(
    conn: &Connection,
    id: &str,
    outcome: IterationOutcome,
    duration_secs: f64,
    completed_at: &str,
    error_message: Option<&str>,
) -> Result<usize> {
    conn.execute(
        "UPDATE ralph_iteration_history
         SET outcome = ?2, duration_secs = ?3, completed_at = ?4, error_message = ?5
         WHERE id = ?1",
        params![
            id,
            outcome.to_string(),
            duration_secs,
            completed_at,
            error_message,
        ],
    )
}

/// Get all iterations for an execution
pub fn get_iterations_for_execution(
    conn: &Connection,
    execution_id: &str,
) -> Result<Vec<IterationRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, execution_id, iteration, outcome, duration_secs, agent_type,
                rate_limit_encountered, error_message, started_at, completed_at
         FROM ralph_iteration_history
         WHERE execution_id = ?1
         ORDER BY iteration ASC",
    )?;

    let rows = stmt.query_map(params![execution_id], |row| {
        let outcome_str: String = row.get(3)?;
        let agent_type_str: String = row.get(5)?;

        Ok(IterationRecord {
            id: row.get(0)?,
            execution_id: row.get(1)?,
            iteration: row.get(2)?,
            outcome: outcome_str.parse().unwrap_or(IterationOutcome::Interrupted),
            duration_secs: row.get(4)?,
            agent_type: parse_agent_type(&agent_type_str),
            rate_limit_encountered: row.get::<_, i32>(6)? != 0,
            error_message: row.get(7)?,
            started_at: row.get(8)?,
            completed_at: row.get(9)?,
        })
    })?;

    rows.collect()
}

/// Get iteration history with optional filters
pub fn get_iteration_history(
    conn: &Connection,
    execution_id: Option<&str>,
    outcome_filter: Option<IterationOutcome>,
    limit: Option<u32>,
) -> Result<Vec<IterationRecord>> {
    let mut sql = String::from(
        "SELECT id, execution_id, iteration, outcome, duration_secs, agent_type,
                rate_limit_encountered, error_message, started_at, completed_at
         FROM ralph_iteration_history
         WHERE 1=1",
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(exec_id) = execution_id {
        sql.push_str(" AND execution_id = ?");
        params_vec.push(Box::new(exec_id.to_string()));
    }

    if let Some(outcome) = outcome_filter {
        sql.push_str(" AND outcome = ?");
        params_vec.push(Box::new(outcome.to_string()));
    }

    sql.push_str(" ORDER BY started_at DESC");

    if let Some(lim) = limit {
        sql.push_str(&format!(" LIMIT {}", lim));
    }

    let mut stmt = conn.prepare(&sql)?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let outcome_str: String = row.get(3)?;
        let agent_type_str: String = row.get(5)?;

        Ok(IterationRecord {
            id: row.get(0)?,
            execution_id: row.get(1)?,
            iteration: row.get(2)?,
            outcome: outcome_str.parse().unwrap_or(IterationOutcome::Interrupted),
            duration_secs: row.get(4)?,
            agent_type: parse_agent_type(&agent_type_str),
            rate_limit_encountered: row.get::<_, i32>(6)? != 0,
            error_message: row.get(7)?,
            started_at: row.get(8)?,
            completed_at: row.get(9)?,
        })
    })?;

    rows.collect()
}

/// Get summary statistics for an execution
pub fn get_execution_stats(conn: &Connection, execution_id: &str) -> Result<IterationStats> {
    let mut stmt = conn.prepare(
        "SELECT
            COUNT(*) as total,
            SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN outcome = 'skipped' THEN 1 ELSE 0 END) as skipped,
            SUM(CASE WHEN outcome = 'interrupted' THEN 1 ELSE 0 END) as interrupted,
            SUM(CASE WHEN rate_limit_encountered = 1 THEN 1 ELSE 0 END) as rate_limited,
            SUM(duration_secs) as total_duration
         FROM ralph_iteration_history
         WHERE execution_id = ?1",
    )?;

    stmt.query_row(params![execution_id], |row| {
        Ok(IterationStats {
            total: row.get(0)?,
            successful: row.get(1)?,
            failed: row.get(2)?,
            skipped: row.get(3)?,
            interrupted: row.get(4)?,
            rate_limited: row.get(5)?,
            total_duration_secs: row.get(6)?,
        })
    })
}

/// Delete iterations for an execution
pub fn delete_iterations_for_execution(conn: &Connection, execution_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM ralph_iteration_history WHERE execution_id = ?1",
        params![execution_id],
    )
}

/// Cleanup old iteration history records
/// Returns the number of records deleted
pub fn cleanup_old_iterations(conn: &Connection, days_to_keep: i64) -> Result<usize> {
    let threshold = chrono::Utc::now() - chrono::Duration::days(days_to_keep);
    conn.execute(
        "DELETE FROM ralph_iteration_history WHERE started_at < ?1",
        params![threshold.to_rfc3339()],
    )
}

// ============================================================================
// Execution State Snapshot Operations
// ============================================================================

/// Save or update execution state snapshot
pub fn save_execution_state(conn: &Connection, snapshot: &ExecutionStateSnapshot) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO ralph_execution_state (execution_id, state, last_heartbeat)
         VALUES (?1, ?2, ?3)",
        params![
            snapshot.execution_id,
            snapshot.state,
            snapshot.last_heartbeat,
        ],
    )?;
    Ok(())
}

/// Update heartbeat for an execution
pub fn update_heartbeat(conn: &Connection, execution_id: &str, heartbeat: &str) -> Result<usize> {
    conn.execute(
        "UPDATE ralph_execution_state SET last_heartbeat = ?2 WHERE execution_id = ?1",
        params![execution_id, heartbeat],
    )
}

/// Get execution state snapshot
pub fn get_execution_state(
    conn: &Connection,
    execution_id: &str,
) -> Result<Option<ExecutionStateSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT execution_id, state, last_heartbeat
         FROM ralph_execution_state
         WHERE execution_id = ?1",
    )?;

    let mut rows = stmt.query(params![execution_id])?;

    if let Some(row) = rows.next()? {
        Ok(Some(ExecutionStateSnapshot {
            execution_id: row.get(0)?,
            state: row.get(1)?,
            last_heartbeat: row.get(2)?,
        }))
    } else {
        Ok(None)
    }
}

/// Get stale executions (heartbeat older than threshold)
///
/// This is used for crash recovery - executions with stale heartbeats
/// are considered crashed and their iterations should be marked as interrupted.
pub fn get_stale_executions(
    conn: &Connection,
    threshold_secs: i64,
) -> Result<Vec<ExecutionStateSnapshot>> {
    let threshold_time = chrono::Utc::now() - chrono::Duration::seconds(threshold_secs);
    let threshold_str = threshold_time.to_rfc3339();

    let mut stmt = conn.prepare(
        "SELECT execution_id, state, last_heartbeat
         FROM ralph_execution_state
         WHERE last_heartbeat < ?1",
    )?;

    let rows = stmt.query_map(params![threshold_str], |row| {
        Ok(ExecutionStateSnapshot {
            execution_id: row.get(0)?,
            state: row.get(1)?,
            last_heartbeat: row.get(2)?,
        })
    })?;

    rows.collect()
}

/// Delete execution state (cleanup after completion)
pub fn delete_execution_state(conn: &Connection, execution_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM ralph_execution_state WHERE execution_id = ?1",
        params![execution_id],
    )
}

/// Mark all in-progress iterations for an execution as interrupted
///
/// Used during crash recovery to mark iterations that were running
/// when the application crashed.
pub fn mark_interrupted_iterations(
    conn: &Connection,
    execution_id: &str,
    completed_at: &str,
) -> Result<usize> {
    conn.execute(
        "UPDATE ralph_iteration_history
         SET outcome = 'interrupted', completed_at = ?2
         WHERE execution_id = ?1 AND completed_at IS NULL",
        params![execution_id, completed_at],
    )
}

// ============================================================================
// Helper Types and Functions
// ============================================================================

/// Statistics for an execution's iterations
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IterationStats {
    pub total: u32,
    pub successful: u32,
    pub failed: u32,
    pub skipped: u32,
    pub interrupted: u32,
    pub rate_limited: u32,
    pub total_duration_secs: f64,
}

/// Parse agent type from string representation
fn parse_agent_type(s: &str) -> crate::models::AgentType {
    match s.to_lowercase().as_str() {
        "claude" => crate::models::AgentType::Claude,
        "opencode" => crate::models::AgentType::Opencode,
        "cursor" => crate::models::AgentType::Cursor,
        "codex" => crate::models::AgentType::Codex,
        _ => crate::models::AgentType::Claude, // Default fallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AgentType;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        // Create the tables
        conn.execute(
            "CREATE TABLE ralph_iteration_history (
                id TEXT PRIMARY KEY,
                execution_id TEXT NOT NULL,
                iteration INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                duration_secs REAL NOT NULL,
                agent_type TEXT NOT NULL,
                rate_limit_encountered INTEGER DEFAULT 0,
                error_message TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                UNIQUE(execution_id, iteration)
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE ralph_execution_state (
                execution_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                last_heartbeat TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_insert_and_get_iteration() {
        let conn = setup_test_db();

        let record = IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-1".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success,
            duration_secs: 60.5,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:01:00Z".to_string()),
        };

        insert_iteration(&conn, &record).unwrap();

        let iterations = get_iterations_for_execution(&conn, "exec-1").unwrap();
        assert_eq!(iterations.len(), 1);
        assert_eq!(iterations[0].id, "iter-1");
        assert_eq!(iterations[0].outcome, IterationOutcome::Success);
    }

    #[test]
    fn test_update_iteration() {
        let conn = setup_test_db();

        let record = IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-1".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success,
            duration_secs: 30.0,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: None,
        };

        insert_iteration(&conn, &record).unwrap();

        update_iteration(
            &conn,
            "iter-1",
            IterationOutcome::Failed,
            45.0,
            "2024-01-01T00:00:45Z",
            Some("Connection timeout"),
        )
        .unwrap();

        let iterations = get_iterations_for_execution(&conn, "exec-1").unwrap();
        assert_eq!(iterations[0].outcome, IterationOutcome::Failed);
        assert_eq!(
            iterations[0].error_message,
            Some("Connection timeout".to_string())
        );
    }

    #[test]
    fn test_execution_stats() {
        let conn = setup_test_db();

        // Insert multiple iterations
        for i in 1..=5 {
            let outcome = if i <= 3 {
                IterationOutcome::Success
            } else {
                IterationOutcome::Failed
            };

            let record = IterationRecord {
                id: format!("iter-{}", i),
                execution_id: "exec-1".to_string(),
                iteration: i,
                outcome,
                duration_secs: 30.0,
                agent_type: AgentType::Claude,
                rate_limit_encountered: i == 4,
                error_message: None,
                started_at: "2024-01-01T00:00:00Z".to_string(),
                completed_at: Some("2024-01-01T00:00:30Z".to_string()),
            };

            insert_iteration(&conn, &record).unwrap();
        }

        let stats = get_execution_stats(&conn, "exec-1").unwrap();
        assert_eq!(stats.total, 5);
        assert_eq!(stats.successful, 3);
        assert_eq!(stats.failed, 2);
        assert_eq!(stats.rate_limited, 1);
    }

    #[test]
    fn test_execution_state_operations() {
        let conn = setup_test_db();

        let snapshot = ExecutionStateSnapshot {
            execution_id: "exec-1".to_string(),
            state: r#"{"iteration":3}"#.to_string(),
            last_heartbeat: "2024-01-01T00:00:00Z".to_string(),
        };

        save_execution_state(&conn, &snapshot).unwrap();

        let retrieved = get_execution_state(&conn, "exec-1").unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().execution_id, "exec-1");

        // Update heartbeat
        update_heartbeat(&conn, "exec-1", "2024-01-01T00:01:00Z").unwrap();

        let retrieved = get_execution_state(&conn, "exec-1").unwrap().unwrap();
        assert_eq!(retrieved.last_heartbeat, "2024-01-01T00:01:00Z");

        // Delete
        delete_execution_state(&conn, "exec-1").unwrap();
        let retrieved = get_execution_state(&conn, "exec-1").unwrap();
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_mark_interrupted_iterations() {
        let conn = setup_test_db();

        // Insert an iteration without completed_at (simulating in-progress)
        let record = IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-1".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success, // Will be overwritten
            duration_secs: 0.0,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: None, // Not completed
        };

        insert_iteration(&conn, &record).unwrap();

        // Mark as interrupted
        let updated = mark_interrupted_iterations(&conn, "exec-1", "2024-01-01T00:05:00Z").unwrap();

        assert_eq!(updated, 1);

        let iterations = get_iterations_for_execution(&conn, "exec-1").unwrap();
        assert_eq!(iterations[0].outcome, IterationOutcome::Interrupted);
        assert_eq!(
            iterations[0].completed_at,
            Some("2024-01-01T00:05:00Z".to_string())
        );
    }
}
