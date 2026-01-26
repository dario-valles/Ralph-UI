//! Verification module for GSD workflow
//!
//! Checks coverage of requirements and detects gaps.
//! Supports revision iterations to track progress in fixing issues.

use crate::gsd::config::ScopeLevel;
use crate::gsd::requirements::RequirementsDoc;
use crate::gsd::roadmap::RoadmapDoc;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Result of verification checks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    /// Whether all checks passed
    pub passed: bool,
    /// Overall coverage percentage (0-100)
    pub coverage_percentage: u8,
    /// Issues found during verification
    pub issues: Vec<VerificationIssue>,
    /// Warnings (non-blocking)
    pub warnings: Vec<VerificationWarning>,
    /// Summary statistics
    pub stats: VerificationStats,
}

/// A verification issue (blocking)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationIssue {
    /// Issue code for categorization
    pub code: String,
    /// Severity level
    pub severity: IssueSeverity,
    /// Human-readable message
    pub message: String,
    /// Related requirement IDs (if any)
    pub related_requirements: Vec<String>,
    /// Suggested fix
    pub suggestion: Option<String>,
}

/// A verification warning (non-blocking)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationWarning {
    /// Warning code
    pub code: String,
    /// Human-readable message
    pub message: String,
    /// Related requirement IDs
    pub related_requirements: Vec<String>,
}

/// Severity of verification issues
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    /// Critical - must be fixed
    Critical,
    /// High - should be fixed
    High,
    /// Medium - consider fixing
    Medium,
    /// Low - nice to fix
    Low,
}

/// A single verification iteration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationIteration {
    /// Iteration number (1-indexed)
    pub iteration: u32,
    /// When this iteration was performed
    pub timestamp: DateTime<Utc>,
    /// The verification result for this iteration
    pub result: VerificationResult,
    /// Issue codes that were fixed since the previous iteration
    pub issues_fixed: Vec<String>,
    /// Issue codes that are new since the previous iteration
    pub new_issues: Vec<String>,
}

/// Verification history tracking all iterations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationHistory {
    /// All verification iterations
    pub iterations: Vec<VerificationIteration>,
    /// Current iteration number
    pub current_iteration: u32,
}

impl VerificationHistory {
    /// Create a new empty verification history
    pub fn new() -> Self {
        Self {
            iterations: Vec::new(),
            current_iteration: 0,
        }
    }

    /// Add a new iteration from a verification result
    pub fn add_iteration(&mut self, result: VerificationResult) -> &VerificationIteration {
        let previous_issue_codes: HashSet<String> = if let Some(prev) = self.iterations.last() {
            prev.result
                .issues
                .iter()
                .map(|i| format!("{}:{}", i.code, i.related_requirements.join(",")))
                .collect()
        } else {
            HashSet::new()
        };

        let current_issue_codes: HashSet<String> = result
            .issues
            .iter()
            .map(|i| format!("{}:{}", i.code, i.related_requirements.join(",")))
            .collect();

        // Fixed issues: in previous but not in current
        let issues_fixed: Vec<String> = previous_issue_codes
            .difference(&current_issue_codes)
            .cloned()
            .collect();

        // New issues: in current but not in previous
        let new_issues: Vec<String> = current_issue_codes
            .difference(&previous_issue_codes)
            .cloned()
            .collect();

        self.current_iteration += 1;

        let iteration = VerificationIteration {
            iteration: self.current_iteration,
            timestamp: Utc::now(),
            result,
            issues_fixed,
            new_issues,
        };

        self.iterations.push(iteration);
        self.iterations.last().unwrap()
    }

    /// Get the latest iteration
    pub fn latest(&self) -> Option<&VerificationIteration> {
        self.iterations.last()
    }

    /// Get improvement percentage from first to latest
    pub fn improvement_percentage(&self) -> Option<f32> {
        if self.iterations.len() < 2 {
            return None;
        }

        let first = &self.iterations[0];
        let latest = self.iterations.last()?;

        let first_issues = first.result.issues.len() as f32;
        let latest_issues = latest.result.issues.len() as f32;

        if first_issues == 0.0 {
            return Some(0.0);
        }

        Some(((first_issues - latest_issues) / first_issues) * 100.0)
    }

    /// Get summary statistics for all iterations
    pub fn summary(&self) -> VerificationHistorySummary {
        let total_iterations = self.iterations.len();
        let total_issues_found = self.iterations.iter().map(|i| i.result.issues.len()).sum();
        let total_issues_fixed = self.iterations.iter().map(|i| i.issues_fixed.len()).sum();
        let current_issues = self.latest().map(|i| i.result.issues.len()).unwrap_or(0);
        let improvement = self.improvement_percentage();

        VerificationHistorySummary {
            total_iterations,
            total_issues_found,
            total_issues_fixed,
            current_issues,
            improvement_percentage: improvement,
        }
    }
}

/// Summary of verification history
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationHistorySummary {
    /// Total number of verification iterations
    pub total_iterations: usize,
    /// Total issues found across all iterations
    pub total_issues_found: usize,
    /// Total issues that were fixed
    pub total_issues_fixed: usize,
    /// Current number of remaining issues
    pub current_issues: usize,
    /// Improvement percentage from first to latest iteration
    pub improvement_percentage: Option<f32>,
}

/// Verification statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationStats {
    /// Total requirements
    pub total_requirements: usize,
    /// Requirements in v1 scope
    pub v1_count: usize,
    /// Requirements in v2 scope
    pub v2_count: usize,
    /// Requirements out of scope
    pub out_of_scope_count: usize,
    /// Unscoped requirements
    pub unscoped_count: usize,
    /// Requirements in roadmap
    pub in_roadmap_count: usize,
    /// Requirements not in roadmap
    pub not_in_roadmap_count: usize,
    /// Requirements with dependencies
    pub with_dependencies_count: usize,
    /// Orphaned dependencies (referenced but don't exist)
    pub orphaned_dependencies: usize,
}

/// Verify requirements and roadmap for completeness
pub fn verify_plans(requirements: &RequirementsDoc, roadmap: &RoadmapDoc) -> VerificationResult {
    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    let mut stats = VerificationStats::default();

    // Calculate basic stats
    stats.total_requirements = requirements.requirements.len();
    let counts = requirements.count_by_scope();
    stats.v1_count = *counts.get(&ScopeLevel::V1).unwrap_or(&0);
    stats.v2_count = *counts.get(&ScopeLevel::V2).unwrap_or(&0);
    stats.out_of_scope_count = *counts.get(&ScopeLevel::OutOfScope).unwrap_or(&0);
    stats.unscoped_count = *counts.get(&ScopeLevel::Unscoped).unwrap_or(&0);

    // Collect all requirement IDs in roadmap
    let roadmap_req_ids: HashSet<String> = roadmap
        .phases
        .iter()
        .flat_map(|p| p.requirement_ids.iter().cloned())
        .collect();

    stats.in_roadmap_count = roadmap_req_ids.len();

    // Check 1: Unscoped requirements
    if stats.unscoped_count > 0 {
        let unscoped: Vec<String> = requirements
            .get_unscoped()
            .iter()
            .map(|r| r.id.clone())
            .collect();

        issues.push(VerificationIssue {
            code: "UNSCOPED_REQUIREMENTS".to_string(),
            severity: IssueSeverity::High,
            message: format!("{} requirements have not been scoped", stats.unscoped_count),
            related_requirements: unscoped,
            suggestion: Some(
                "Review and assign scope (v1/v2/out-of-scope) to all requirements".to_string(),
            ),
        });
    }

    // Check 2: V1 requirements not in roadmap
    let v1_ids: HashSet<String> = requirements
        .get_by_scope(ScopeLevel::V1)
        .iter()
        .map(|r| r.id.clone())
        .collect();

    let missing_from_roadmap: Vec<String> = v1_ids.difference(&roadmap_req_ids).cloned().collect();

    if !missing_from_roadmap.is_empty() {
        issues.push(VerificationIssue {
            code: "V1_NOT_IN_ROADMAP".to_string(),
            severity: IssueSeverity::Critical,
            message: format!(
                "{} v1 requirements are not included in the roadmap",
                missing_from_roadmap.len()
            ),
            related_requirements: missing_from_roadmap,
            suggestion: Some("Add these requirements to roadmap phases".to_string()),
        });
    }

    // Check 3: Requirements in roadmap that aren't v1
    let not_v1_in_roadmap: Vec<String> = roadmap_req_ids.difference(&v1_ids).cloned().collect();

    if !not_v1_in_roadmap.is_empty() {
        warnings.push(VerificationWarning {
            code: "NON_V1_IN_ROADMAP".to_string(),
            message: format!(
                "{} requirements in roadmap are not marked as v1",
                not_v1_in_roadmap.len()
            ),
            related_requirements: not_v1_in_roadmap,
        });
    }

    // Check 4: Orphaned dependencies
    let all_req_ids: HashSet<&str> = requirements
        .requirements
        .keys()
        .map(|s| s.as_str())
        .collect();

    for req in requirements.requirements.values() {
        for dep in &req.dependencies {
            if !all_req_ids.contains(dep.as_str()) {
                stats.orphaned_dependencies += 1;
                issues.push(VerificationIssue {
                    code: "ORPHANED_DEPENDENCY".to_string(),
                    severity: IssueSeverity::Medium,
                    message: format!(
                        "Requirement {} depends on {} which does not exist",
                        req.id, dep
                    ),
                    related_requirements: vec![req.id.clone()],
                    suggestion: Some(format!(
                        "Create requirement {} or remove the dependency",
                        dep
                    )),
                });
            }
        }

        if !req.dependencies.is_empty() {
            stats.with_dependencies_count += 1;
        }
    }

    // Check 5: Empty phases in roadmap
    for phase in &roadmap.phases {
        if phase.requirement_ids.is_empty() {
            warnings.push(VerificationWarning {
                code: "EMPTY_PHASE".to_string(),
                message: format!("Phase {} has no requirements", phase.number),
                related_requirements: vec![],
            });
        }
    }

    // Check 6: Requirements without acceptance criteria
    let without_acceptance: Vec<String> = requirements
        .requirements
        .values()
        .filter(|r| r.scope == ScopeLevel::V1 && r.acceptance_criteria.is_empty())
        .map(|r| r.id.clone())
        .collect();

    if !without_acceptance.is_empty() {
        warnings.push(VerificationWarning {
            code: "NO_ACCEPTANCE_CRITERIA".to_string(),
            message: format!(
                "{} v1 requirements have no acceptance criteria",
                without_acceptance.len()
            ),
            related_requirements: without_acceptance,
        });
    }

    // Calculate coverage
    let coverage = if stats.total_requirements > 0 {
        let scoped = stats.total_requirements - stats.unscoped_count;
        ((scoped as f32 / stats.total_requirements as f32) * 100.0) as u8
    } else {
        100
    };

    stats.not_in_roadmap_count = stats.v1_count.saturating_sub(stats.in_roadmap_count);

    // Determine if passed (no critical or high issues)
    let passed = !issues
        .iter()
        .any(|i| i.severity == IssueSeverity::Critical || i.severity == IssueSeverity::High);

    VerificationResult {
        passed,
        coverage_percentage: coverage,
        issues,
        warnings,
        stats,
    }
}

/// Export verification result to markdown
pub fn verification_to_markdown(result: &VerificationResult) -> String {
    let mut md = String::new();

    md.push_str("# Verification Results\n\n");

    // Status badge
    if result.passed {
        md.push_str("**Status:** ✅ PASSED\n\n");
    } else {
        md.push_str("**Status:** ❌ FAILED\n\n");
    }

    md.push_str(&format!(
        "**Coverage:** {}%\n\n",
        result.coverage_percentage
    ));

    // Stats
    md.push_str("## Statistics\n\n");
    md.push_str("| Metric | Value |\n");
    md.push_str("|--------|-------|\n");
    md.push_str(&format!(
        "| Total Requirements | {} |\n",
        result.stats.total_requirements
    ));
    md.push_str(&format!("| V1 Scope | {} |\n", result.stats.v1_count));
    md.push_str(&format!("| V2 Scope | {} |\n", result.stats.v2_count));
    md.push_str(&format!(
        "| Out of Scope | {} |\n",
        result.stats.out_of_scope_count
    ));
    md.push_str(&format!("| Unscoped | {} |\n", result.stats.unscoped_count));
    md.push_str(&format!(
        "| In Roadmap | {} |\n",
        result.stats.in_roadmap_count
    ));
    md.push_str("\n");

    // Issues
    if !result.issues.is_empty() {
        md.push_str("## Issues\n\n");
        for issue in &result.issues {
            let severity_icon = match issue.severity {
                IssueSeverity::Critical => "🔴",
                IssueSeverity::High => "🟠",
                IssueSeverity::Medium => "🟡",
                IssueSeverity::Low => "🟢",
            };
            md.push_str(&format!(
                "### {} [{}] {}\n\n",
                severity_icon, issue.code, issue.message
            ));

            if !issue.related_requirements.is_empty() {
                md.push_str("**Affected:** ");
                md.push_str(&issue.related_requirements.join(", "));
                md.push_str("\n\n");
            }

            if let Some(suggestion) = &issue.suggestion {
                md.push_str(&format!("**Suggestion:** {}\n\n", suggestion));
            }
        }
    }

    // Warnings
    if !result.warnings.is_empty() {
        md.push_str("## Warnings\n\n");
        for warning in &result.warnings {
            md.push_str(&format!(
                "### ⚠️ [{}] {}\n\n",
                warning.code, warning.message
            ));

            if !warning.related_requirements.is_empty() {
                md.push_str("**Affected:** ");
                md.push_str(&warning.related_requirements.join(", "));
                md.push_str("\n\n");
            }
        }
    }

    md
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gsd::config::RequirementCategory;
    use crate::gsd::requirements::Requirement;
    use crate::gsd::roadmap::{derive_roadmap, RoadmapPhase};

    #[test]
    fn test_verify_complete_plans() {
        let mut requirements = RequirementsDoc::new();
        let mut req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Test".to_string(),
            "Test description".to_string(),
        );
        req.scope = ScopeLevel::V1;
        req.acceptance_criteria = vec!["Criterion 1".to_string()];
        requirements.add(req);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Phase 1".to_string(),
            description: "Test phase".to_string(),
            requirement_ids: vec!["CORE-01".to_string()],
            effort_summary: "1S".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let result = verify_plans(&requirements, &roadmap);

        assert!(result.passed);
        assert_eq!(result.coverage_percentage, 100);
        assert!(result.issues.is_empty());
    }

    #[test]
    fn test_verify_unscoped_requirements() {
        let mut requirements = RequirementsDoc::new();
        requirements.add(Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Test".to_string(),
            "Test description".to_string(),
        )); // Unscoped

        let roadmap = RoadmapDoc::new("v1");

        let result = verify_plans(&requirements, &roadmap);

        assert!(!result.passed);
        assert!(result
            .issues
            .iter()
            .any(|i| i.code == "UNSCOPED_REQUIREMENTS"));
    }

    #[test]
    fn test_verify_missing_from_roadmap() {
        let mut requirements = RequirementsDoc::new();
        let mut req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Test".to_string(),
            "Test description".to_string(),
        );
        req.scope = ScopeLevel::V1;
        requirements.add(req);

        // Empty roadmap
        let roadmap = RoadmapDoc::new("v1");

        let result = verify_plans(&requirements, &roadmap);

        assert!(!result.passed);
        assert!(result.issues.iter().any(|i| i.code == "V1_NOT_IN_ROADMAP"));
    }

    #[test]
    fn test_verify_orphaned_dependency() {
        let mut requirements = RequirementsDoc::new();
        let mut req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Test".to_string(),
            "Test description".to_string(),
        );
        req.scope = ScopeLevel::V1;
        req.dependencies = vec!["NONEXISTENT-01".to_string()];
        requirements.add(req);

        let roadmap = derive_roadmap(&requirements);
        let result = verify_plans(&requirements, &roadmap);

        assert!(result
            .issues
            .iter()
            .any(|i| i.code == "ORPHANED_DEPENDENCY"));
    }

    #[test]
    fn test_verification_to_markdown() {
        let result = VerificationResult {
            passed: true,
            coverage_percentage: 100,
            issues: vec![],
            warnings: vec![],
            stats: VerificationStats::default(),
        };

        let md = verification_to_markdown(&result);
        assert!(md.contains("# Verification Results"));
        assert!(md.contains("PASSED"));
    }
}
