//! Progress tracking: get, add_note, clear, summary

use crate::ralph_loop::ProgressSummary;

use super::helpers::progress_tracker;

// ============================================================================
// Progress Operations
// ============================================================================

/// Get progress.txt content
pub fn get_ralph_progress(project_path: String, prd_name: String) -> Result<String, String> {
    progress_tracker(&project_path, &prd_name).read_raw()
}

/// Get progress summary
pub fn get_ralph_progress_summary(
    project_path: String,
    prd_name: String,
) -> Result<ProgressSummary, String> {
    progress_tracker(&project_path, &prd_name).get_summary()
}

/// Add a note to progress.txt
pub fn add_ralph_progress_note(
    project_path: String,
    prd_name: String,
    iteration: u32,
    note: String,
) -> Result<(), String> {
    progress_tracker(&project_path, &prd_name).add_note(iteration, &note)
}

/// Clear progress.txt and reinitialize
pub fn clear_ralph_progress(project_path: String, prd_name: String) -> Result<(), String> {
    progress_tracker(&project_path, &prd_name).clear()
}
