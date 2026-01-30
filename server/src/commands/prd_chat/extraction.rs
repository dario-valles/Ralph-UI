// PRD Chat content extraction - extract PRD content from chat messages

use crate::file_storage::chat_ops;
use crate::models::{ChatMessage, ExtractedPRDContent, MessageRole};
use crate::utils::as_path;
use regex::Regex;

// ============================================================================
// PRD Block Extraction (for auto-save)
// ============================================================================

/// Extract PRD markdown content from agent response.
///
/// Looks for PRD content in the following formats (in priority order):
/// 1. Content between `<prd>...</prd>` tags
/// 2. Content in ````prd ... ```` fenced code block
/// 3. Content in ````markdown ... ```` fenced code block that contains PRD-like headers
/// 4. Content starting with "# PRD" or "# Product Requirements Document" header
///
/// Returns the extracted content trimmed, or None if no PRD content found.
pub fn extract_prd_block(response: &str) -> Option<String> {
    // 1. Look for <prd>...</prd> tags
    if let Ok(re) = Regex::new(r"(?s)<prd>(.*?)</prd>") {
        if let Some(caps) = re.captures(response) {
            if let Some(m) = caps.get(1) {
                let content = m.as_str().trim();
                if !content.is_empty() {
                    log::debug!("Extracted PRD from <prd> tags ({} chars)", content.len());
                    return Some(content.to_string());
                }
            }
        }
    }

    // 2. Look for ```prd ... ``` fenced code block
    if let Ok(re) = Regex::new(r"(?s)```prd\s*(.*?)```") {
        if let Some(caps) = re.captures(response) {
            if let Some(m) = caps.get(1) {
                let content = m.as_str().trim();
                if !content.is_empty() {
                    log::debug!(
                        "Extracted PRD from ```prd code block ({} chars)",
                        content.len()
                    );
                    return Some(content.to_string());
                }
            }
        }
    }

    // 3. Look for ```markdown ... ``` that contains PRD-like headers
    if let Ok(re) = Regex::new(r"(?s)```markdown\s*(.*?)```") {
        for caps in re.captures_iter(response) {
            if let Some(m) = caps.get(1) {
                let content = m.as_str().trim();
                // Check if it looks like a PRD (has common PRD section headers)
                if looks_like_prd(content) {
                    log::debug!(
                        "Extracted PRD from ```markdown code block ({} chars)",
                        content.len()
                    );
                    return Some(content.to_string());
                }
            }
        }
    }

    // 4. Look for content starting with PRD headers
    // This handles cases where the agent writes PRD content directly without code blocks
    // We look for a PRD header and capture everything until end of string (greedy)
    // then validate the content looks like a PRD
    if let Ok(re) = Regex::new(r"(?s)(#\s*(?:PRD|Product Requirements Document)[^\n]*\n.+)") {
        if let Some(caps) = re.captures(response) {
            if let Some(m) = caps.get(1) {
                let content = m.as_str().trim();
                // Only use this if it's substantial:
                // - More than just a header (100+ chars)
                // - At least 5 non-empty lines (to avoid incomplete fragments)
                // - Looks like a PRD (has section indicators)
                let non_empty_line_count = content.lines().filter(|l| !l.trim().is_empty()).count();
                if content.len() > 100 && non_empty_line_count >= 5 && looks_like_prd(content) {
                    log::debug!(
                        "Extracted PRD from header-based content ({} chars, {} lines)",
                        content.len(),
                        non_empty_line_count
                    );
                    return Some(content.to_string());
                }
            }
        }
    }

    log::debug!("No PRD content found in response");
    None
}

/// Check if content looks like a PRD document.
/// Returns true if the content has common PRD section headers.
fn looks_like_prd(content: &str) -> bool {
    let lower = content.to_lowercase();
    let prd_indicators = [
        "## overview",
        "## problem",
        "## user stor",
        "## requirement",
        "## functional",
        "## acceptance",
        "## scope",
        "## goals",
        "## success",
        "## epic",
        "## features",
        "## background",
        "## objectives",
        "## out of scope",
        "### us-", // User story format
        "### ep-", // Epic format
    ];

    // Count how many PRD indicators are present
    let indicator_count = prd_indicators
        .iter()
        .filter(|&indicator| lower.contains(indicator))
        .count();

    // Consider it a PRD if it has at least 2 indicators
    indicator_count >= 2
}

// ============================================================================
// Extraction Commands
// ============================================================================

/// Extract content from chat for preview before export
pub async fn preview_prd_extraction(
    session_id: String,
    project_path: String,
) -> Result<ExtractedPRDContent, String> {
    let project_path_obj = as_path(&project_path);

    // Get all messages from file storage
    let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    // Extract content using improved algorithm
    Ok(extract_prd_content_advanced(&messages))
}

// ============================================================================
// Advanced Extraction Algorithm
// ============================================================================

pub fn extract_prd_content_advanced(messages: &[ChatMessage]) -> ExtractedPRDContent {
    let all_content: String = messages
        .iter()
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let user_content: String = messages
        .iter()
        .filter(|m| m.role == MessageRole::User)
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let assistant_content: String = messages
        .iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    ExtractedPRDContent {
        overview: extract_overview_advanced(&user_content, &assistant_content),
        user_stories: extract_user_stories(&all_content),
        functional_requirements: extract_functional_requirements(&all_content),
        non_functional_requirements: extract_non_functional_requirements(&all_content),
        technical_constraints: extract_technical_constraints(&all_content),
        success_metrics: extract_success_metrics(&all_content),
        tasks: extract_tasks_advanced(&all_content),
        acceptance_criteria: extract_acceptance_criteria(&all_content),
        out_of_scope: extract_out_of_scope(&all_content),
    }
}

fn extract_overview_advanced(user_content: &str, assistant_content: &str) -> String {
    // First, try to get the user's initial problem statement
    let first_user_statement = user_content
        .lines()
        .take(5)
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    // Then get any summary from the assistant
    let summary_patterns = [
        r"(?i)(?:summary|overview|problem statement|in summary)[:\s]+([^\n]{30,})",
        r"(?i)(?:you want to|you're looking to|the goal is)[:\s]*([^\n]{30,})",
    ];

    let mut assistant_summary = String::new();
    for pattern in summary_patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(cap) = re.captures(assistant_content) {
                if let Some(m) = cap.get(1) {
                    assistant_summary = m.as_str().trim().to_string();
                    break;
                }
            }
        }
    }

    if !assistant_summary.is_empty() {
        format!("{}\n\n{}", first_user_statement, assistant_summary)
    } else {
        first_user_statement
    }
}

pub fn extract_user_stories(content: &str) -> Vec<String> {
    let mut stories = vec![];

    // Pattern: "As a [user], I want [feature] so that [benefit]"
    let user_story_pattern =
        Regex::new(r"(?i)as (?:a|an) ([^,]+),?\s*I want ([^,]+?)(?:,?\s*so that ([^\n.]+))?")
            .unwrap();

    for cap in user_story_pattern.captures_iter(content) {
        let user = cap.get(1).map_or("", |m| m.as_str()).trim();
        let want = cap.get(2).map_or("", |m| m.as_str()).trim();
        let benefit = cap.get(3).map_or("", |m| m.as_str()).trim();

        if !benefit.is_empty() {
            stories.push(format!(
                "As a {}, I want {} so that {}",
                user, want, benefit
            ));
        } else {
            stories.push(format!("As a {}, I want {}", user, want));
        }
    }

    // Deduplicate
    stories.sort();
    stories.dedup();
    stories
}

pub fn extract_functional_requirements(content: &str) -> Vec<String> {
    let mut requirements = vec![];

    // Pattern: Lines containing requirement keywords
    let requirement_pattern = Regex::new(
        r"(?i)(?:^|\n)\s*[-*•]?\s*(?:the system |the app(?:lication)? |it |users? )?(?:must|shall|should|will|needs? to)\s+([^\n.]+[.\n])",
    )
    .unwrap();

    for cap in requirement_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let req = m.as_str().trim().trim_end_matches('.');
            if req.len() > 10 {
                // Skip very short matches
                requirements.push(req.to_string());
            }
        }
    }

    // Also look for numbered requirements
    let numbered_pattern = Regex::new(r"(?i)(?:^|\n)\s*\d+[.)]\s*([^\n]{15,})").unwrap();

    for cap in numbered_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let req = m.as_str().trim();
            // Check if it looks like a requirement
            if req.to_lowercase().contains("must")
                || req.to_lowercase().contains("shall")
                || req.to_lowercase().contains("should")
                || req.to_lowercase().contains("require")
            {
                requirements.push(req.trim_end_matches('.').to_string());
            }
        }
    }

    // Deduplicate and limit
    requirements.sort();
    requirements.dedup();
    requirements.truncate(20);
    requirements
}

pub fn extract_non_functional_requirements(content: &str) -> Vec<String> {
    let mut nfrs = vec![];

    let nfr_keywords = [
        "performance",
        "scalab",
        "secur",
        "reliab",
        "availab",
        "maintainab",
        "usab",
        "access",
        "latency",
        "throughput",
        "response time",
        "uptime",
        "backup",
        "compliance",
        "gdpr",
    ];

    for line in content.lines() {
        let lower = line.to_lowercase();
        if nfr_keywords.iter().any(|kw| lower.contains(kw)) {
            let trimmed = line
                .trim()
                .trim_start_matches(|c: char| {
                    c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')'
                })
                .trim();
            if trimmed.len() > 15 {
                nfrs.push(trimmed.to_string());
            }
        }
    }

    nfrs.sort();
    nfrs.dedup();
    nfrs.truncate(10);
    nfrs
}

pub fn extract_technical_constraints(content: &str) -> Vec<String> {
    let mut constraints = vec![];

    let constraint_keywords = [
        "constraint",
        "limitation",
        "must use",
        "required to use",
        "compatible with",
        "integrate with",
        "api",
        "endpoint",
        "database",
        "framework",
        "library",
        "version",
        "protocol",
    ];

    for line in content.lines() {
        let lower = line.to_lowercase();
        if constraint_keywords.iter().any(|kw| lower.contains(kw)) {
            let trimmed = line
                .trim()
                .trim_start_matches(|c: char| {
                    c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')'
                })
                .trim();
            if trimmed.len() > 10 {
                constraints.push(trimmed.to_string());
            }
        }
    }

    constraints.sort();
    constraints.dedup();
    constraints.truncate(10);
    constraints
}

pub fn extract_success_metrics(content: &str) -> Vec<String> {
    let mut metrics = vec![];

    let metric_keywords = [
        "metric", "measure", "kpi", "success", "goal", "target", "increase", "decrease", "reduce",
        "improve", "%", "percent",
    ];

    // Pattern for metrics with numbers
    let metric_pattern = Regex::new(
        r"(?i)(?:increase|decrease|reduce|improve|achieve|reach|target)[:\s]+[^\n]*\d+[^\n]*",
    )
    .unwrap();

    for cap in metric_pattern.find_iter(content) {
        let metric = cap.as_str().trim();
        if metric.len() > 10 {
            metrics.push(metric.to_string());
        }
    }

    // Also look for lines with metric keywords
    for line in content.lines() {
        let lower = line.to_lowercase();
        if metric_keywords.iter().any(|kw| lower.contains(kw)) {
            let trimmed = line
                .trim()
                .trim_start_matches(|c: char| {
                    c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')'
                })
                .trim();
            if trimmed.len() > 10 && !metrics.contains(&trimmed.to_string()) {
                metrics.push(trimmed.to_string());
            }
        }
    }

    metrics.truncate(10);
    metrics
}

pub fn extract_tasks_advanced(content: &str) -> Vec<String> {
    let mut tasks = vec![];

    // Pattern: Task-like sentences with action verbs
    let task_pattern = Regex::new(
        r"(?i)(?:^|\n)\s*[-*•]?\s*(?:\d+[.)]\s*)?(?:implement|create|build|add|update|fix|refactor|design|develop|integrate|write|test|deploy|configure|set up|remove|delete|modify)\s+([^\n]{10,})",
    )
    .unwrap();

    for cap in task_pattern.captures_iter(content) {
        if let Some(m) = cap.get(0) {
            let task = m
                .as_str()
                .trim()
                .trim_start_matches(|c: char| {
                    c == '-'
                        || c == '*'
                        || c == '•'
                        || c.is_ascii_digit()
                        || c == '.'
                        || c == ')'
                        || c.is_whitespace()
                })
                .trim();
            if task.len() > 10 {
                tasks.push(task.to_string());
            }
        }
    }

    // Look for numbered lists that might be tasks
    let numbered_task_pattern = Regex::new(r"(?:^|\n)\s*(\d+)[.)]\s+([^\n]{15,})").unwrap();

    for cap in numbered_task_pattern.captures_iter(content) {
        if let Some(m) = cap.get(2) {
            let task = m.as_str().trim();
            let lower = task.to_lowercase();
            // Check if it looks like a task
            if lower.starts_with("implement")
                || lower.starts_with("create")
                || lower.starts_with("build")
                || lower.starts_with("add")
                || lower.starts_with("update")
                || lower.starts_with("fix")
                || lower.starts_with("refactor")
                || lower.starts_with("design")
                || lower.contains("should")
                || lower.contains("need to")
            {
                if !tasks.contains(&task.to_string()) {
                    tasks.push(task.to_string());
                }
            }
        }
    }

    // Deduplicate and limit
    tasks.sort();
    tasks.dedup();
    tasks.truncate(15);
    tasks
}

pub fn extract_acceptance_criteria(content: &str) -> Vec<String> {
    let mut criteria = vec![];

    // Look for acceptance criteria section
    let ac_section_pattern =
        Regex::new(r"(?i)acceptance criteria[:\s]*\n((?:[-*•]?\s*[^\n]+\n?)+)").unwrap();

    if let Some(cap) = ac_section_pattern.captures(content) {
        if let Some(m) = cap.get(1) {
            for line in m.as_str().lines() {
                let trimmed = line
                    .trim()
                    .trim_start_matches(|c: char| {
                        c == '-'
                            || c == '*'
                            || c == '•'
                            || c.is_ascii_digit()
                            || c == '.'
                            || c == ')'
                            || c == '['
                            || c == ']'
                    })
                    .trim();
                if trimmed.len() > 5 {
                    criteria.push(trimmed.to_string());
                }
            }
        }
    }

    // Also look for "Given/When/Then" patterns
    let gwt_pattern = Regex::new(r"(?i)(given[^\n]+when[^\n]+then[^\n]+)").unwrap();

    for cap in gwt_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            criteria.push(m.as_str().trim().to_string());
        }
    }

    // Look for "verify that" or "ensure that" patterns
    let verify_pattern =
        Regex::new(r"(?i)(?:verify|ensure|confirm|check) that\s+([^\n.]+)").unwrap();

    for cap in verify_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let criterion = format!("Verify that {}", m.as_str().trim());
            if !criteria.contains(&criterion) {
                criteria.push(criterion);
            }
        }
    }

    criteria.truncate(15);
    criteria
}

pub fn extract_out_of_scope(content: &str) -> Vec<String> {
    let mut out_of_scope = vec![];

    // Look for out of scope section
    let oos_patterns = [
        r"(?i)(?:out of scope|not in scope|excluded|won't include|will not include)[:\s]*\n((?:[-*•]?\s*[^\n]+\n?)+)",
        r"(?i)(?:this (?:does not|doesn't|won't|will not) include)[:\s]*([^\n]+)",
    ];

    for pattern in oos_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for cap in re.captures_iter(content) {
                if let Some(m) = cap.get(1) {
                    for line in m.as_str().lines() {
                        let trimmed = line
                            .trim()
                            .trim_start_matches(|c: char| {
                                c == '-'
                                    || c == '*'
                                    || c == '•'
                                    || c.is_ascii_digit()
                                    || c == '.'
                                    || c == ')'
                            })
                            .trim();
                        if trimmed.len() > 5 && !out_of_scope.contains(&trimmed.to_string()) {
                            out_of_scope.push(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }

    out_of_scope.truncate(10);
    out_of_scope
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // extract_prd_block tests
    // =========================================================================

    #[test]
    fn test_extract_prd_block_with_prd_tags() {
        let response = r#"Here is the PRD I created:

<prd>
# PRD: User Authentication

## Overview
This document describes the authentication feature.

## Requirements
- Users should be able to log in
- Users should be able to log out
</prd>

Let me know if you need any changes!"#;

        let extracted = extract_prd_block(response);
        assert!(extracted.is_some());
        let content = extracted.unwrap();
        assert!(content.contains("# PRD: User Authentication"));
        assert!(content.contains("## Overview"));
        assert!(content.contains("## Requirements"));
    }

    #[test]
    fn test_extract_prd_block_with_prd_code_fence() {
        let response = r#"Here's the PRD:

```prd
# Product Requirements Document

## Overview
A new feature for the app.

## User Stories
- As a user, I want to...

## Acceptance Criteria
- Users can log in
```

That's the PRD!"#;

        let extracted = extract_prd_block(response);
        assert!(extracted.is_some());
        let content = extracted.unwrap();
        assert!(content.contains("# Product Requirements Document"));
        assert!(content.contains("## Overview"));
        assert!(content.contains("## User Stories"));
    }

    #[test]
    fn test_extract_prd_block_with_markdown_fence() {
        let response = r#"I've created the PRD:

```markdown
# PRD: Feature X

## Overview
This is a feature.

## Functional Requirements
- Requirement 1

## Acceptance Criteria
- Criterion 1
```

Let me know your thoughts!"#;

        let extracted = extract_prd_block(response);
        assert!(extracted.is_some());
        let content = extracted.unwrap();
        assert!(content.contains("# PRD: Feature X"));
        assert!(content.contains("## Functional Requirements"));
    }

    #[test]
    fn test_extract_prd_block_no_prd_content() {
        let response =
            "I'd be happy to help you create a PRD! What feature would you like to document?";
        let extracted = extract_prd_block(response);
        assert!(extracted.is_none());
    }

    #[test]
    fn test_extract_prd_block_empty_tags() {
        let response = "<prd></prd>";
        let extracted = extract_prd_block(response);
        assert!(extracted.is_none());
    }

    #[test]
    fn test_looks_like_prd_with_enough_indicators() {
        let content = r#"# PRD
## Overview
This is a test.
## Requirements
- Req 1
## Acceptance Criteria
- Criterion 1"#;

        assert!(looks_like_prd(content));
    }

    #[test]
    fn test_looks_like_prd_not_enough_indicators() {
        let content = "# Just a Title\nSome regular text without PRD sections.";
        assert!(!looks_like_prd(content));
    }

    // =========================================================================
    // Other extraction tests
    // =========================================================================

    #[test]
    fn test_extract_user_stories() {
        let content = "As a developer, I want to deploy my code quickly so that I can iterate faster. As an admin, I want to manage users.";
        let stories = extract_user_stories(content);

        assert!(stories.len() >= 2);
        assert!(stories.iter().any(|s| s.contains("developer")));
        assert!(stories.iter().any(|s| s.contains("admin")));
    }

    #[test]
    fn test_extract_functional_requirements() {
        let content = "The system must validate user input.\nUsers should be able to export data.\nThe app needs to support offline mode.";
        let reqs = extract_functional_requirements(content);

        assert!(reqs.len() >= 2);
    }

    #[test]
    fn test_extract_tasks_advanced() {
        let content = "1. Implement user authentication\n2. Create database schema\n3. Build the API endpoints\n4. Add unit tests";
        let tasks = extract_tasks_advanced(content);

        assert!(tasks.len() >= 3);
    }

    #[test]
    fn test_extract_acceptance_criteria() {
        let content = "Acceptance criteria:\n- Users can log in\n- Tasks are saved\nVerify that the system handles errors gracefully.";
        let criteria = extract_acceptance_criteria(content);

        assert!(criteria.len() >= 1);
    }

    #[test]
    fn test_extract_prd_content_advanced() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content:
                    "I need a user authentication system. As a user, I want to log in so that I can access my data."
                        .to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content:
                    "Summary: You want to build a secure authentication system.\n\nThe system must support OAuth2. Users should be able to reset passwords.\n\nTasks:\n1. Implement login endpoint\n2. Create session management\n3. Add password reset flow"
                        .to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        let extracted = extract_prd_content_advanced(&messages);

        // Should extract overview
        assert!(!extracted.overview.is_empty());

        // Should extract user stories
        assert!(!extracted.user_stories.is_empty());

        // Should extract requirements
        assert!(!extracted.functional_requirements.is_empty());

        // Should extract tasks
        assert!(!extracted.tasks.is_empty());
    }
}
