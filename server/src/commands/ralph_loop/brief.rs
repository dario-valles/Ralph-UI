//! Brief operations: get, regenerate, historical

use serde::Serialize;
use std::path::Path;

// ============================================================================
// Types
// ============================================================================

/// Get historical briefs for a PRD (US-6.1: View Current Brief - historical briefs)
#[derive(Serialize)]
pub struct HistoricalBrief {
    pub iteration: u32,
    pub content: String,
}

// ============================================================================
// Brief Operations
// ============================================================================

/// Get the current BRIEF.md content for a PRD (US-6.1: View Current Brief)
pub fn get_ralph_brief(project_path: String, prd_name: String) -> Result<String, String> {
    let briefs_path = format!(".ralph-ui/briefs/{}/BRIEF.md", prd_name);
    let full_path = std::path::PathBuf::from(&project_path).join(&briefs_path);

    match std::fs::read_to_string(&full_path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(format!("BRIEF.md not found at {}", briefs_path))
        }
        Err(e) => Err(format!("Failed to read BRIEF.md: {}", e)),
    }
}

/// Regenerate the BRIEF.md file for a PRD (US-6.1: View Current Brief)
pub fn regenerate_ralph_brief(project_path: String, prd_name: String) -> Result<String, String> {
    use crate::ralph_loop::{BriefBuilder, LearningsManager, PrdExecutor};

    let project_path_ref = Path::new(&project_path);

    // Load the PRD
    let prd_executor = PrdExecutor::new(project_path_ref, &prd_name);
    let prd = prd_executor
        .read_prd()
        .map_err(|e| format!("Failed to load PRD: {}", e))?;

    // Load learnings
    let learnings_manager = LearningsManager::new(project_path_ref, &prd_name);

    // Generate brief (no iteration for current brief)
    let brief_builder = BriefBuilder::new(project_path_ref, &prd_name);
    brief_builder
        .generate_brief_with_learnings_manager(&prd, &learnings_manager, None)
        .map_err(|e| format!("Failed to generate brief: {}", e))?;

    // Return the generated content
    get_ralph_brief(project_path, prd_name)
}

/// Get historical briefs for a PRD (US-6.1: View Current Brief - historical briefs)
pub fn get_ralph_historical_briefs(
    project_path: String,
    prd_name: String,
) -> Result<Vec<HistoricalBrief>, String> {
    use crate::ralph_loop::BriefBuilder;

    let brief_builder = BriefBuilder::new(Path::new(&project_path), &prd_name);
    let briefs = brief_builder.list_historical_briefs()?;

    Ok(briefs
        .into_iter()
        .map(|(iteration, content)| HistoricalBrief { iteration, content })
        .collect())
}
