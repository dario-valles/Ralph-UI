// Agent database operations

use crate::models::{Agent, AgentStatus, LogEntry, LogLevel};
use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Row};

impl super::Database {
    /// Hydrate a list of agents with their logs and subagents.
    /// This is a helper to avoid N+1 queries when fetching agents.
    fn hydrate_agents(&self, agents: Vec<Agent>) -> Result<Vec<Agent>> {
        agents
            .into_iter()
            .map(|mut agent| {
                agent.logs = self.get_logs_for_agent(&agent.id)?;
                agent.subagents = self.get_subagents(&agent.id)?;
                Ok(agent)
            })
            .collect()
    }

    /// Create a new agent in the database
    pub fn create_agent(&self, agent: &Agent) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO agents (
                id, session_id, task_id, status, process_id,
                worktree_path, branch, iteration_count, tokens, cost
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                agent.id,
                agent.session_id,
                agent.task_id,
                agent_status_to_string(&agent.status),
                agent.process_id.map(|pid| pid as i64),
                agent.worktree_path,
                agent.branch,
                agent.iteration_count,
                agent.tokens,
                agent.cost,
            ],
        )?;

        // Insert logs if any
        for log in &agent.logs {
            self.add_log(&agent.id, log)?;
        }

        Ok(())
    }

    /// Get an agent by ID
    pub fn get_agent(&self, id: &str) -> Result<Option<Agent>> {
        let conn = self.get_connection();

        let mut stmt = conn.prepare(
            "SELECT id, session_id, task_id, status, process_id,
                    worktree_path, branch, iteration_count, tokens, cost
             FROM agents WHERE id = ?1"
        )?;

        let agent = stmt.query_row(params![id], |row| {
            Ok(row_to_agent(row))
        });

        match agent {
            Ok(mut a) => {
                // Load logs for this agent
                a.logs = self.get_logs_for_agent(&a.id)?;
                // Load subagents (agents with this agent's task_id)
                a.subagents = self.get_subagents(&a.id)?;
                Ok(Some(a))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Get all agents for a session
    pub fn get_agents_for_session(&self, session_id: &str) -> Result<Vec<Agent>> {
        let conn = self.get_connection();

        let mut stmt = conn.prepare(
            "SELECT id, session_id, task_id, status, process_id,
                    worktree_path, branch, iteration_count, tokens, cost
             FROM agents WHERE session_id = ?1 ORDER BY id"
        )?;

        let agents = stmt
            .query_map(params![session_id], |row| Ok(row_to_agent(row)))?
            .collect::<Result<Vec<_>, _>>()?;

        self.hydrate_agents(agents)
    }

    /// Get all agents for a task
    pub fn get_agents_for_task(&self, task_id: &str) -> Result<Vec<Agent>> {
        let conn = self.get_connection();

        let mut stmt = conn.prepare(
            "SELECT id, session_id, task_id, status, process_id,
                    worktree_path, branch, iteration_count, tokens, cost
             FROM agents WHERE task_id = ?1 ORDER BY id"
        )?;

        let agents = stmt
            .query_map(params![task_id], |row| Ok(row_to_agent(row)))?
            .collect::<Result<Vec<_>, _>>()?;

        self.hydrate_agents(agents)
    }

    /// Update an agent's status
    pub fn update_agent_status(&self, id: &str, status: &AgentStatus) -> Result<()> {
        self.get_connection().execute(
            "UPDATE agents SET status = ?1 WHERE id = ?2",
            params![agent_status_to_string(status), id],
        )?;
        Ok(())
    }

    /// Update agent metrics (tokens, cost, iterations)
    pub fn update_agent_metrics(
        &self,
        id: &str,
        tokens: i32,
        cost: f64,
        iteration_count: i32,
    ) -> Result<()> {
        self.get_connection().execute(
            "UPDATE agents SET tokens = ?1, cost = ?2, iteration_count = ?3 WHERE id = ?4",
            params![tokens, cost, iteration_count, id],
        )?;
        Ok(())
    }

    /// Update agent process ID
    pub fn update_agent_process_id(&self, id: &str, process_id: Option<u32>) -> Result<()> {
        self.get_connection().execute(
            "UPDATE agents SET process_id = ?1 WHERE id = ?2",
            params![process_id.map(|pid| pid as i64), id],
        )?;
        Ok(())
    }

    /// Delete an agent
    pub fn delete_agent(&self, id: &str) -> Result<()> {
        self.get_connection().execute(
            "DELETE FROM agents WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Add a log entry for an agent
    pub fn add_log(&self, agent_id: &str, log: &LogEntry) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO logs (agent_id, timestamp, level, message)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                agent_id,
                log.timestamp.to_rfc3339(),
                log_level_to_string(&log.level),
                log.message,
            ],
        )?;
        Ok(())
    }

    /// Get all logs for an agent
    pub fn get_logs_for_agent(&self, agent_id: &str) -> Result<Vec<LogEntry>> {
        let conn = self.get_connection();

        let mut stmt = conn.prepare(
            "SELECT timestamp, level, message FROM logs
             WHERE agent_id = ?1 ORDER BY id"
        )?;

        let logs = stmt
            .query_map(params![agent_id], |row| {
                let timestamp_str: String = row.get(0)?;
                let level_str: String = row.get(1)?;
                let message: String = row.get(2)?;

                Ok(LogEntry {
                    timestamp: DateTime::parse_from_rfc3339(&timestamp_str)
                        .unwrap()
                        .with_timezone(&Utc),
                    level: string_to_log_level(&level_str),
                    message,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(logs)
    }

    /// Get subagents (for hierarchical agent display)
    /// Note: In this implementation, subagents are stored separately
    /// For now, we'll return an empty vec as subagents would be separate Agent entries
    fn get_subagents(&self, _agent_id: &str) -> Result<Vec<Agent>> {
        // Subagents are separate agent entries in the database
        // They can be queried separately if needed
        // For now, return empty to match the Agent model
        Ok(Vec::new())
    }

    /// Get ALL active agents across all sessions (for Mission Control)
    pub fn get_all_active_agents(&self) -> Result<Vec<Agent>> {
        let conn = self.get_connection();

        let mut stmt = conn.prepare(
            "SELECT id, session_id, task_id, status, process_id,
                    worktree_path, branch, iteration_count, tokens, cost
             FROM agents
             WHERE status NOT IN ('idle')
             ORDER BY session_id, id"
        )?;

        let agents = stmt
            .query_map([], |row| Ok(row_to_agent(row)))?
            .collect::<Result<Vec<_>, _>>()?;

        self.hydrate_agents(agents)
    }

    /// Get active agents for a specific session (not idle or completed)
    pub fn get_active_agents(&self, session_id: &str) -> Result<Vec<Agent>> {
        let conn = self.get_connection();

        let mut stmt = conn.prepare(
            "SELECT id, session_id, task_id, status, process_id,
                    worktree_path, branch, iteration_count, tokens, cost
             FROM agents
             WHERE session_id = ?1
             AND status NOT IN ('idle', 'completed')
             ORDER BY id"
        )?;

        let agents = stmt
            .query_map(params![session_id], |row| Ok(row_to_agent(row)))?
            .collect::<Result<Vec<_>, _>>()?;

        self.hydrate_agents(agents)
    }
}

/// Convert database row to Agent struct
fn row_to_agent(row: &Row) -> Agent {
    let status_str: String = row.get(3).unwrap();
    let process_id: Option<i64> = row.get(4).unwrap();

    Agent {
        id: row.get(0).unwrap(),
        session_id: row.get(1).unwrap(),
        task_id: row.get(2).unwrap(),
        status: string_to_agent_status(&status_str),
        process_id: process_id.map(|pid| pid as u32),
        worktree_path: row.get(5).unwrap(),
        branch: row.get(6).unwrap(),
        iteration_count: row.get(7).unwrap(),
        tokens: row.get(8).unwrap(),
        cost: row.get(9).unwrap(),
        logs: Vec::new(), // Will be populated separately
        subagents: Vec::new(), // Will be populated separately
    }
}

/// Convert AgentStatus to database string
fn agent_status_to_string(status: &AgentStatus) -> &'static str {
    match status {
        AgentStatus::Idle => "idle",
        AgentStatus::Thinking => "thinking",
        AgentStatus::Reading => "reading",
        AgentStatus::Implementing => "implementing",
        AgentStatus::Testing => "testing",
        AgentStatus::Committing => "committing",
    }
}

/// Convert database string to AgentStatus
fn string_to_agent_status(s: &str) -> AgentStatus {
    match s {
        "idle" => AgentStatus::Idle,
        "thinking" => AgentStatus::Thinking,
        "reading" => AgentStatus::Reading,
        "implementing" => AgentStatus::Implementing,
        "testing" => AgentStatus::Testing,
        "committing" => AgentStatus::Committing,
        _ => AgentStatus::Idle,
    }
}

/// Convert LogLevel to database string
fn log_level_to_string(level: &LogLevel) -> &'static str {
    match level {
        LogLevel::Info => "info",
        LogLevel::Warn => "warn",
        LogLevel::Error => "error",
        LogLevel::Debug => "debug",
    }
}

/// Convert database string to LogLevel
fn string_to_log_level(s: &str) -> LogLevel {
    match s {
        "info" => LogLevel::Info,
        "warn" => LogLevel::Warn,
        "error" => LogLevel::Error,
        "debug" => LogLevel::Debug,
        _ => LogLevel::Info,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use uuid::Uuid;

    fn create_test_db() -> Database {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();
        db
    }

    fn create_test_session(db: &Database, session_id: &str) {
        use crate::models::{Session, SessionConfig, SessionStatus, AgentType};
        use crate::database::sessions;
        use chrono::Utc;

        let session = Session {
            id: session_id.to_string(),
            name: "Test Session".to_string(),
            project_path: "/tmp/test".to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status: SessionStatus::Active,
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
        };

        sessions::create_session(db.get_connection(), &session).unwrap();
    }

    fn create_test_task(db: &Database, session_id: &str, task_id: &str) {
        use crate::models::{Task, TaskStatus};
        use crate::database::tasks;

        let task = Task {
            id: task_id.to_string(),
            title: "Test Task".to_string(),
            description: "A test task".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: Vec::new(),
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };

        tasks::create_task(db.get_connection(), session_id, &task).unwrap();
    }

    fn create_test_agent(session_id: &str, task_id: &str) -> Agent {
        Agent {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            task_id: task_id.to_string(),
            status: AgentStatus::Idle,
            process_id: None,
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            iteration_count: 0,
            tokens: 0,
            cost: 0.0,
            logs: Vec::new(),
            subagents: Vec::new(),
        }
    }

    #[test]
    fn test_create_agent() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";

        // Create session and task first (foreign key constraints)
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);

        let result = db.create_agent(&agent);
        assert!(result.is_ok());

        let retrieved = db.get_agent(&agent.id).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, agent.id);
        assert_eq!(retrieved.session_id, agent.session_id);
        assert_eq!(retrieved.task_id, agent.task_id);
    }

    #[test]
    fn test_get_agent_not_found() {
        let db = create_test_db();
        let result = db.get_agent("nonexistent");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_update_agent_status() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        db.update_agent_status(&agent.id, &AgentStatus::Thinking).unwrap();

        let retrieved = db.get_agent(&agent.id).unwrap().unwrap();
        assert_eq!(retrieved.status, AgentStatus::Thinking);
    }

    #[test]
    fn test_update_agent_metrics() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        db.update_agent_metrics(&agent.id, 1000, 0.05, 5).unwrap();

        let retrieved = db.get_agent(&agent.id).unwrap().unwrap();
        assert_eq!(retrieved.tokens, 1000);
        assert_eq!(retrieved.cost, 0.05);
        assert_eq!(retrieved.iteration_count, 5);
    }

    #[test]
    fn test_update_agent_process_id() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        db.update_agent_process_id(&agent.id, Some(12345)).unwrap();

        let retrieved = db.get_agent(&agent.id).unwrap().unwrap();
        assert_eq!(retrieved.process_id, Some(12345));
    }

    #[test]
    fn test_delete_agent() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        db.delete_agent(&agent.id).unwrap();

        let retrieved = db.get_agent(&agent.id).unwrap();
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_add_log() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        let log = LogEntry {
            timestamp: Utc::now(),
            level: LogLevel::Info,
            message: "Test log message".to_string(),
        };

        db.add_log(&agent.id, &log).unwrap();

        let logs = db.get_logs_for_agent(&agent.id).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].message, "Test log message");
        assert_eq!(logs[0].level, LogLevel::Info);
    }

    #[test]
    fn test_get_logs_for_agent() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        // Add multiple logs
        for i in 0..5 {
            let log = LogEntry {
                timestamp: Utc::now(),
                level: LogLevel::Info,
                message: format!("Log message {}", i),
            };
            db.add_log(&agent.id, &log).unwrap();
        }

        let logs = db.get_logs_for_agent(&agent.id).unwrap();
        assert_eq!(logs.len(), 5);
    }

    #[test]
    fn test_get_agents_for_session() {
        let db = create_test_db();
        let session_id = "session1";
        create_test_session(&db, session_id);

        // Create multiple agents
        for i in 0..3 {
            let task_id = format!("task{}", i);
            create_test_task(&db, session_id, &task_id);
            let agent = create_test_agent(session_id, &task_id);
            db.create_agent(&agent).unwrap();
        }

        let agents = db.get_agents_for_session(session_id).unwrap();
        assert_eq!(agents.len(), 3);
    }

    #[test]
    fn test_get_agents_for_task() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        // Create multiple agents for same task
        for _ in 0..2 {
            let agent = create_test_agent(session_id, task_id);
            db.create_agent(&agent).unwrap();
        }

        let agents = db.get_agents_for_task(task_id).unwrap();
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn test_get_active_agents() {
        let db = create_test_db();
        let session_id = "session1";
        create_test_session(&db, session_id);

        // Create agents with different statuses
        for i in 1..=3 {
            let task_id = format!("task{}", i);
            create_test_task(&db, session_id, &task_id);
        }

        let mut agent1 = create_test_agent(session_id, "task1");
        agent1.status = AgentStatus::Thinking;
        db.create_agent(&agent1).unwrap();

        let mut agent2 = create_test_agent(session_id, "task2");
        agent2.status = AgentStatus::Idle;
        db.create_agent(&agent2).unwrap();

        let mut agent3 = create_test_agent(session_id, "task3");
        agent3.status = AgentStatus::Implementing;
        db.create_agent(&agent3).unwrap();

        let active = db.get_active_agents(session_id).unwrap();
        // Should return agents that are not idle
        assert_eq!(active.len(), 2);
    }

    #[test]
    fn test_agent_with_logs() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let mut agent = create_test_agent(session_id, task_id);

        // Add logs to agent before creating
        agent.logs.push(LogEntry {
            timestamp: Utc::now(),
            level: LogLevel::Info,
            message: "Initial log".to_string(),
        });

        db.create_agent(&agent).unwrap();

        let retrieved = db.get_agent(&agent.id).unwrap().unwrap();
        assert_eq!(retrieved.logs.len(), 1);
        assert_eq!(retrieved.logs[0].message, "Initial log");
    }

    #[test]
    fn test_log_levels() {
        let db = create_test_db();
        let session_id = "session1";
        let task_id = "task1";
        create_test_session(&db, session_id);
        create_test_task(&db, session_id, task_id);

        let agent = create_test_agent(session_id, task_id);
        db.create_agent(&agent).unwrap();

        let levels = vec![
            LogLevel::Info,
            LogLevel::Warn,
            LogLevel::Error,
            LogLevel::Debug,
        ];

        for level in levels {
            let log = LogEntry {
                timestamp: Utc::now(),
                level,
                message: format!("Test {:?}", level),
            };
            db.add_log(&agent.id, &log).unwrap();
        }

        let logs = db.get_logs_for_agent(&agent.id).unwrap();
        assert_eq!(logs.len(), 4);
        assert_eq!(logs[0].level, LogLevel::Info);
        assert_eq!(logs[1].level, LogLevel::Warn);
        assert_eq!(logs[2].level, LogLevel::Error);
        assert_eq!(logs[3].level, LogLevel::Debug);
    }
}
