//! Roadmap module for GSD workflow
//!
//! Derives execution phases from scoped requirements.

use crate::gsd::config::ScopeLevel;
use crate::gsd::requirements::{Requirement, RequirementsDoc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// A phase in the execution roadmap
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoadmapPhase {
    /// Phase number (1-based)
    pub number: u32,
    /// Phase title
    pub title: String,
    /// Description of what this phase accomplishes
    pub description: String,
    /// Requirement IDs included in this phase
    pub requirement_ids: Vec<String>,
    /// Estimated effort summary
    pub effort_summary: String,
    /// Prerequisites (previous phase numbers)
    pub prerequisites: Vec<u32>,
    /// Milestone for this phase
    pub milestone: Option<String>,
}

/// Complete roadmap document
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoadmapDoc {
    /// Version being planned (typically "v1")
    pub version: String,
    /// Phases in order
    pub phases: Vec<RoadmapPhase>,
    /// Requirements not included in any phase
    pub deferred: Vec<String>,
}

impl RoadmapDoc {
    /// Create a new roadmap for a version
    pub fn new(version: &str) -> Self {
        Self {
            version: version.to_string(),
            phases: Vec::new(),
            deferred: Vec::new(),
        }
    }

    /// Add a phase
    pub fn add_phase(&mut self, phase: RoadmapPhase) {
        self.phases.push(phase);
    }

    /// Get total requirement count in roadmap
    pub fn total_requirements(&self) -> usize {
        self.phases
            .iter()
            .map(|p| p.requirement_ids.len())
            .sum()
    }

    /// Export to markdown format
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();
        md.push_str(&format!("# {} Roadmap\n\n", self.version.to_uppercase()));
        md.push_str(&format!(
            "Total requirements: {}\n\n",
            self.total_requirements()
        ));

        md.push_str("## Phase Overview\n\n");
        md.push_str("| Phase | Title | Requirements | Effort |\n");
        md.push_str("|-------|-------|--------------|--------|\n");
        for phase in &self.phases {
            md.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                phase.number,
                phase.title,
                phase.requirement_ids.len(),
                phase.effort_summary
            ));
        }
        md.push_str("\n");

        for phase in &self.phases {
            md.push_str(&format!("## Phase {}: {}\n\n", phase.number, phase.title));
            md.push_str(&format!("{}\n\n", phase.description));

            if let Some(milestone) = &phase.milestone {
                md.push_str(&format!("**Milestone:** {}\n\n", milestone));
            }

            if !phase.prerequisites.is_empty() {
                md.push_str(&format!(
                    "**Requires:** Phase {}\n\n",
                    phase
                        .prerequisites
                        .iter()
                        .map(|p| p.to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }

            md.push_str("**Requirements:**\n");
            for req_id in &phase.requirement_ids {
                md.push_str(&format!("- {}\n", req_id));
            }
            md.push_str("\n");
        }

        if !self.deferred.is_empty() {
            md.push_str("## Deferred\n\n");
            md.push_str("The following requirements are deferred to future versions:\n\n");
            for req_id in &self.deferred {
                md.push_str(&format!("- {}\n", req_id));
            }
        }

        md
    }
}

/// Derive a roadmap from scoped requirements
pub fn derive_roadmap(requirements: &RequirementsDoc) -> RoadmapDoc {
    let mut roadmap = RoadmapDoc::new("v1");

    // Get v1 requirements
    let v1_reqs: Vec<&Requirement> = requirements.get_by_scope(ScopeLevel::V1);

    if v1_reqs.is_empty() {
        return roadmap;
    }

    // Build dependency graph
    let mut dep_graph: HashMap<&str, HashSet<&str>> = HashMap::new();
    for req in &v1_reqs {
        let deps: HashSet<&str> = req
            .dependencies
            .iter()
            .filter(|d| requirements.get(d).map(|r| r.scope == ScopeLevel::V1).unwrap_or(false))
            .map(|s| s.as_str())
            .collect();
        dep_graph.insert(&req.id, deps);
    }

    // Topological sort to determine phase ordering
    let phases = topological_phases(&v1_reqs, &dep_graph);

    // Create phases
    for (i, phase_reqs) in phases.iter().enumerate() {
        let phase_num = (i + 1) as u32;

        // Determine effort summary
        let effort_summary = summarize_effort(phase_reqs);

        // Determine prerequisites
        let prerequisites: Vec<u32> = if phase_num > 1 {
            vec![phase_num - 1]
        } else {
            Vec::new()
        };

        let phase = RoadmapPhase {
            number: phase_num,
            title: format!("Phase {}", phase_num),
            description: generate_phase_description(phase_reqs),
            requirement_ids: phase_reqs.iter().map(|r| r.id.clone()).collect(),
            effort_summary,
            prerequisites,
            milestone: None,
        };

        roadmap.add_phase(phase);
    }

    // Add deferred (v2 + out of scope)
    for req in requirements.requirements.values() {
        if req.scope == ScopeLevel::V2 || req.scope == ScopeLevel::OutOfScope {
            roadmap.deferred.push(req.id.clone());
        }
    }

    roadmap
}

/// Group requirements into phases based on dependencies
fn topological_phases<'a>(
    reqs: &[&'a Requirement],
    dep_graph: &HashMap<&str, HashSet<&str>>,
) -> Vec<Vec<&'a Requirement>> {
    let mut phases: Vec<Vec<&'a Requirement>> = Vec::new();
    let mut scheduled: HashSet<&str> = HashSet::new();
    let mut remaining: Vec<&Requirement> = reqs.to_vec();

    while !remaining.is_empty() {
        // Find all requirements whose dependencies are satisfied
        let mut phase: Vec<&Requirement> = Vec::new();

        remaining.retain(|req| {
            let deps = dep_graph.get(req.id.as_str()).cloned().unwrap_or_default();
            if deps.iter().all(|d| scheduled.contains(d)) {
                phase.push(*req);
                false // Remove from remaining
            } else {
                true // Keep in remaining
            }
        });

        // If no progress, there's a cycle - just add remaining to last phase
        if phase.is_empty() && !remaining.is_empty() {
            log::warn!("Dependency cycle detected in requirements");
            phase = remaining.drain(..).collect();
        }

        // Mark these as scheduled
        for req in &phase {
            scheduled.insert(&req.id);
        }

        if !phase.is_empty() {
            // Sort by priority within phase
            phase.sort_by(|a, b| {
                a.priority
                    .unwrap_or(100)
                    .cmp(&b.priority.unwrap_or(100))
            });
            phases.push(phase);
        }
    }

    phases
}

/// Summarize effort for a set of requirements
fn summarize_effort(reqs: &[&Requirement]) -> String {
    let mut counts: HashMap<&str, usize> = HashMap::new();

    for req in reqs {
        if let Some(effort) = &req.effort {
            *counts.entry(effort.as_str()).or_insert(0) += 1;
        }
    }

    if counts.is_empty() {
        return format!("{} items", reqs.len());
    }

    let mut parts: Vec<String> = Vec::new();
    for size in &["S", "M", "L", "XL"] {
        if let Some(count) = counts.get(size) {
            parts.push(format!("{}{}", count, size));
        }
    }

    if parts.is_empty() {
        format!("{} items", reqs.len())
    } else {
        parts.join(" + ")
    }
}

/// Generate a description for a phase based on its requirements
fn generate_phase_description(reqs: &[&Requirement]) -> String {
    if reqs.is_empty() {
        return "Empty phase".to_string();
    }

    let titles: Vec<&str> = reqs.iter().take(3).map(|r| r.title.as_str()).collect();
    let mut desc = format!("Implement {}", titles.join(", "));

    if reqs.len() > 3 {
        desc.push_str(&format!(" and {} more", reqs.len() - 3));
    }

    desc
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gsd::config::RequirementCategory;

    fn create_test_requirements() -> RequirementsDoc {
        let mut doc = RequirementsDoc::new();

        // Add some v1 requirements with dependencies
        let mut req1 = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Database Setup".to_string(),
            "Set up database".to_string(),
        );
        req1.scope = ScopeLevel::V1;
        req1.effort = Some("M".to_string());
        doc.add(req1);

        let mut req2 = Requirement::new(
            "CORE-02".to_string(),
            RequirementCategory::Core,
            "User Auth".to_string(),
            "User authentication".to_string(),
        );
        req2.scope = ScopeLevel::V1;
        req2.dependencies = vec!["CORE-01".to_string()];
        req2.effort = Some("L".to_string());
        doc.add(req2);

        let mut req3 = Requirement::new(
            "UI-01".to_string(),
            RequirementCategory::Ui,
            "Login Page".to_string(),
            "Login page UI".to_string(),
        );
        req3.scope = ScopeLevel::V1;
        req3.dependencies = vec!["CORE-02".to_string()];
        req3.effort = Some("S".to_string());
        doc.add(req3);

        // Add a v2 requirement
        let mut req4 = Requirement::new(
            "UI-02".to_string(),
            RequirementCategory::Ui,
            "Admin Dashboard".to_string(),
            "Admin dashboard".to_string(),
        );
        req4.scope = ScopeLevel::V2;
        doc.add(req4);

        doc
    }

    #[test]
    fn test_derive_roadmap() {
        let requirements = create_test_requirements();
        let roadmap = derive_roadmap(&requirements);

        assert_eq!(roadmap.version, "v1");
        assert_eq!(roadmap.phases.len(), 3); // Three phases due to dependencies
        assert_eq!(roadmap.deferred.len(), 1); // One v2 requirement

        // First phase should have CORE-01 (no dependencies)
        assert!(roadmap.phases[0].requirement_ids.contains(&"CORE-01".to_string()));

        // Second phase should have CORE-02 (depends on CORE-01)
        assert!(roadmap.phases[1].requirement_ids.contains(&"CORE-02".to_string()));

        // Third phase should have UI-01 (depends on CORE-02)
        assert!(roadmap.phases[2].requirement_ids.contains(&"UI-01".to_string()));
    }

    #[test]
    fn test_roadmap_to_markdown() {
        let requirements = create_test_requirements();
        let roadmap = derive_roadmap(&requirements);
        let md = roadmap.to_markdown();

        assert!(md.contains("# V1 Roadmap"));
        assert!(md.contains("## Phase 1"));
        assert!(md.contains("CORE-01"));
        assert!(md.contains("## Deferred"));
        assert!(md.contains("UI-02"));
    }

    #[test]
    fn test_effort_summary() {
        let requirements = create_test_requirements();
        let v1_reqs: Vec<&Requirement> = requirements.get_by_scope(ScopeLevel::V1);
        let summary = summarize_effort(&v1_reqs);

        assert!(summary.contains("S") || summary.contains("M") || summary.contains("L"));
    }
}
