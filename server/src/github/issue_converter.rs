//! GitHub Issue to Ralph Story converter
//!
//! Converts GitHub issues into Ralph PRD stories for task management.

use crate::github::Issue;
use crate::ralph_loop::RalphStory;
use regex::Regex;
use serde::{Deserialize, Serialize};

/// Result of importing GitHub issues
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueImportResult {
    /// Number of issues successfully imported
    pub imported_count: usize,
    /// Number of issues skipped (duplicates, etc.)
    pub skipped_count: usize,
    /// List of imported story IDs
    pub imported_story_ids: Vec<String>,
    /// Any warnings during import
    pub warnings: Vec<String>,
}

/// Options for importing GitHub issues
#[derive(Debug, Clone)]
pub struct IssueImportOptions {
    /// Only import issues with these labels
    pub labels: Option<Vec<String>>,
    /// Prefix for generated story IDs (default: "gh")
    pub id_prefix: String,
    /// Whether to include issue body as description
    pub include_body: bool,
    /// Whether to use issue labels as story tags
    pub use_labels_as_tags: bool,
}

impl Default for IssueImportOptions {
    fn default() -> Self {
        Self {
            labels: None,
            id_prefix: "gh".to_string(),
            include_body: true,
            use_labels_as_tags: true,
        }
    }
}

/// Convert a GitHub issue to a Ralph story
///
/// # Arguments
/// * `issue` - The GitHub issue to convert
/// * `options` - Import options
///
/// # Returns
/// A RalphStory representing the issue
pub fn issue_to_story(issue: &Issue, options: &IssueImportOptions) -> RalphStory {
    let id = format!("{}-{}", options.id_prefix, issue.number);

    // Extract acceptance criteria from issue body if possible
    let acceptance = extract_acceptance_criteria(&issue.body)
        .unwrap_or_else(|| format!("Complete implementation for: {}", issue.title));

    // Use issue body as description if option is set
    let description = if options.include_body {
        issue.body.clone()
    } else {
        None
    };

    // Extract effort from labels if present
    let effort = extract_effort_from_labels(&issue.labels);

    // Use labels as tags if option is set
    let tags = if options.use_labels_as_tags {
        // Filter out effort labels
        issue
            .labels
            .iter()
            .filter(|l| !is_effort_label(l))
            .cloned()
            .collect()
    } else {
        Vec::new()
    };

    // Estimate priority from labels
    let priority = estimate_priority_from_labels(&issue.labels);

    RalphStory {
        id,
        title: issue.title.clone(),
        description,
        acceptance,
        passes: false,
        priority,
        dependencies: Vec::new(),
        tags,
        effort,
        subtasks: Vec::new(),
        requires_primary_review: false,
    }
}

/// Extract acceptance criteria from issue body
///
/// Looks for common patterns like:
/// - ## Acceptance Criteria
/// - **Acceptance Criteria:**
/// - - [ ] Checkbox items
fn extract_acceptance_criteria(body: &Option<String>) -> Option<String> {
    let body = body.as_ref()?;

    // Look for explicit acceptance criteria section header
    // Match "## Acceptance Criteria" followed by content until next heading
    if let Some(start) = body.to_lowercase().find("## acceptance criteria") {
        // Find the actual position in original string
        let section_start = start + "## acceptance criteria".len();
        // Skip any trailing whitespace/colon and newline
        let content_start = body[section_start..]
            .find('\n')
            .map(|n| section_start + n + 1)
            .unwrap_or(section_start);

        // Find the end - next ## heading or end of string
        let rest = &body[content_start..];
        let content_end = rest.find("\n#").unwrap_or(rest.len());
        let criteria = rest[..content_end].trim();

        if !criteria.is_empty() {
            return Some(criteria.to_string());
        }
    }

    // Look for bold acceptance criteria pattern
    let bold_patterns = [
        r"(?i)\*\*acceptance\s+criteria:?\*\*\s*\n([\s\S]*?)(?=\n+\*\*|$)",
    ];

    for pattern in bold_patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(captures) = re.captures(body) {
                if let Some(content) = captures.get(1) {
                    let criteria = content.as_str().trim();
                    if !criteria.is_empty() {
                        return Some(criteria.to_string());
                    }
                }
            }
        }
    }

    // If no AC section, look for checkbox items
    if let Ok(re) = Regex::new(r"- \[ \].*") {
        let checkboxes: Vec<&str> = re.find_iter(body).map(|m| m.as_str()).collect();
        if !checkboxes.is_empty() {
            return Some(checkboxes.join("\n"));
        }
    }

    // Fall back to first paragraph if short enough
    let first_para = body.split("\n\n").next()?;
    if first_para.len() < 500 {
        Some(format!("Verify: {}", first_para.trim()))
    } else {
        None
    }
}

/// Extract effort estimate from labels
fn extract_effort_from_labels(labels: &[String]) -> Option<String> {
    for label in labels {
        let lower = label.to_lowercase();
        if lower.contains("xs") || lower.contains("extra small") {
            return Some("XS".to_string());
        }
        if lower.contains("small") || lower == "s" || lower.ends_with("/s") {
            return Some("S".to_string());
        }
        if lower.contains("medium") || lower == "m" || lower.ends_with("/m") {
            return Some("M".to_string());
        }
        if lower.contains("large") && !lower.contains("extra") || lower == "l" || lower.ends_with("/l")
        {
            return Some("L".to_string());
        }
        if lower.contains("xl") || lower.contains("extra large") {
            return Some("XL".to_string());
        }
    }
    None
}

/// Check if a label is an effort label
fn is_effort_label(label: &str) -> bool {
    let lower = label.to_lowercase();
    lower.contains("xs")
        || lower.contains("small")
        || lower.contains("medium")
        || lower.contains("large")
        || lower.contains("xl")
        || lower == "s"
        || lower == "m"
        || lower == "l"
        || lower.ends_with("/s")
        || lower.ends_with("/m")
        || lower.ends_with("/l")
}

/// Estimate priority from labels
fn estimate_priority_from_labels(labels: &[String]) -> u32 {
    for label in labels {
        let lower = label.to_lowercase();
        if lower.contains("critical") || lower.contains("p0") || lower.contains("urgent") {
            return 10;
        }
        if lower.contains("high") || lower.contains("p1") || lower.contains("important") {
            return 30;
        }
        if lower.contains("medium") || lower.contains("p2") {
            return 50;
        }
        if lower.contains("low") || lower.contains("p3") {
            return 70;
        }
        if lower.contains("nice") || lower.contains("p4") || lower.contains("backlog") {
            return 90;
        }
    }
    // Default priority
    50
}

/// Filter issues based on import options
pub fn filter_issues<'a>(issues: &'a [Issue], options: &IssueImportOptions) -> Vec<&'a Issue> {
    issues
        .iter()
        .filter(|issue| {
            // Filter by labels if specified
            if let Some(ref required_labels) = options.labels {
                let has_required = required_labels
                    .iter()
                    .any(|required| issue.labels.iter().any(|l| l.eq_ignore_ascii_case(required)));
                if !has_required {
                    return false;
                }
            }
            true
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_issue(number: u32, title: &str, body: Option<&str>, labels: Vec<&str>) -> Issue {
        Issue {
            number,
            title: title.to_string(),
            body: body.map(|s| s.to_string()),
            state: "open".to_string(),
            html_url: format!("https://github.com/test/repo/issues/{}", number),
            labels: labels.into_iter().map(|s| s.to_string()).collect(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_issue_to_story_basic() {
        let issue = make_issue(123, "Add login feature", Some("User should be able to log in"), vec![]);
        let options = IssueImportOptions::default();

        let story = issue_to_story(&issue, &options);

        assert_eq!(story.id, "gh-123");
        assert_eq!(story.title, "Add login feature");
        assert_eq!(story.description.as_deref(), Some("User should be able to log in"));
    }

    #[test]
    fn test_extract_acceptance_criteria_section() {
        let body = "Some intro\n\n## Acceptance Criteria\n- Users can log in\n- Error messages shown\n\n## Notes";
        let ac = extract_acceptance_criteria(&Some(body.to_string()));
        assert!(ac.is_some());
        assert!(ac.unwrap().contains("Users can log in"));
    }

    #[test]
    fn test_extract_acceptance_criteria_checkboxes() {
        let body = "Implement auth:\n- [ ] Login form\n- [ ] Validation\n- [ ] Error handling";
        let ac = extract_acceptance_criteria(&Some(body.to_string()));
        assert!(ac.is_some());
        assert!(ac.unwrap().contains("Login form"));
    }

    #[test]
    fn test_extract_effort_from_labels() {
        assert_eq!(extract_effort_from_labels(&["size/s".to_string()]), Some("S".to_string()));
        assert_eq!(extract_effort_from_labels(&["medium".to_string()]), Some("M".to_string()));
        assert_eq!(extract_effort_from_labels(&["extra large".to_string()]), Some("XL".to_string()));
        assert_eq!(extract_effort_from_labels(&["bug".to_string()]), None);
    }

    #[test]
    fn test_estimate_priority_from_labels() {
        assert_eq!(estimate_priority_from_labels(&["critical".to_string()]), 10);
        assert_eq!(estimate_priority_from_labels(&["high priority".to_string()]), 30);
        assert_eq!(estimate_priority_from_labels(&["bug".to_string()]), 50);
    }

    #[test]
    fn test_filter_issues_by_label() {
        let issues = vec![
            make_issue(1, "Bug fix", None, vec!["bug"]),
            make_issue(2, "New feature", None, vec!["enhancement"]),
            make_issue(3, "Another bug", None, vec!["bug", "urgent"]),
        ];

        let mut options = IssueImportOptions::default();
        options.labels = Some(vec!["bug".to_string()]);

        let filtered = filter_issues(&issues, &options);
        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_labels_as_tags() {
        let issue = make_issue(1, "Test", None, vec!["bug", "frontend", "size/m"]);
        let options = IssueImportOptions::default();

        let story = issue_to_story(&issue, &options);

        // size/m should be filtered out as effort label
        assert!(story.tags.contains(&"bug".to_string()));
        assert!(story.tags.contains(&"frontend".to_string()));
        assert!(!story.tags.iter().any(|t| t.contains("size")));
        assert_eq!(story.effort, Some("M".to_string()));
    }
}
