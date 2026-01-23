//! Conversion module for GSD workflow
//!
//! Converts GSD planning documents to RalphPrd format.

use crate::gsd::config::ScopeLevel;
use crate::gsd::requirements::RequirementsDoc;
use crate::gsd::roadmap::RoadmapDoc;
use crate::ralph_loop::{PrdMetadata, RalphPrd, RalphStory};
use chrono::Utc;
use serde::{Deserialize, Serialize};

/// Options for converting to RalphPrd
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionOptions {
    /// Branch name for the PRD
    pub branch: String,
    /// Whether to include v2 requirements as lower priority
    pub include_v2: bool,
    /// Source chat session ID (for metadata)
    pub source_chat_id: Option<String>,
    /// Custom title (overrides derived title)
    pub custom_title: Option<String>,
    /// Custom description (overrides derived description)
    pub custom_description: Option<String>,
}

/// Result of conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResult {
    /// The generated RalphPrd
    pub prd: RalphPrd,
    /// Number of stories created
    pub story_count: usize,
    /// Requirements that were skipped (with reasons)
    pub skipped: Vec<SkippedRequirement>,
}

/// A requirement that was skipped during conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedRequirement {
    pub requirement_id: String,
    pub reason: String,
}

/// Convert GSD planning documents to RalphPrd format
pub fn convert_to_ralph_prd(
    requirements: &RequirementsDoc,
    roadmap: &RoadmapDoc,
    project_doc_title: Option<&str>,
    project_doc_description: Option<&str>,
    options: &ConversionOptions,
) -> ConversionResult {
    let mut stories = Vec::new();
    let mut skipped = Vec::new();

    // Determine title and description
    let title = options
        .custom_title
        .clone()
        .or_else(|| project_doc_title.map(|s| s.to_string()))
        .unwrap_or_else(|| "GSD Project".to_string());

    let description = options
        .custom_description
        .clone()
        .or_else(|| project_doc_description.map(|s| s.to_string()));

    // Process roadmap phases in order
    let mut priority = 1;
    for phase in &roadmap.phases {
        for req_id in &phase.requirement_ids {
            if let Some(req) = requirements.get(req_id) {
                // Skip if not v1 (unless include_v2 is set)
                if req.scope != ScopeLevel::V1 {
                    if req.scope == ScopeLevel::V2 && options.include_v2 {
                        // Include but with lower priority
                        let story = create_story_from_requirement(req, priority + 1000);
                        stories.push(story);
                    } else {
                        skipped.push(SkippedRequirement {
                            requirement_id: req_id.clone(),
                            reason: format!("Scope is {:?}, not v1", req.scope),
                        });
                    }
                    continue;
                }

                let story = create_story_from_requirement(req, priority);
                stories.push(story);
                priority += 1;
            } else {
                skipped.push(SkippedRequirement {
                    requirement_id: req_id.clone(),
                    reason: "Requirement not found".to_string(),
                });
            }
        }
    }

    // Include any v1 requirements not in roadmap
    for (req_id, req) in &requirements.requirements {
        if req.scope == ScopeLevel::V1 {
            let already_included = stories.iter().any(|s| s.id == *req_id);
            if !already_included {
                let story = create_story_from_requirement(req, priority);
                stories.push(story);
                priority += 1;
            }
        }
    }

    let story_count = stories.len();

    let prd = RalphPrd {
        title,
        description,
        branch: options.branch.clone(),
        stories,
        metadata: Some(PrdMetadata {
            created_at: Some(Utc::now().to_rfc3339()),
            updated_at: Some(Utc::now().to_rfc3339()),
            source_chat_id: options.source_chat_id.clone(),
            total_iterations: 0,
            last_execution_id: None,
            last_worktree_path: None,
        }),
        executions: Vec::new(),
    };

    ConversionResult {
        prd,
        story_count,
        skipped,
    }
}

/// Create a RalphStory from a Requirement
fn create_story_from_requirement(
    req: &crate::gsd::requirements::Requirement,
    priority: u32,
) -> RalphStory {
    // Build acceptance criteria string
    let acceptance = if req.acceptance_criteria.is_empty() {
        req.description.clone()
    } else {
        req.acceptance_criteria.join("\n- ")
    };

    // Map dependencies to story IDs (they should be REQ-IDs which are also story IDs)
    let dependencies: Vec<String> = req.dependencies.clone();

    // Map effort to tags
    let mut tags = req.tags.clone();
    if let Some(effort) = &req.effort {
        tags.push(format!("effort:{}", effort));
    }
    tags.push(format!("category:{}", req.category.prefix().to_lowercase()));

    let mut story = RalphStory::new(&req.id, &req.title, acceptance);
    story.description = Some(req.description.clone());
    story.priority = priority;
    story.dependencies = dependencies;
    story.tags = tags;
    story.effort = req.effort.clone();
    story
}

/// Generate a markdown summary of the conversion
pub fn conversion_summary_markdown(result: &ConversionResult) -> String {
    let mut md = String::new();

    md.push_str("# Conversion Summary\n\n");
    md.push_str(&format!("**Title:** {}\n", result.prd.title));
    if let Some(desc) = &result.prd.description {
        md.push_str(&format!("**Description:** {}\n", desc));
    }
    md.push_str(&format!("**Branch:** {}\n", result.prd.branch));
    md.push_str(&format!("**Stories Created:** {}\n\n", result.story_count));

    md.push_str("## Stories\n\n");
    for story in &result.prd.stories {
        md.push_str(&format!(
            "- **{}** - {} (priority: {})\n",
            story.id, story.title, story.priority
        ));
    }

    if !result.skipped.is_empty() {
        md.push_str("\n## Skipped Requirements\n\n");
        for skip in &result.skipped {
            md.push_str(&format!("- {} - {}\n", skip.requirement_id, skip.reason));
        }
    }

    md
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gsd::config::RequirementCategory;
    use crate::gsd::requirements::Requirement;
    use crate::gsd::roadmap::RoadmapPhase;

    #[test]
    fn test_convert_to_ralph_prd() {
        let mut requirements = RequirementsDoc::new();

        let mut req1 = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "User Auth".to_string(),
            "Implement user authentication".to_string(),
        );
        req1.scope = ScopeLevel::V1;
        req1.acceptance_criteria = vec![
            "Users can register".to_string(),
            "Users can log in".to_string(),
        ];
        req1.effort = Some("L".to_string());
        requirements.add(req1);

        let mut req2 = Requirement::new(
            "CORE-02".to_string(),
            RequirementCategory::Core,
            "Profile".to_string(),
            "User profile management".to_string(),
        );
        req2.scope = ScopeLevel::V1;
        req2.dependencies = vec!["CORE-01".to_string()];
        requirements.add(req2);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Auth".to_string(),
            description: "Authentication".to_string(),
            requirement_ids: vec!["CORE-01".to_string()],
            effort_summary: "L".to_string(),
            prerequisites: vec![],
            milestone: None,
        });
        roadmap.add_phase(RoadmapPhase {
            number: 2,
            title: "Profile".to_string(),
            description: "Profile management".to_string(),
            requirement_ids: vec!["CORE-02".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![1],
            milestone: None,
        });

        let options = ConversionOptions {
            branch: "feature/gsd-test".to_string(),
            ..Default::default()
        };

        let result = convert_to_ralph_prd(
            &requirements,
            &roadmap,
            Some("Test Project"),
            Some("A test project"),
            &options,
        );

        assert_eq!(result.story_count, 2);
        assert_eq!(result.prd.title, "Test Project");
        assert_eq!(result.prd.branch, "feature/gsd-test");
        assert!(result.skipped.is_empty());

        // Check story order matches roadmap
        assert_eq!(result.prd.stories[0].id, "CORE-01");
        assert_eq!(result.prd.stories[1].id, "CORE-02");

        // Check priorities
        assert!(result.prd.stories[0].priority < result.prd.stories[1].priority);

        // Check dependencies are preserved
        assert!(result.prd.stories[1]
            .dependencies
            .contains(&"CORE-01".to_string()));
    }

    #[test]
    fn test_skip_non_v1() {
        let mut requirements = RequirementsDoc::new();

        let mut req = Requirement::new(
            "UI-01".to_string(),
            RequirementCategory::Ui,
            "Admin".to_string(),
            "Admin dashboard".to_string(),
        );
        req.scope = ScopeLevel::V2;
        requirements.add(req);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Test".to_string(),
            description: "Test".to_string(),
            requirement_ids: vec!["UI-01".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let options = ConversionOptions {
            branch: "test".to_string(),
            include_v2: false,
            ..Default::default()
        };

        let result = convert_to_ralph_prd(&requirements, &roadmap, None, None, &options);

        assert_eq!(result.story_count, 0);
        assert_eq!(result.skipped.len(), 1);
    }

    #[test]
    fn test_include_v2() {
        let mut requirements = RequirementsDoc::new();

        let mut req = Requirement::new(
            "UI-01".to_string(),
            RequirementCategory::Ui,
            "Admin".to_string(),
            "Admin dashboard".to_string(),
        );
        req.scope = ScopeLevel::V2;
        requirements.add(req);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Test".to_string(),
            description: "Test".to_string(),
            requirement_ids: vec!["UI-01".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let options = ConversionOptions {
            branch: "test".to_string(),
            include_v2: true,
            ..Default::default()
        };

        let result = convert_to_ralph_prd(&requirements, &roadmap, None, None, &options);

        assert_eq!(result.story_count, 1);
        assert!(result.skipped.is_empty());
        // V2 should have higher priority number (lower priority)
        assert!(result.prd.stories[0].priority > 1000);
    }
}
