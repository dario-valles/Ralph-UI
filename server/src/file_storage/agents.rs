//! Runtime agent state file storage
//!
//! Stores agent state and logs in `.ralph-ui/agents/`:
//! - `{agent_id}.json` - Agent state
//! - `{agent_id}.logs.jsonl` - Agent logs (append-only JSONL format)
//!
//! These files are gitignored as they are runtime-only state.

use super::{ensure_dir, get_ralph_ui_dir, read_json, write_json, FileResult};
use crate::models::{Agent, AgentStatus, LogEntry, LogLevel};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

/// Version of the agent state file format
const AGENT_FILE_VERSION: u32 = 1;

/// Agent state file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStateFile {
    /// File format version
    pub version: u32,
    /// Agent ID
    pub id: String,
    /// Session ID this agent belongs to
    pub session_id: String,
    /// Task ID this agent is working on
    pub task_id: String,
    /// Current status
    pub status: AgentStatus,
    /// Process ID (if running)
    pub process_id: Option<u32>,
    /// Worktree path
    pub worktree_path: String,
    /// Branch name
    pub branch: String,
    /// Number of iterations completed
    pub iteration_count: i32,
    /// Total tokens used
    pub tokens: i32,
    /// Total cost incurred
    pub cost: f64,
    /// When this agent was created
    pub created_at: DateTime<Utc>,
    /// When this agent state was last updated
    pub updated_at: DateTime<Utc>,
}

/// Log entry for JSONL format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntryJson {
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub message: String,
}

impl From<&LogEntry> for LogEntryJson {
    fn from(entry: &LogEntry) -> Self {
        Self {
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message.clone(),
        }
    }
}

impl From<&LogEntryJson> for LogEntry {
    fn from(entry: &LogEntryJson) -> Self {
        Self {
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message.clone(),
        }
    }
}

impl From<&Agent> for AgentStateFile {
    fn from(agent: &Agent) -> Self {
        Self {
            version: AGENT_FILE_VERSION,
            id: agent.id.clone(),
            session_id: agent.session_id.clone(),
            task_id: agent.task_id.clone(),
            status: agent.status,
            process_id: agent.process_id,
            worktree_path: agent.worktree_path.clone(),
            branch: agent.branch.clone(),
            iteration_count: agent.iteration_count,
            tokens: agent.tokens,
            cost: agent.cost,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

impl AgentStateFile {
    /// Convert to Agent model (without logs, which are loaded separately)
    pub fn to_agent(&self) -> Agent {
        Agent {
            id: self.id.clone(),
            session_id: self.session_id.clone(),
            task_id: self.task_id.clone(),
            status: self.status,
            process_id: self.process_id,
            worktree_path: self.worktree_path.clone(),
            branch: self.branch.clone(),
            iteration_count: self.iteration_count,
            tokens: self.tokens,
            cost: self.cost,
            logs: Vec::new(),      // Loaded separately
            subagents: Vec::new(), // Not stored in files
        }
    }
}

/// Get the agents directory path for a project
pub fn get_agents_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("agents")
}

/// Get the file path for an agent's state
pub fn get_agent_file_path(project_path: &Path, agent_id: &str) -> PathBuf {
    get_agents_dir(project_path).join(format!("{}.json", agent_id))
}

/// Get the file path for an agent's logs
pub fn get_agent_logs_path(project_path: &Path, agent_id: &str) -> PathBuf {
    get_agents_dir(project_path).join(format!("{}.logs.jsonl", agent_id))
}

/// Save agent state to file
pub fn save_agent_state(project_path: &Path, agent: &Agent) -> FileResult<PathBuf> {
    let agents_dir = get_agents_dir(project_path);
    ensure_dir(&agents_dir)?;

    let file_path = get_agent_file_path(project_path, &agent.id);
    let mut state = AgentStateFile::from(agent);
    state.updated_at = Utc::now();

    write_json(&file_path, &state)?;

    log::debug!("Saved agent {} state to {:?}", agent.id, file_path);
    Ok(file_path)
}

/// Read agent state from file
pub fn read_agent_state(project_path: &Path, agent_id: &str) -> FileResult<AgentStateFile> {
    let file_path = get_agent_file_path(project_path, agent_id);
    read_json(&file_path)
}

/// Read agent state and logs, returning full Agent model
pub fn read_agent_with_logs(project_path: &Path, agent_id: &str) -> FileResult<Agent> {
    let state = read_agent_state(project_path, agent_id)?;
    let logs = read_agent_logs(project_path, agent_id).unwrap_or_default();

    let mut agent = state.to_agent();
    agent.logs = logs;

    Ok(agent)
}

/// Check if an agent state file exists
pub fn agent_file_exists(project_path: &Path, agent_id: &str) -> bool {
    get_agent_file_path(project_path, agent_id).exists()
}

/// Delete agent state and logs files
pub fn delete_agent_files(project_path: &Path, agent_id: &str) -> FileResult<()> {
    let state_path = get_agent_file_path(project_path, agent_id);
    let logs_path = get_agent_logs_path(project_path, agent_id);

    if state_path.exists() {
        fs::remove_file(&state_path)
            .map_err(|e| format!("Failed to delete agent state file: {}", e))?;
        log::info!("Deleted agent state file: {:?}", state_path);
    }

    if logs_path.exists() {
        fs::remove_file(&logs_path)
            .map_err(|e| format!("Failed to delete agent logs file: {}", e))?;
        log::info!("Deleted agent logs file: {:?}", logs_path);
    }

    Ok(())
}

/// Append a log entry to an agent's log file
pub fn append_agent_log(
    project_path: &Path,
    agent_id: &str,
    log_entry: &LogEntry,
) -> FileResult<()> {
    let agents_dir = get_agents_dir(project_path);
    ensure_dir(&agents_dir)?;

    let logs_path = get_agent_logs_path(project_path, agent_id);

    let entry = LogEntryJson::from(log_entry);
    let line = serde_json::to_string(&entry)
        .map_err(|e| format!("Failed to serialize log entry: {}", e))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&logs_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    writeln!(file, "{}", line).map_err(|e| format!("Failed to write log entry: {}", e))?;

    Ok(())
}

/// Read all log entries for an agent
pub fn read_agent_logs(project_path: &Path, agent_id: &str) -> FileResult<Vec<LogEntry>> {
    let logs_path = get_agent_logs_path(project_path, agent_id);

    if !logs_path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(&logs_path).map_err(|e| format!("Failed to open log file: {}", e))?;

    let reader = BufReader::new(file);
    let mut logs = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read log line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<LogEntryJson>(&line) {
            Ok(entry) => logs.push(LogEntry::from(&entry)),
            Err(e) => {
                log::warn!("Failed to parse log entry: {}", e);
            }
        }
    }

    Ok(logs)
}

/// List all agent IDs for a project
pub fn list_agent_ids(project_path: &Path) -> FileResult<Vec<String>> {
    let agents_dir = get_agents_dir(project_path);

    if !agents_dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(&agents_dir).map_err(|e| format!("Failed to read agents directory: {}", e))?;

    let mut agent_ids = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .json files (state files, not .logs.jsonl)
        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }

        if let Some(stem) = path.file_stem() {
            if let Some(id) = stem.to_str() {
                agent_ids.push(id.to_string());
            }
        }
    }

    Ok(agent_ids)
}

/// List all agents for a session
pub fn list_agents_for_session(project_path: &Path, session_id: &str) -> FileResult<Vec<Agent>> {
    let agent_ids = list_agent_ids(project_path)?;
    let mut agents = Vec::new();

    for agent_id in agent_ids {
        match read_agent_with_logs(project_path, &agent_id) {
            Ok(agent) => {
                if agent.session_id == session_id {
                    agents.push(agent);
                }
            }
            Err(e) => {
                log::warn!("Failed to read agent {}: {}", agent_id, e);
            }
        }
    }

    Ok(agents)
}

/// Update agent status
pub fn update_agent_status(
    project_path: &Path,
    agent_id: &str,
    status: AgentStatus,
) -> FileResult<()> {
    let mut state = read_agent_state(project_path, agent_id)?;
    state.status = status;
    state.updated_at = Utc::now();

    let file_path = get_agent_file_path(project_path, agent_id);
    write_json(&file_path, &state)?;

    Ok(())
}

/// Update agent metrics
pub fn update_agent_metrics(
    project_path: &Path,
    agent_id: &str,
    tokens: i32,
    cost: f64,
    iteration_count: i32,
) -> FileResult<()> {
    let mut state = read_agent_state(project_path, agent_id)?;
    state.tokens = tokens;
    state.cost = cost;
    state.iteration_count = iteration_count;
    state.updated_at = Utc::now();

    let file_path = get_agent_file_path(project_path, agent_id);
    write_json(&file_path, &state)?;

    Ok(())
}

/// Update agent process ID
pub fn update_agent_process_id(
    project_path: &Path,
    agent_id: &str,
    process_id: Option<u32>,
) -> FileResult<()> {
    let mut state = read_agent_state(project_path, agent_id)?;
    state.process_id = process_id;
    state.updated_at = Utc::now();

    let file_path = get_agent_file_path(project_path, agent_id);
    write_json(&file_path, &state)?;

    Ok(())
}

/// Get all active agents across all sessions for a project
pub fn get_all_active_agents(project_path: &Path) -> FileResult<Vec<Agent>> {
    let agent_ids = list_agent_ids(project_path)?;
    let mut agents = Vec::new();

    for agent_id in agent_ids {
        match read_agent_with_logs(project_path, &agent_id) {
            Ok(agent) => {
                if agent.status != AgentStatus::Idle {
                    agents.push(agent);
                }
            }
            Err(e) => {
                log::warn!("Failed to read agent {}: {}", agent_id, e);
            }
        }
    }

    Ok(agents)
}

/// Cleanup stale agent files (agents that haven't been updated recently)
pub fn cleanup_stale_agents(project_path: &Path, max_age_secs: i64) -> FileResult<Vec<String>> {
    let agent_ids = list_agent_ids(project_path)?;
    let cutoff = Utc::now() - chrono::Duration::try_seconds(max_age_secs).unwrap_or_default();
    let mut cleaned = Vec::new();

    for agent_id in agent_ids {
        match read_agent_state(project_path, &agent_id) {
            Ok(state) => {
                if state.updated_at < cutoff && state.status == AgentStatus::Idle {
                    delete_agent_files(project_path, &agent_id)?;
                    cleaned.push(agent_id);
                }
            }
            Err(e) => {
                log::warn!("Failed to read agent {}: {}", agent_id, e);
            }
        }
    }

    if !cleaned.is_empty() {
        log::info!("Cleaned up {} stale agent files", cleaned.len());
    }

    Ok(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_agent(id: &str, session_id: &str) -> Agent {
        Agent {
            id: id.to_string(),
            session_id: session_id.to_string(),
            task_id: "task-1".to_string(),
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
    fn test_save_and_read_agent_state() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-123", "session-1");
        let file_path = save_agent_state(temp_dir.path(), &agent).unwrap();

        assert!(file_path.exists());

        let state = read_agent_state(temp_dir.path(), "agent-123").unwrap();
        assert_eq!(state.id, "agent-123");
        assert_eq!(state.session_id, "session-1");
    }

    #[test]
    fn test_agent_file_exists() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        assert!(!agent_file_exists(temp_dir.path(), "agent-123"));

        let agent = create_test_agent("agent-123", "session-1");
        save_agent_state(temp_dir.path(), &agent).unwrap();

        assert!(agent_file_exists(temp_dir.path(), "agent-123"));
    }

    #[test]
    fn test_delete_agent_files() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-123", "session-1");
        save_agent_state(temp_dir.path(), &agent).unwrap();

        // Add some logs
        let log = LogEntry {
            timestamp: Utc::now(),
            level: LogLevel::Info,
            message: "Test log".to_string(),
        };
        append_agent_log(temp_dir.path(), "agent-123", &log).unwrap();

        assert!(agent_file_exists(temp_dir.path(), "agent-123"));
        assert!(get_agent_logs_path(temp_dir.path(), "agent-123").exists());

        delete_agent_files(temp_dir.path(), "agent-123").unwrap();

        assert!(!agent_file_exists(temp_dir.path(), "agent-123"));
        assert!(!get_agent_logs_path(temp_dir.path(), "agent-123").exists());
    }

    #[test]
    fn test_append_and_read_logs() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-123", "session-1");
        save_agent_state(temp_dir.path(), &agent).unwrap();

        // Append multiple logs
        for i in 0..5 {
            let log = LogEntry {
                timestamp: Utc::now(),
                level: LogLevel::Info,
                message: format!("Log message {}", i),
            };
            append_agent_log(temp_dir.path(), "agent-123", &log).unwrap();
        }

        let logs = read_agent_logs(temp_dir.path(), "agent-123").unwrap();
        assert_eq!(logs.len(), 5);
        assert_eq!(logs[0].message, "Log message 0");
        assert_eq!(logs[4].message, "Log message 4");
    }

    #[test]
    fn test_read_agent_with_logs() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-123", "session-1");
        save_agent_state(temp_dir.path(), &agent).unwrap();

        let log = LogEntry {
            timestamp: Utc::now(),
            level: LogLevel::Info,
            message: "Test log".to_string(),
        };
        append_agent_log(temp_dir.path(), "agent-123", &log).unwrap();

        let agent = read_agent_with_logs(temp_dir.path(), "agent-123").unwrap();
        assert_eq!(agent.logs.len(), 1);
        assert_eq!(agent.logs[0].message, "Test log");
    }

    #[test]
    fn test_list_agent_ids() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        for i in 1..=3 {
            let agent = create_test_agent(&format!("agent-{}", i), "session-1");
            save_agent_state(temp_dir.path(), &agent).unwrap();
        }

        let ids = list_agent_ids(temp_dir.path()).unwrap();
        assert_eq!(ids.len(), 3);
    }

    #[test]
    fn test_list_agents_for_session() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        save_agent_state(temp_dir.path(), &create_test_agent("agent-1", "session-1")).unwrap();
        save_agent_state(temp_dir.path(), &create_test_agent("agent-2", "session-1")).unwrap();
        save_agent_state(temp_dir.path(), &create_test_agent("agent-3", "session-2")).unwrap();

        let agents = list_agents_for_session(temp_dir.path(), "session-1").unwrap();
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn test_update_agent_status() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-123", "session-1");
        save_agent_state(temp_dir.path(), &agent).unwrap();

        update_agent_status(temp_dir.path(), "agent-123", AgentStatus::Thinking).unwrap();

        let state = read_agent_state(temp_dir.path(), "agent-123").unwrap();
        assert_eq!(state.status, AgentStatus::Thinking);
    }

    #[test]
    fn test_update_agent_metrics() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-123", "session-1");
        save_agent_state(temp_dir.path(), &agent).unwrap();

        update_agent_metrics(temp_dir.path(), "agent-123", 1000, 0.05, 5).unwrap();

        let state = read_agent_state(temp_dir.path(), "agent-123").unwrap();
        assert_eq!(state.tokens, 1000);
        assert_eq!(state.cost, 0.05);
        assert_eq!(state.iteration_count, 5);
    }

    #[test]
    fn test_get_all_active_agents() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Idle agent
        let agent1 = create_test_agent("agent-1", "session-1");
        save_agent_state(temp_dir.path(), &agent1).unwrap();

        // Active agent
        let mut agent2 = create_test_agent("agent-2", "session-1");
        agent2.status = AgentStatus::Thinking;
        save_agent_state(temp_dir.path(), &agent2).unwrap();

        let active = get_all_active_agents(temp_dir.path()).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, "agent-2");
    }
}
