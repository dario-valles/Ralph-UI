//! Requirements module for GSD workflow
//!
//! Handles requirement enumeration, REQ-ID generation, and scoping.

use crate::gsd::config::{RequirementCategory, ScopeLevel};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A single requirement in the GSD workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    /// Unique requirement ID (e.g., CORE-01, UI-03)
    pub id: String,
    /// Category of the requirement
    pub category: RequirementCategory,
    /// Short title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// User story format (optional)
    pub user_story: Option<String>,
    /// Acceptance criteria
    pub acceptance_criteria: Vec<String>,
    /// Scope level (v1, v2, out-of-scope)
    pub scope: ScopeLevel,
    /// Dependencies on other requirement IDs
    pub dependencies: Vec<String>,
    /// Estimated effort (S/M/L/XL)
    pub effort: Option<String>,
    /// Priority within scope (1 = highest)
    pub priority: Option<u32>,
    /// Tags for filtering
    pub tags: Vec<String>,
}

impl Requirement {
    /// Create a new unscoped requirement
    pub fn new(
        id: String,
        category: RequirementCategory,
        title: String,
        description: String,
    ) -> Self {
        Self {
            id,
            category,
            title,
            description,
            user_story: None,
            acceptance_criteria: Vec::new(),
            scope: ScopeLevel::Unscoped,
            dependencies: Vec::new(),
            effort: None,
            priority: None,
            tags: Vec::new(),
        }
    }

    /// Set the scope for this requirement
    pub fn with_scope(mut self, scope: ScopeLevel) -> Self {
        self.scope = scope;
        self
    }

    /// Add acceptance criteria
    pub fn with_acceptance(mut self, criteria: Vec<String>) -> Self {
        self.acceptance_criteria = criteria;
        self
    }
}

/// Requirements document containing all enumerated requirements
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementsDoc {
    /// All requirements indexed by ID
    pub requirements: HashMap<String, Requirement>,
    /// Counters for ID generation per category
    #[serde(skip)]
    category_counters: HashMap<String, u32>,
}

impl RequirementsDoc {
    /// Create a new empty requirements document
    pub fn new() -> Self {
        Self {
            requirements: HashMap::new(),
            category_counters: HashMap::new(),
        }
    }

    /// Generate the next REQ-ID for a category
    pub fn next_id(&mut self, category: &RequirementCategory) -> String {
        let prefix = category.prefix();
        let counter = self.category_counters.entry(prefix.to_string()).or_insert(0);
        *counter += 1;
        format!("{}-{:02}", prefix, counter)
    }

    /// Add a requirement with auto-generated ID
    pub fn add_requirement(
        &mut self,
        category: RequirementCategory,
        title: String,
        description: String,
    ) -> String {
        let id = self.next_id(&category);
        let req = Requirement::new(id.clone(), category, title, description);
        self.requirements.insert(id.clone(), req);
        id
    }

    /// Add a fully constructed requirement
    pub fn add(&mut self, requirement: Requirement) {
        // Update counter if this ID is higher
        if let Some((prefix, num_str)) = requirement.id.split_once('-') {
            if let Ok(num) = num_str.parse::<u32>() {
                let counter = self
                    .category_counters
                    .entry(prefix.to_string())
                    .or_insert(0);
                if num > *counter {
                    *counter = num;
                }
            }
        }
        self.requirements.insert(requirement.id.clone(), requirement);
    }

    /// Get a requirement by ID
    pub fn get(&self, id: &str) -> Option<&Requirement> {
        self.requirements.get(id)
    }

    /// Get a mutable reference to a requirement
    pub fn get_mut(&mut self, id: &str) -> Option<&mut Requirement> {
        self.requirements.get_mut(id)
    }

    /// Set the scope for a requirement
    pub fn set_scope(&mut self, id: &str, scope: ScopeLevel) -> bool {
        if let Some(req) = self.requirements.get_mut(id) {
            req.scope = scope;
            true
        } else {
            false
        }
    }

    /// Get all requirements for a given scope
    pub fn get_by_scope(&self, scope: ScopeLevel) -> Vec<&Requirement> {
        self.requirements
            .values()
            .filter(|r| r.scope == scope)
            .collect()
    }

    /// Get all requirements for a given category
    pub fn get_by_category(&self, category: &RequirementCategory) -> Vec<&Requirement> {
        self.requirements
            .values()
            .filter(|r| &r.category == category)
            .collect()
    }

    /// Get all unscoped requirements
    pub fn get_unscoped(&self) -> Vec<&Requirement> {
        self.get_by_scope(ScopeLevel::Unscoped)
    }

    /// Count requirements by scope
    pub fn count_by_scope(&self) -> HashMap<ScopeLevel, usize> {
        let mut counts = HashMap::new();
        for req in self.requirements.values() {
            *counts.entry(req.scope).or_insert(0) += 1;
        }
        counts
    }

    /// Export to markdown format
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();
        md.push_str("# Requirements\n\n");

        // Group by category
        let mut by_category: HashMap<&RequirementCategory, Vec<&Requirement>> = HashMap::new();
        for req in self.requirements.values() {
            by_category.entry(&req.category).or_default().push(req);
        }

        // Sort categories
        let mut categories: Vec<_> = by_category.keys().collect();
        categories.sort_by_key(|c| c.prefix());

        for category in categories {
            md.push_str(&format!("## {}\n\n", category.display_name()));

            let mut reqs: Vec<_> = by_category[category].clone();
            reqs.sort_by(|a, b| a.id.cmp(&b.id));

            for req in reqs {
                md.push_str(&format!("### {} - {}\n\n", req.id, req.title));
                md.push_str(&format!("**Scope:** {}\n\n", req.scope.display_name()));
                md.push_str(&format!("{}\n\n", req.description));

                if let Some(story) = &req.user_story {
                    md.push_str(&format!("**User Story:** {}\n\n", story));
                }

                if !req.acceptance_criteria.is_empty() {
                    md.push_str("**Acceptance Criteria:**\n");
                    for criterion in &req.acceptance_criteria {
                        md.push_str(&format!("- [ ] {}\n", criterion));
                    }
                    md.push_str("\n");
                }

                if let Some(effort) = &req.effort {
                    md.push_str(&format!("**Effort:** {}\n\n", effort));
                }

                if !req.dependencies.is_empty() {
                    md.push_str(&format!(
                        "**Dependencies:** {}\n\n",
                        req.dependencies.join(", ")
                    ));
                }
            }
        }

        md
    }
}

/// Scope selection made by the user
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeSelection {
    /// Requirements selected for v1
    pub v1: Vec<String>,
    /// Requirements selected for v2
    pub v2: Vec<String>,
    /// Requirements marked out of scope
    pub out_of_scope: Vec<String>,
}

impl ScopeSelection {
    /// Apply this selection to a requirements document
    pub fn apply(&self, doc: &mut RequirementsDoc) {
        for id in &self.v1 {
            doc.set_scope(id, ScopeLevel::V1);
        }
        for id in &self.v2 {
            doc.set_scope(id, ScopeLevel::V2);
        }
        for id in &self.out_of_scope {
            doc.set_scope(id, ScopeLevel::OutOfScope);
        }
    }

    /// Create from a requirements document (extract current scoping)
    pub fn from_doc(doc: &RequirementsDoc) -> Self {
        let mut v1 = Vec::new();
        let mut v2 = Vec::new();
        let mut out_of_scope = Vec::new();

        for req in doc.requirements.values() {
            match req.scope {
                ScopeLevel::V1 => v1.push(req.id.clone()),
                ScopeLevel::V2 => v2.push(req.id.clone()),
                ScopeLevel::OutOfScope => out_of_scope.push(req.id.clone()),
                ScopeLevel::Unscoped => {}
            }
        }

        Self {
            v1,
            v2,
            out_of_scope,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_requirement_id_generation() {
        let mut doc = RequirementsDoc::new();

        let id1 = doc.add_requirement(
            RequirementCategory::Core,
            "Auth".to_string(),
            "User auth".to_string(),
        );
        assert_eq!(id1, "CORE-01");

        let id2 = doc.add_requirement(
            RequirementCategory::Core,
            "Profile".to_string(),
            "User profile".to_string(),
        );
        assert_eq!(id2, "CORE-02");

        let id3 = doc.add_requirement(
            RequirementCategory::Ui,
            "Dashboard".to_string(),
            "Main dashboard".to_string(),
        );
        assert_eq!(id3, "UI-01");
    }

    #[test]
    fn test_scope_selection() {
        let mut doc = RequirementsDoc::new();
        doc.add_requirement(
            RequirementCategory::Core,
            "A".to_string(),
            "Desc".to_string(),
        );
        doc.add_requirement(
            RequirementCategory::Core,
            "B".to_string(),
            "Desc".to_string(),
        );
        doc.add_requirement(
            RequirementCategory::Ui,
            "C".to_string(),
            "Desc".to_string(),
        );

        let selection = ScopeSelection {
            v1: vec!["CORE-01".to_string()],
            v2: vec!["CORE-02".to_string()],
            out_of_scope: vec!["UI-01".to_string()],
        };

        selection.apply(&mut doc);

        assert_eq!(doc.get("CORE-01").unwrap().scope, ScopeLevel::V1);
        assert_eq!(doc.get("CORE-02").unwrap().scope, ScopeLevel::V2);
        assert_eq!(doc.get("UI-01").unwrap().scope, ScopeLevel::OutOfScope);
    }

    #[test]
    fn test_get_by_scope() {
        let mut doc = RequirementsDoc::new();
        doc.add(
            Requirement::new(
                "CORE-01".to_string(),
                RequirementCategory::Core,
                "A".to_string(),
                "Desc".to_string(),
            )
            .with_scope(ScopeLevel::V1),
        );
        doc.add(
            Requirement::new(
                "CORE-02".to_string(),
                RequirementCategory::Core,
                "B".to_string(),
                "Desc".to_string(),
            )
            .with_scope(ScopeLevel::V1),
        );
        doc.add(
            Requirement::new(
                "UI-01".to_string(),
                RequirementCategory::Ui,
                "C".to_string(),
                "Desc".to_string(),
            )
            .with_scope(ScopeLevel::V2),
        );

        let v1_reqs = doc.get_by_scope(ScopeLevel::V1);
        assert_eq!(v1_reqs.len(), 2);

        let v2_reqs = doc.get_by_scope(ScopeLevel::V2);
        assert_eq!(v2_reqs.len(), 1);
    }

    #[test]
    fn test_to_markdown() {
        let mut doc = RequirementsDoc::new();
        doc.add(
            Requirement::new(
                "CORE-01".to_string(),
                RequirementCategory::Core,
                "Authentication".to_string(),
                "User authentication system".to_string(),
            )
            .with_scope(ScopeLevel::V1)
            .with_acceptance(vec!["Users can log in".to_string()]),
        );

        let md = doc.to_markdown();
        assert!(md.contains("# Requirements"));
        assert!(md.contains("## Core Functionality"));
        assert!(md.contains("### CORE-01 - Authentication"));
        assert!(md.contains("Users can log in"));
    }
}
