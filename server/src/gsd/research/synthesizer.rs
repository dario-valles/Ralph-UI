//! Research synthesizer for GSD workflow
//!
//! Reads all research output files and generates a consolidated SUMMARY.md

use crate::gsd::config::ResearchAgentType;
use crate::gsd::planning_storage::{
    list_research_files, read_research_file, write_planning_file, PlanningFile,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Synthesized research summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSynthesis {
    /// The generated summary content
    pub content: String,
    /// Number of research files included
    pub files_included: usize,
    /// Files that were missing or failed
    pub missing_files: Vec<String>,
    /// Key themes extracted from research
    pub key_themes: Vec<String>,
}

/// Synthesize research outputs into SUMMARY.md
pub fn synthesize_research(
    project_path: &Path,
    session_id: &str,
) -> Result<ResearchSynthesis, String> {
    // List all research files
    let files = list_research_files(project_path, session_id)?;

    let mut sections = Vec::new();
    let mut missing_files = Vec::new();
    let mut key_themes = Vec::new();

    // Read each research type
    for agent_type in ResearchAgentType::all() {
        let filename = agent_type.output_filename();

        if files.contains(&filename.to_string()) {
            match read_research_file(project_path, session_id, filename) {
                Ok(content) => {
                    sections.push(ResearchSection {
                        title: agent_type.display_name().to_string(),
                        content,
                    });

                    // Extract themes from each section
                    let themes =
                        extract_themes_from_content(*agent_type, &sections.last().unwrap().content);
                    key_themes.extend(themes);
                }
                Err(e) => {
                    log::warn!("Failed to read research file {}: {}", filename, e);
                    missing_files.push(filename.to_string());
                }
            }
        } else {
            missing_files.push(filename.to_string());
        }
    }

    // Generate the summary
    let summary_content = generate_summary(&sections, &key_themes);

    // Write the summary file
    write_planning_file(
        project_path,
        session_id,
        PlanningFile::Summary,
        &summary_content,
    )?;

    // Deduplicate themes
    key_themes.sort();
    key_themes.dedup();

    Ok(ResearchSynthesis {
        content: summary_content,
        files_included: sections.len(),
        missing_files,
        key_themes,
    })
}

/// A section of research content
struct ResearchSection {
    title: String,
    content: String,
}

/// Generate the summary markdown content
fn generate_summary(sections: &[ResearchSection], key_themes: &[String]) -> String {
    let mut summary = String::new();

    // Header
    summary.push_str("# Research Summary\n\n");
    summary
        .push_str("This document synthesizes the research findings from all research agents.\n\n");

    // Key themes section
    if !key_themes.is_empty() {
        summary.push_str("## Key Themes\n\n");
        for theme in key_themes.iter().take(10) {
            summary.push_str(&format!("- {}\n", theme));
        }
        summary.push_str("\n");
    }

    // Table of contents
    summary.push_str("## Contents\n\n");
    for (i, section) in sections.iter().enumerate() {
        summary.push_str(&format!(
            "{}. [{}](#{})\n",
            i + 1,
            section.title,
            section.title.to_lowercase().replace(' ', "-")
        ));
    }
    summary.push_str("\n---\n\n");

    // Include each section
    for section in sections {
        summary.push_str(&format!("## {}\n\n", section.title));

        // Include the content, but remove the redundant H1 if present
        let content = remove_leading_h1(&section.content);
        summary.push_str(&content);
        summary.push_str("\n\n---\n\n");
    }

    // Footer
    summary.push_str("## Next Steps\n\n");
    summary
        .push_str("Based on this research, the next step is to enumerate detailed requirements.\n");
    summary.push_str("Use the scoping phase to prioritize features for v1 vs v2.\n");

    summary
}

/// Remove leading H1 header from content to avoid duplication
fn remove_leading_h1(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();

    if let Some(first_line) = lines.first() {
        if first_line.starts_with("# ") {
            // Skip the first line and any following empty lines
            let remaining: Vec<&str> = lines
                .into_iter()
                .skip(1)
                .skip_while(|line| line.trim().is_empty())
                .collect();
            return remaining.join("\n");
        }
    }

    content.to_string()
}

/// Extract key themes from research content
fn extract_themes_from_content(agent_type: ResearchAgentType, content: &str) -> Vec<String> {
    let mut themes = Vec::new();

    // Simple heuristic: extract H2 headers as themes
    for line in content.lines() {
        if line.starts_with("## ") {
            let theme = line.trim_start_matches("## ").trim();
            if !theme.is_empty()
                && !theme.eq_ignore_ascii_case("summary")
                && !theme.eq_ignore_ascii_case("placeholder")
            {
                themes.push(format!("[{}] {}", agent_type.display_name(), theme));
            }
        }
    }

    // Limit themes per section
    themes.truncate(5);
    themes
}

/// Check if synthesis is possible (enough research files exist)
pub fn can_synthesize(project_path: &Path, session_id: &str) -> Result<bool, String> {
    let files = list_research_files(project_path, session_id)?;

    // Need at least 2 research files to synthesize
    let expected_files: Vec<&str> = ResearchAgentType::all()
        .iter()
        .map(|t| t.output_filename())
        .collect();

    let found_count = expected_files
        .iter()
        .filter(|f| files.contains(&f.to_string()))
        .count();

    Ok(found_count >= 2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gsd::planning_storage::{init_planning_session, write_research_file};
    use tempfile::TempDir;

    #[test]
    fn test_synthesize_research() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        // Initialize session
        init_planning_session(project_path, session_id).unwrap();

        // Write some research files
        write_research_file(
            project_path,
            session_id,
            "architecture.md",
            "# Architecture Research\n\n## Design Patterns\n\nContent here...",
        )
        .unwrap();

        write_research_file(
            project_path,
            session_id,
            "codebase.md",
            "# Codebase Analysis\n\n## Existing Patterns\n\nMore content...",
        )
        .unwrap();

        // Synthesize
        let result = synthesize_research(project_path, session_id).unwrap();

        assert_eq!(result.files_included, 2);
        assert!(result.content.contains("Research Summary"));
        assert!(result.content.contains("Architecture Research"));
        assert!(result.content.contains("Codebase Analysis"));
    }

    #[test]
    fn test_can_synthesize() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        init_planning_session(project_path, session_id).unwrap();

        // No files yet
        assert!(!can_synthesize(project_path, session_id).unwrap());

        // Add one file
        write_research_file(project_path, session_id, "architecture.md", "Content").unwrap();
        assert!(!can_synthesize(project_path, session_id).unwrap());

        // Add second file
        write_research_file(project_path, session_id, "codebase.md", "Content").unwrap();
        assert!(can_synthesize(project_path, session_id).unwrap());
    }

    #[test]
    fn test_remove_leading_h1() {
        let content = "# Heading\n\nContent here";
        assert_eq!(remove_leading_h1(content), "Content here");

        let content_no_h1 = "Content without heading";
        assert_eq!(remove_leading_h1(content_no_h1), "Content without heading");
    }
}
