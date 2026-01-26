//! Common helper functions and types for Ralph Loop commands

use crate::ralph_loop::{
    ExecutionSnapshot, PrdExecutor, ProgressTracker, PromptBuilder, RalphLoopOrchestrator,
    SnapshotStore,
};
use crate::utils::to_path_buf;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ============================================================================
// Helper Functions
// ============================================================================

/// Create a PrdExecutor from project path and PRD name strings.
/// Reduces repetitive `PrdExecutor::new(&to_path_buf(&project_path), &prd_name)` pattern.
#[inline]
pub(crate) fn prd_executor(project_path: &str, prd_name: &str) -> PrdExecutor {
    PrdExecutor::new(&to_path_buf(project_path), prd_name)
}

/// Create a ProgressTracker from project path and PRD name strings.
#[inline]
pub(crate) fn progress_tracker(project_path: &str, prd_name: &str) -> ProgressTracker {
    ProgressTracker::new(&to_path_buf(project_path), prd_name)
}

/// Create a PromptBuilder from project path and PRD name strings.
#[inline]
pub(crate) fn prompt_builder(project_path: &str, prd_name: &str) -> PromptBuilder {
    PromptBuilder::new(&to_path_buf(project_path), prd_name)
}

/// Resolve a configuration value with fallback chain.
/// Tries request value first, then PRD config, then global config, then default.
#[inline]
pub(crate) fn resolve_config<T>(
    request_val: Option<T>,
    prd_val: Option<T>,
    global_val: Option<T>,
    default: T,
) -> T {
    request_val.or(prd_val).or(global_val).unwrap_or(default)
}

/// Resolve an optional configuration value with fallback chain.
/// Like resolve_config but returns Option<T> instead of T.
#[inline]
pub(crate) fn resolve_config_opt<T>(
    request_val: Option<T>,
    prd_val: Option<T>,
    global_val: Option<T>,
) -> Option<T> {
    request_val.or(prd_val).or(global_val)
}

// ============================================================================
// Application State
// ============================================================================

/// State for managing active Ralph loop executions (Application state)
pub struct RalphLoopManagerState {
    /// Active executions by execution ID
    /// Uses tokio::sync::Mutex for async-friendly locking during run()
    pub(crate) executions: Mutex<HashMap<String, Arc<tokio::sync::Mutex<RalphLoopOrchestrator>>>>,
    /// Execution snapshots that can be read without locking the orchestrator
    /// Uses Arc so it can be shared with the orchestrator for direct updates
    pub(crate) snapshots: SnapshotStore,
}

impl RalphLoopManagerState {
    pub fn new() -> Self {
        Self {
            executions: Mutex::new(HashMap::new()),
            snapshots: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get a clone of the snapshots Arc for sharing with the orchestrator
    pub fn snapshots_arc(&self) -> SnapshotStore {
        self.snapshots.clone()
    }

    /// Get a snapshot for an execution
    pub fn get_snapshot(&self, execution_id: &str) -> Option<ExecutionSnapshot> {
        let snapshots = match self.snapshots.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::warn!("Snapshots mutex was poisoned, recovering");
                poisoned.into_inner()
            }
        };
        snapshots.get(execution_id).cloned()
    }

    /// Get an execution orchestrator by ID (for server mode)
    pub fn get_execution(
        &self,
        execution_id: &str,
    ) -> Result<Option<Arc<tokio::sync::Mutex<RalphLoopOrchestrator>>>, String> {
        let executions = self
            .executions
            .lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        Ok(executions.get(execution_id).cloned())
    }

    /// Insert an execution orchestrator (for server mode)
    pub fn insert_execution(
        &self,
        execution_id: String,
        orchestrator: Arc<tokio::sync::Mutex<RalphLoopOrchestrator>>,
    ) -> Result<(), String> {
        let mut executions = self
            .executions
            .lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.insert(execution_id, orchestrator);
        Ok(())
    }
}

impl Default for RalphLoopManagerState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Common Types
// ============================================================================

/// Information about Ralph loop files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphFiles {
    pub has_prd: bool,
    pub has_progress: bool,
    pub has_prompt: bool,
    pub has_config: bool,
    pub prd_path: String,
    pub progress_path: String,
    pub prompt_path: String,
    pub config_path: String,
    /// Names of PRD files found in .ralph-ui/prds/
    pub prd_names: Vec<String>,
}
