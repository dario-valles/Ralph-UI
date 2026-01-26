//! Iteration history operations

use crate::file_storage::iterations as iteration_storage;
use crate::file_storage::iterations::IterationStats;
use crate::ralph_loop::{ExecutionStateSnapshot, IterationOutcome, IterationRecord};
use crate::utils::as_path;

// ============================================================================
// Iteration History Operations
// ============================================================================

/// Get iteration history for an execution
pub fn get_ralph_iteration_history(
    project_path: String,
    execution_id: String,
) -> Result<Vec<IterationRecord>, String> {
    let path = as_path(&project_path);
    iteration_storage::get_iterations_for_execution(path, &execution_id)
        .map_err(|e| format!("Failed to get iteration history: {}", e))
}

/// Get iteration statistics for an execution
pub fn get_ralph_iteration_stats(
    project_path: String,
    execution_id: String,
) -> Result<IterationStats, String> {
    let path = as_path(&project_path);
    iteration_storage::get_execution_stats(path, &execution_id)
        .map_err(|e| format!("Failed to get iteration stats: {}", e))
}

/// Get all iteration history with optional filters
pub fn get_all_ralph_iterations(
    project_path: String,
    execution_id: Option<String>,
    outcome_filter: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<IterationRecord>, String> {
    let path = as_path(&project_path);

    let outcome = outcome_filter.and_then(|s| match s.as_str() {
        "success" => Some(IterationOutcome::Success),
        "failed" => Some(IterationOutcome::Failed),
        "skipped" => Some(IterationOutcome::Skipped),
        "interrupted" => Some(IterationOutcome::Interrupted),
        _ => None,
    });

    iteration_storage::get_iteration_history(path, execution_id.as_deref(), outcome, limit)
        .map_err(|e| format!("Failed to get iteration history: {}", e))
}

/// Save an iteration record (used by orchestrator)
pub fn save_ralph_iteration(project_path: String, record: IterationRecord) -> Result<(), String> {
    let path = as_path(&project_path);
    iteration_storage::insert_iteration(path, &record)
        .map_err(|e| format!("Failed to save iteration: {}", e))
}

/// Update an iteration record (used by orchestrator on completion)
pub fn update_ralph_iteration(
    project_path: String,
    execution_id: String,
    id: String,
    outcome: String,
    duration_secs: f64,
    completed_at: String,
    error_message: Option<String>,
) -> Result<(), String> {
    let path = as_path(&project_path);

    let outcome_enum = match outcome.as_str() {
        "success" => IterationOutcome::Success,
        "failed" => IterationOutcome::Failed,
        "skipped" => IterationOutcome::Skipped,
        "interrupted" => IterationOutcome::Interrupted,
        _ => return Err(format!("Invalid outcome: {}", outcome)),
    };

    iteration_storage::update_iteration(
        path,
        &execution_id,
        &id,
        outcome_enum,
        duration_secs,
        &completed_at,
        error_message.as_deref(),
    )
    .map_err(|e| format!("Failed to update iteration: {}", e))?;

    Ok(())
}

/// Save execution state snapshot (for heartbeat/crash recovery)
pub fn save_ralph_execution_state(
    project_path: String,
    snapshot: ExecutionStateSnapshot,
) -> Result<(), String> {
    let path = as_path(&project_path);
    iteration_storage::save_execution_state(path, &snapshot)
        .map_err(|e| format!("Failed to save execution state: {}", e))
}

/// Update heartbeat for an execution
pub fn update_ralph_heartbeat(project_path: String, execution_id: String) -> Result<(), String> {
    let path = as_path(&project_path);
    let heartbeat = chrono::Utc::now().to_rfc3339();
    iteration_storage::update_heartbeat(path, &execution_id, &heartbeat)
        .map_err(|e| format!("Failed to update heartbeat: {}", e))?;
    Ok(())
}

/// Get execution state snapshot
pub fn get_ralph_execution_state(
    project_path: String,
    execution_id: String,
) -> Result<Option<ExecutionStateSnapshot>, String> {
    let path = as_path(&project_path);
    iteration_storage::get_execution_state(path, &execution_id)
        .map_err(|e| format!("Failed to get execution state: {}", e))
}

/// Check for stale executions (crash recovery)
pub fn check_stale_ralph_executions(
    project_path: String,
    threshold_secs: Option<i64>,
) -> Result<Vec<ExecutionStateSnapshot>, String> {
    let path = as_path(&project_path);
    let threshold = threshold_secs.unwrap_or(120); // Default 2 minutes
    iteration_storage::get_stale_executions(path, threshold)
        .map_err(|e| format!("Failed to check stale executions: {}", e))
}

/// Mark stale iterations as interrupted (crash recovery)
pub fn recover_stale_ralph_iterations(
    project_path: String,
    execution_id: String,
) -> Result<u32, String> {
    let path = as_path(&project_path);
    let completed_at = chrono::Utc::now().to_rfc3339();

    let count = iteration_storage::mark_interrupted_iterations(path, &execution_id, &completed_at)
        .map_err(|e| format!("Failed to recover iterations: {}", e))?;

    // Clean up execution state
    iteration_storage::delete_execution_state(path, &execution_id)
        .map_err(|e| format!("Failed to delete execution state: {}", e))?;

    Ok(count as u32)
}

/// Delete iteration history for an execution (cleanup)
pub fn delete_ralph_iteration_history(
    project_path: String,
    execution_id: String,
) -> Result<u32, String> {
    let path = as_path(&project_path);

    let count = iteration_storage::delete_iterations_for_execution(path, &execution_id)
        .map_err(|e| format!("Failed to delete iterations: {}", e))?;

    Ok(count as u32)
}

/// Cleanup old iteration history records (maintenance)
/// File-based iterations are stored per-execution, so this removes old execution files
pub fn cleanup_ralph_iteration_history(
    project_path: String,
    days_to_keep: Option<i64>,
) -> Result<u32, String> {
    let path = as_path(&project_path);
    let days = days_to_keep.unwrap_or(30); // Default: keep 30 days
    let threshold_time = chrono::Utc::now() - chrono::Duration::days(days);

    let iterations_dir = path.join(".ralph-ui").join("iterations");
    if !iterations_dir.exists() {
        return Ok(0);
    }

    let mut count = 0u32;
    if let Ok(entries) = std::fs::read_dir(&iterations_dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.extension().map_or(true, |ext| ext != "json") {
                continue;
            }

            // Check file modification time
            if let Ok(metadata) = file_path.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified_time: chrono::DateTime<chrono::Utc> = modified.into();
                    if modified_time < threshold_time {
                        if std::fs::remove_file(&file_path).is_ok() {
                            count += 1;
                        }
                    }
                }
            }
        }
    }

    log::info!(
        "[RalphLoop] Cleaned up {} old iteration files (older than {} days)",
        count,
        days
    );
    Ok(count)
}
