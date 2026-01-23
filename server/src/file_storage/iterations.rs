//! File-based storage for Ralph Loop iteration tracking
//!
//! Stores iteration history in `.ralph-ui/iterations/`:
//! - `{execution_id}.json` - Execution state and iteration history

use super::{ensure_dir, get_ralph_ui_dir, read_json, write_json, FileResult};
use crate::ralph_loop::{ExecutionStateSnapshot, IterationOutcome, IterationRecord};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Version of the iteration file format
const ITERATION_FILE_VERSION: u32 = 1;

/// Execution file structure that stores both state and iterations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionFile {
    /// File format version
    pub version: u32,
    /// Execution ID
    pub execution_id: String,
    /// Execution state JSON (for crash recovery)
    #[serde(default)]
    pub state: Option<String>,
    /// Last heartbeat timestamp
    #[serde(default)]
    pub last_heartbeat: Option<String>,
    /// Iteration history
    #[serde(default)]
    pub iterations: Vec<IterationRecord>,
}

/// Statistics for an execution's iterations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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

/// Get the iterations directory path for a project
pub fn get_iterations_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("iterations")
}

/// Get the file path for an execution's iteration history
pub fn get_execution_file_path(project_path: &Path, execution_id: &str) -> PathBuf {
    get_iterations_dir(project_path).join(format!("{}.json", execution_id))
}

/// Get or create an execution file
fn get_or_create_execution_file(
    project_path: &Path,
    execution_id: &str,
) -> FileResult<ExecutionFile> {
    let file_path = get_execution_file_path(project_path, execution_id);

    if file_path.exists() {
        read_json(&file_path)
    } else {
        Ok(ExecutionFile {
            version: ITERATION_FILE_VERSION,
            execution_id: execution_id.to_string(),
            state: None,
            last_heartbeat: None,
            iterations: Vec::new(),
        })
    }
}

/// Save execution file
fn save_execution_file(project_path: &Path, file: &ExecutionFile) -> FileResult<()> {
    let iterations_dir = get_iterations_dir(project_path);
    ensure_dir(&iterations_dir)?;

    let file_path = get_execution_file_path(project_path, &file.execution_id);
    write_json(&file_path, file)?;

    Ok(())
}

/// Insert a new iteration record
pub fn insert_iteration(project_path: &Path, record: &IterationRecord) -> FileResult<()> {
    let mut file = get_or_create_execution_file(project_path, &record.execution_id)?;

    // Check if iteration already exists
    if file.iterations.iter().any(|i| i.id == record.id) {
        return Err(format!("Iteration {} already exists", record.id));
    }

    file.iterations.push(record.clone());
    save_execution_file(project_path, &file)
}

/// Update an existing iteration record
pub fn update_iteration(
    project_path: &Path,
    execution_id: &str,
    id: &str,
    outcome: IterationOutcome,
    duration_secs: f64,
    completed_at: &str,
    error_message: Option<&str>,
) -> FileResult<usize> {
    let mut file = get_or_create_execution_file(project_path, execution_id)?;

    let mut updated = 0;
    for iteration in &mut file.iterations {
        if iteration.id == id {
            iteration.outcome = outcome.clone();
            iteration.duration_secs = duration_secs;
            iteration.completed_at = Some(completed_at.to_string());
            iteration.error_message = error_message.map(String::from);
            updated += 1;
        }
    }

    if updated > 0 {
        save_execution_file(project_path, &file)?;
    }

    Ok(updated)
}

/// Get all iterations for an execution
pub fn get_iterations_for_execution(
    project_path: &Path,
    execution_id: &str,
) -> FileResult<Vec<IterationRecord>> {
    let file = get_or_create_execution_file(project_path, execution_id)?;
    Ok(file.iterations)
}

/// Get iteration history with optional filters
pub fn get_iteration_history(
    project_path: &Path,
    execution_id: Option<&str>,
    outcome_filter: Option<IterationOutcome>,
    limit: Option<u32>,
) -> FileResult<Vec<IterationRecord>> {
    let iterations_dir = get_iterations_dir(project_path);

    if !iterations_dir.exists() {
        return Ok(Vec::new());
    }

    let mut all_iterations: Vec<IterationRecord> = Vec::new();

    if let Some(exec_id) = execution_id {
        // Get iterations for specific execution
        let file = get_or_create_execution_file(project_path, exec_id)?;
        all_iterations = file.iterations;
    } else {
        // Get iterations from all execution files
        let entries = std::fs::read_dir(&iterations_dir)
            .map_err(|e| format!("Failed to read iterations directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.extension().map_or(true, |ext| ext != "json") {
                continue;
            }

            if let Ok(file) = read_json::<ExecutionFile>(&path) {
                all_iterations.extend(file.iterations);
            }
        }
    }

    // Apply outcome filter
    if let Some(outcome) = outcome_filter {
        all_iterations.retain(|i| i.outcome == outcome);
    }

    // Sort by started_at descending
    all_iterations.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    // Apply limit
    if let Some(lim) = limit {
        all_iterations.truncate(lim as usize);
    }

    Ok(all_iterations)
}

/// Get summary statistics for an execution
pub fn get_execution_stats(project_path: &Path, execution_id: &str) -> FileResult<IterationStats> {
    let file = get_or_create_execution_file(project_path, execution_id)?;

    let mut stats = IterationStats::default();

    for iter in &file.iterations {
        stats.total += 1;
        stats.total_duration_secs += iter.duration_secs;

        match iter.outcome {
            IterationOutcome::Success => stats.successful += 1,
            IterationOutcome::Failed => stats.failed += 1,
            IterationOutcome::Skipped => stats.skipped += 1,
            IterationOutcome::Interrupted => stats.interrupted += 1,
        }

        if iter.rate_limit_encountered {
            stats.rate_limited += 1;
        }
    }

    Ok(stats)
}

/// Delete iterations for an execution
pub fn delete_iterations_for_execution(project_path: &Path, execution_id: &str) -> FileResult<usize> {
    let file_path = get_execution_file_path(project_path, execution_id);

    if !file_path.exists() {
        return Ok(0);
    }

    let file = get_or_create_execution_file(project_path, execution_id)?;
    let count = file.iterations.len();

    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete execution file: {}", e))?;

    Ok(count)
}

/// Save or update execution state snapshot
pub fn save_execution_state(
    project_path: &Path,
    snapshot: &ExecutionStateSnapshot,
) -> FileResult<()> {
    let mut file = get_or_create_execution_file(project_path, &snapshot.execution_id)?;
    file.state = Some(snapshot.state.clone());
    file.last_heartbeat = Some(snapshot.last_heartbeat.clone());
    save_execution_file(project_path, &file)
}

/// Update heartbeat for an execution
pub fn update_heartbeat(project_path: &Path, execution_id: &str, heartbeat: &str) -> FileResult<usize> {
    let mut file = get_or_create_execution_file(project_path, execution_id)?;
    file.last_heartbeat = Some(heartbeat.to_string());
    save_execution_file(project_path, &file)?;
    Ok(1)
}

/// Get execution state snapshot
pub fn get_execution_state(
    project_path: &Path,
    execution_id: &str,
) -> FileResult<Option<ExecutionStateSnapshot>> {
    let file_path = get_execution_file_path(project_path, execution_id);

    if !file_path.exists() {
        return Ok(None);
    }

    let file = get_or_create_execution_file(project_path, execution_id)?;

    match (&file.state, &file.last_heartbeat) {
        (Some(state), Some(heartbeat)) => Ok(Some(ExecutionStateSnapshot {
            execution_id: file.execution_id,
            state: state.clone(),
            last_heartbeat: heartbeat.clone(),
        })),
        _ => Ok(None),
    }
}

/// Get stale executions (heartbeat older than threshold)
pub fn get_stale_executions(
    project_path: &Path,
    threshold_secs: i64,
) -> FileResult<Vec<ExecutionStateSnapshot>> {
    let iterations_dir = get_iterations_dir(project_path);

    if !iterations_dir.exists() {
        return Ok(Vec::new());
    }

    let threshold_time = chrono::Utc::now() - chrono::Duration::seconds(threshold_secs);
    let mut stale = Vec::new();

    let entries = std::fs::read_dir(&iterations_dir)
        .map_err(|e| format!("Failed to read iterations directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }

        if let Ok(file) = read_json::<ExecutionFile>(&path) {
            if let (Some(state), Some(heartbeat)) = (&file.state, &file.last_heartbeat) {
                if let Ok(hb_time) = chrono::DateTime::parse_from_rfc3339(heartbeat) {
                    if hb_time.with_timezone(&chrono::Utc) < threshold_time {
                        stale.push(ExecutionStateSnapshot {
                            execution_id: file.execution_id,
                            state: state.clone(),
                            last_heartbeat: heartbeat.clone(),
                        });
                    }
                }
            }
        }
    }

    Ok(stale)
}

/// Delete execution state (cleanup after completion)
pub fn delete_execution_state(project_path: &Path, execution_id: &str) -> FileResult<usize> {
    let mut file = get_or_create_execution_file(project_path, execution_id)?;

    if file.state.is_none() && file.last_heartbeat.is_none() {
        return Ok(0);
    }

    file.state = None;
    file.last_heartbeat = None;

    // If no iterations left and no state, delete the file
    if file.iterations.is_empty() {
        let file_path = get_execution_file_path(project_path, execution_id);
        if file_path.exists() {
            std::fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to delete execution file: {}", e))?;
        }
    } else {
        save_execution_file(project_path, &file)?;
    }

    Ok(1)
}

/// Mark all in-progress iterations for an execution as interrupted
pub fn mark_interrupted_iterations(
    project_path: &Path,
    execution_id: &str,
    completed_at: &str,
) -> FileResult<usize> {
    let mut file = get_or_create_execution_file(project_path, execution_id)?;

    let mut count = 0;
    for iter in &mut file.iterations {
        if iter.completed_at.is_none() {
            iter.outcome = IterationOutcome::Interrupted;
            iter.completed_at = Some(completed_at.to_string());
            count += 1;
        }
    }

    if count > 0 {
        save_execution_file(project_path, &file)?;
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AgentType;
    use tempfile::TempDir;

    fn setup_test_project() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();
        temp_dir
    }

    fn create_test_iteration(id: &str, execution_id: &str, iteration: u32) -> IterationRecord {
        IterationRecord {
            id: id.to_string(),
            execution_id: execution_id.to_string(),
            iteration,
            outcome: IterationOutcome::Success,
            duration_secs: 60.5,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:01:00Z".to_string()),
        }
    }

    #[test]
    fn test_insert_and_get_iteration() {
        let temp_dir = setup_test_project();

        let record = create_test_iteration("iter-1", "exec-1", 1);
        insert_iteration(temp_dir.path(), &record).unwrap();

        let iterations = get_iterations_for_execution(temp_dir.path(), "exec-1").unwrap();
        assert_eq!(iterations.len(), 1);
        assert_eq!(iterations[0].id, "iter-1");
        assert_eq!(iterations[0].outcome, IterationOutcome::Success);
    }

    #[test]
    fn test_update_iteration() {
        let temp_dir = setup_test_project();

        let mut record = create_test_iteration("iter-1", "exec-1", 1);
        record.completed_at = None;
        insert_iteration(temp_dir.path(), &record).unwrap();

        update_iteration(
            temp_dir.path(),
            "exec-1",
            "iter-1",
            IterationOutcome::Failed,
            45.0,
            "2024-01-01T00:00:45Z",
            Some("Connection timeout"),
        )
        .unwrap();

        let iterations = get_iterations_for_execution(temp_dir.path(), "exec-1").unwrap();
        assert_eq!(iterations[0].outcome, IterationOutcome::Failed);
        assert_eq!(
            iterations[0].error_message,
            Some("Connection timeout".to_string())
        );
    }

    #[test]
    fn test_execution_stats() {
        let temp_dir = setup_test_project();

        for i in 1..=5 {
            let mut record = create_test_iteration(&format!("iter-{}", i), "exec-1", i);
            record.outcome = if i <= 3 {
                IterationOutcome::Success
            } else {
                IterationOutcome::Failed
            };
            record.rate_limit_encountered = i == 4;
            insert_iteration(temp_dir.path(), &record).unwrap();
        }

        let stats = get_execution_stats(temp_dir.path(), "exec-1").unwrap();
        assert_eq!(stats.total, 5);
        assert_eq!(stats.successful, 3);
        assert_eq!(stats.failed, 2);
        assert_eq!(stats.rate_limited, 1);
    }

    #[test]
    fn test_execution_state_operations() {
        let temp_dir = setup_test_project();

        let snapshot = ExecutionStateSnapshot {
            execution_id: "exec-1".to_string(),
            state: r#"{"iteration":3}"#.to_string(),
            last_heartbeat: "2024-01-01T00:00:00Z".to_string(),
        };

        save_execution_state(temp_dir.path(), &snapshot).unwrap();

        let retrieved = get_execution_state(temp_dir.path(), "exec-1").unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().execution_id, "exec-1");

        // Update heartbeat
        update_heartbeat(temp_dir.path(), "exec-1", "2024-01-01T00:01:00Z").unwrap();

        let retrieved = get_execution_state(temp_dir.path(), "exec-1").unwrap().unwrap();
        assert_eq!(retrieved.last_heartbeat, "2024-01-01T00:01:00Z");

        // Delete
        delete_execution_state(temp_dir.path(), "exec-1").unwrap();
        let retrieved = get_execution_state(temp_dir.path(), "exec-1").unwrap();
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_mark_interrupted_iterations() {
        let temp_dir = setup_test_project();

        let mut record = create_test_iteration("iter-1", "exec-1", 1);
        record.completed_at = None;
        insert_iteration(temp_dir.path(), &record).unwrap();

        let updated = mark_interrupted_iterations(temp_dir.path(), "exec-1", "2024-01-01T00:05:00Z").unwrap();

        assert_eq!(updated, 1);

        let iterations = get_iterations_for_execution(temp_dir.path(), "exec-1").unwrap();
        assert_eq!(iterations[0].outcome, IterationOutcome::Interrupted);
        assert_eq!(
            iterations[0].completed_at,
            Some("2024-01-01T00:05:00Z".to_string())
        );
    }
}
