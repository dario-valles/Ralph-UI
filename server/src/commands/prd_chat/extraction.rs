// PRD Chat content extraction - extract PRD content from chat messages

use crate::file_storage::chat_ops;
use crate::models::{ChatMessage, ExtractedPRDContent, MessageRole};
use crate::utils::as_path;
use regex::Regex;

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
    let user_story_pattern = Regex::new(
        r"(?i)as (?:a|an) ([^,]+),?\s*I want ([^,]+?)(?:,?\s*so that ([^\n.]+))?",
    )
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
    let verify_pattern = Regex::new(r"(?i)(?:verify|ensure|confirm|check) that\s+([^\n.]+)").unwrap();

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
