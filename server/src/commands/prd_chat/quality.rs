// PRD Chat quality assessment functions

use crate::file_storage::chat_ops;
use crate::models::{
    ChatMessage, DetailedQualityAssessment, EnhancedQualityCheck, EnhancedQualityReport,
    ExtractedPRDContent, GuidedQuestion, MessageRole, PRDType, QualityAssessment, QualityCheck,
    QualityCheckSeverity, QualityGrade, QuestionType, UnifiedQualityReport, VagueLanguageWarning,
};
use crate::utils::as_path;
use regex::Regex;
use std::sync::LazyLock;

/// Regex for detecting quantifiable metrics (used in quality checks)
static METRIC_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\d+\s*(ms|s|second|minute|hour|%|MB|GB|KB)").unwrap());

use super::extraction::extract_prd_content_advanced;

// ============================================================================
// Quality Assessment Commands
// ============================================================================

/// Assess the quality of a PRD chat session before export
/// Prioritizes the PRD plan file content if it exists, falls back to chat messages
pub async fn assess_prd_quality(
    session_id: String,
    project_path: String,
) -> Result<QualityAssessment, String> {
    let project_path_obj = as_path(&project_path);

    // Get session from file storage
    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Try to use PRD plan file content first if available
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        session.title.as_deref(),
        session.prd_id.as_deref(),
    );

    let assessment = if plan_path.exists() {
        // Use PRD plan file for quality assessment
        match std::fs::read_to_string(&plan_path) {
            Ok(content) => {
                log::info!("Assessing quality from PRD plan file: {:?}", plan_path);
                calculate_quality_from_markdown(&content, session.prd_type.as_deref())
            }
            Err(e) => {
                log::warn!(
                    "Failed to read PRD plan file, falling back to messages: {}",
                    e
                );
                // Fall back to messages
                let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
                    .map_err(|e| format!("Failed to get messages: {}", e))?;
                calculate_quality_assessment(&messages, session.prd_type.as_deref())
            }
        }
    } else {
        // No plan file yet, use messages
        let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        calculate_quality_assessment(&messages, session.prd_type.as_deref())
    };

    // Update session with quality score in file storage
    chat_ops::update_chat_session_quality_score(
        project_path_obj,
        &session_id,
        assessment.overall as i32,
    )
    .map_err(|e| format!("Failed to update quality score: {}", e))?;

    Ok(assessment)
}

/// Get guided questions based on PRD type
pub async fn get_guided_questions(prd_type: String) -> Result<Vec<GuidedQuestion>, String> {
    let prd_type = prd_type
        .parse::<PRDType>()
        .map_err(|e| format!("Invalid PRD type: {}", e))?;

    Ok(generate_guided_questions(prd_type))
}

// ============================================================================
// Quality Assessment Functions
// ============================================================================

pub fn calculate_quality_assessment(
    messages: &[ChatMessage],
    prd_type: Option<&str>,
) -> QualityAssessment {
    let extracted = extract_prd_content_advanced(messages);

    let mut missing_sections = vec![];
    let mut suggestions = vec![];

    // Calculate completeness score based on required sections
    let mut completeness_score = 0u8;

    if !extracted.overview.is_empty() && extracted.overview.len() > 50 {
        completeness_score += 15;
    } else {
        missing_sections.push("Problem Statement / Overview".to_string());
        suggestions.push("Describe the problem you're solving and why it matters".to_string());
    }

    if !extracted.user_stories.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("User Stories".to_string());
        suggestions.push(
            "Add user stories in the format: 'As a [user], I want [feature] so that [benefit]'"
                .to_string(),
        );
    }

    if !extracted.functional_requirements.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("Functional Requirements".to_string());
        suggestions.push(
            "List what the system must do using 'must', 'shall', or 'should' language".to_string(),
        );
    }

    if !extracted.tasks.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("Implementation Tasks".to_string());
        suggestions.push("Break down the feature into actionable implementation tasks".to_string());
    }

    if !extracted.acceptance_criteria.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("Acceptance Criteria".to_string());
        suggestions
            .push("Define clear acceptance criteria for when the feature is complete".to_string());
    }

    if !extracted.success_metrics.is_empty() {
        completeness_score += 10;
    } else {
        missing_sections.push("Success Metrics".to_string());
        suggestions.push("How will you measure if this feature is successful?".to_string());
    }

    if !extracted.technical_constraints.is_empty() {
        completeness_score += 8;
    }

    if !extracted.out_of_scope.is_empty() {
        completeness_score += 7;
    }

    // Calculate clarity score based on content quality
    let clarity_score = calculate_clarity_score(&extracted, messages);

    // Calculate actionability score
    let actionability_score = calculate_actionability_score(&extracted, prd_type);

    // Calculate overall score (weighted average)
    let overall = ((completeness_score as f32 * 0.4)
        + (clarity_score as f32 * 0.3)
        + (actionability_score as f32 * 0.3)) as u8;

    // Add PRD type-specific suggestions
    if let Some(prd_type_str) = prd_type {
        if let Ok(pt) = prd_type_str.parse::<PRDType>() {
            add_type_specific_suggestions(&mut suggestions, pt, &extracted);
        }
    }

    let ready_for_export = overall >= 60 && missing_sections.len() <= 2;

    QualityAssessment {
        completeness: completeness_score,
        clarity: clarity_score,
        actionability: actionability_score,
        overall,
        missing_sections,
        suggestions,
        ready_for_export,
    }
}

/// Check if content contains a numbered task list (e.g., "1. Implement X", "2. Create Y")
pub fn has_numbered_task_list(content: &str) -> bool {
    let task_verbs = [
        "implement",
        "create",
        "build",
        "add",
        "develop",
        "design",
        "configure",
        "set up",
        "integrate",
        "write",
        "test",
        "update",
        "remove",
        "refactor",
        "migrate",
    ];

    // Count numbered items that look like tasks
    let mut task_count = 0;
    for line in content.lines() {
        let trimmed = line.trim();
        // Check for numbered list items: "1.", "2)", "1:", etc.
        if trimmed.len() > 3 {
            let first_chars: String = trimmed.chars().take(4).collect();
            if first_chars
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
                && (first_chars.contains('.')
                    || first_chars.contains(')')
                    || first_chars.contains(':'))
            {
                // Check if it contains a task verb
                let lower_line = trimmed.to_lowercase();
                if task_verbs.iter().any(|v| lower_line.contains(v)) {
                    task_count += 1;
                }
            }
        }
    }

    // Consider it a task list if there are 3+ numbered task items
    task_count >= 3
}

/// Calculate quality assessment from PRD markdown file content
pub fn calculate_quality_from_markdown(content: &str, prd_type: Option<&str>) -> QualityAssessment {
    let content_lower = content.to_lowercase();
    let mut missing_sections = vec![];
    let mut suggestions = vec![];
    let mut completeness_score = 0u8;

    // Check for key PRD sections in the markdown
    // Overview / Problem Statement / Executive Summary
    if content_lower.contains("## overview")
        || content_lower.contains("## problem")
        || content_lower.contains("## executive summary")
        || content_lower.contains("# overview")
        || content_lower.contains("### product vision")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("Problem Statement / Overview".to_string());
        suggestions.push("Add an Overview or Problem Statement section".to_string());
    }

    // User Stories
    if content_lower.contains("user stor")
        || content_lower.contains("as a ")
        || content_lower.contains("## stories")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("User Stories".to_string());
        suggestions.push(
            "Add user stories in the format: 'As a [user], I want [feature] so that [benefit]'"
                .to_string(),
        );
    }

    // Requirements (functional/technical)
    if content_lower.contains("requirement")
        || content_lower.contains("## features")
        || content_lower.contains("### features")
        || content_lower.contains("## functionality")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("Functional Requirements".to_string());
        suggestions
            .push("List what the system must do using clear requirement language".to_string());
    }

    // Tasks / Implementation - Check for various common patterns
    let has_tasks = content_lower.contains("## task")
        || content_lower.contains("# task")
        || content_lower.contains("### task")
        || content_lower.contains("## implementation")
        || content_lower.contains("# implementation")
        || content_lower.contains("### implementation")
        || content_lower.contains("## phases")
        || content_lower.contains("## phase ")
        || content_lower.contains("# phase ")
        || content_lower.contains("## checklist")
        || content_lower.contains("## master checklist")
        || content_lower.contains("## development")
        || content_lower.contains("## action item")
        || content_lower.contains("## todo")
        || content_lower.contains("## to-do")
        || content_lower.contains("## work breakdown")
        // Also check for numbered phase/task/step headers (common LLM format)
        || Regex::new(r"(?m)^#{1,3}\s*(?:phase\s*\d|task\s*\d|step\s*\d)")
            .map(|r| r.is_match(&content_lower))
            .unwrap_or(false)
        // Check for substantial numbered lists with action verbs
        || has_numbered_task_list(&content_lower);

    if has_tasks {
        completeness_score += 15;
    } else {
        missing_sections.push("Implementation Tasks".to_string());
        suggestions.push("Break down the feature into actionable implementation tasks".to_string());
    }

    // Acceptance Criteria
    if content_lower.contains("acceptance")
        || content_lower.contains("## criteria")
        || content_lower.contains("definition of done")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("Acceptance Criteria".to_string());
        suggestions
            .push("Define clear acceptance criteria for when the feature is complete".to_string());
    }

    // Success Metrics
    if content_lower.contains("metric")
        || content_lower.contains("success")
        || content_lower.contains("kpi")
        || content_lower.contains("measure")
    {
        completeness_score += 10;
    } else {
        missing_sections.push("Success Metrics".to_string());
        suggestions.push("How will you measure if this feature is successful?".to_string());
    }

    // Technical constraints / considerations
    if content_lower.contains("technical")
        || content_lower.contains("constraint")
        || content_lower.contains("technology")
        || content_lower.contains("architecture")
    {
        completeness_score += 8;
    }

    // Out of scope
    if content_lower.contains("out of scope")
        || content_lower.contains("non-goal")
        || content_lower.contains("not included")
        || content_lower.contains("scope")
    {
        completeness_score += 7;
    }

    // Calculate clarity score based on markdown structure
    let clarity_score = calculate_clarity_from_markdown(content);

    // Calculate actionability score based on content
    let actionability_score = calculate_actionability_from_markdown(content, prd_type);

    // Calculate overall score (weighted average)
    let overall = ((completeness_score as f32 * 0.4)
        + (clarity_score as f32 * 0.3)
        + (actionability_score as f32 * 0.3)) as u8;

    // Add PRD type-specific suggestions
    if let Some(prd_type_str) = prd_type {
        if let Ok(pt) = prd_type_str.parse::<PRDType>() {
            // Reuse type-specific suggestions logic with empty extracted content
            let extracted = ExtractedPRDContent {
                overview: String::new(),
                user_stories: vec![],
                functional_requirements: vec![],
                non_functional_requirements: vec![],
                technical_constraints: vec![],
                acceptance_criteria: vec![],
                tasks: vec![],
                success_metrics: vec![],
                out_of_scope: vec![],
            };
            add_type_specific_suggestions(&mut suggestions, pt, &extracted);
        }
    }

    let ready_for_export = overall >= 60 && missing_sections.len() <= 2;

    QualityAssessment {
        completeness: completeness_score,
        clarity: clarity_score,
        actionability: actionability_score,
        overall,
        missing_sections,
        suggestions,
        ready_for_export,
    }
}

/// Calculate clarity score from markdown content
fn calculate_clarity_from_markdown(content: &str) -> u8 {
    let mut score = 50u8;

    // Bonus for having headers (well-structured)
    let header_count = content.matches("\n#").count() + content.matches("\n##").count();
    if header_count >= 3 {
        score = score.saturating_add(15);
    } else if header_count >= 1 {
        score = score.saturating_add(5);
    }

    // Bonus for having lists (organized)
    let list_count = content.matches("\n- ").count() + content.matches("\n* ").count();
    if list_count >= 5 {
        score = score.saturating_add(10);
    }

    // Bonus for code blocks (technical detail)
    if content.contains("```") {
        score = score.saturating_add(5);
    }

    // Bonus for tables (structured data)
    if content.contains("|--") || content.contains("| -") {
        score = score.saturating_add(10);
    }

    // Penalize if too short
    if content.len() < 500 {
        score = score.saturating_sub(20);
    } else if content.len() > 2000 {
        score = score.saturating_add(10);
    }

    // Bonus for requirement language
    let action_verb_pattern = Regex::new(r"(?i)\b(must|shall|should|will|can|may)\b").unwrap();
    let action_count = action_verb_pattern.find_iter(content).count();
    if action_count > 5 {
        score = score.saturating_add(10);
    }

    score.min(100)
}

/// Calculate actionability score from markdown content
fn calculate_actionability_from_markdown(content: &str, prd_type: Option<&str>) -> u8 {
    let mut score = 40u8;
    let content_lower = content.to_lowercase();

    // Bonus for numbered lists (actionable steps)
    let numbered_pattern = Regex::new(r"\n\d+\.").unwrap();
    let numbered_count = numbered_pattern.find_iter(content).count();
    if numbered_count >= 3 {
        score = score.saturating_add(15);
    }

    // Bonus for task-like language
    let task_patterns = [
        "implement",
        "create",
        "build",
        "design",
        "test",
        "deploy",
        "configure",
        "add",
        "remove",
        "update",
    ];
    let task_count: usize = task_patterns
        .iter()
        .map(|p| content_lower.matches(p).count())
        .sum();
    if task_count >= 5 {
        score = score.saturating_add(15);
    }

    // Bonus for priority/phase indicators
    if content_lower.contains("priority")
        || content_lower.contains("phase")
        || content_lower.contains("milestone")
    {
        score = score.saturating_add(10);
    }

    // Bonus for time estimates
    if content_lower.contains("hour")
        || content_lower.contains("day")
        || content_lower.contains("week")
        || content_lower.contains("sprint")
    {
        score = score.saturating_add(10);
    }

    // Type-specific bonuses
    if let Some(pt) = prd_type {
        match pt {
            "new_feature" => {
                if content_lower.contains("mvp") || content_lower.contains("minimum viable") {
                    score = score.saturating_add(10);
                }
            }
            "bug_fix" => {
                if content_lower.contains("root cause") || content_lower.contains("reproduce") {
                    score = score.saturating_add(10);
                }
            }
            "refactor" => {
                if content_lower.contains("before") && content_lower.contains("after") {
                    score = score.saturating_add(10);
                }
            }
            "integration" => {
                if content_lower.contains("api") || content_lower.contains("endpoint") {
                    score = score.saturating_add(10);
                }
            }
            _ => {}
        }
    }

    score.min(100)
}

fn calculate_clarity_score(extracted: &ExtractedPRDContent, messages: &[ChatMessage]) -> u8 {
    let mut score = 50u8; // Base score

    // Penalize if overview is too short
    if extracted.overview.len() < 100 {
        score = score.saturating_sub(15);
    } else if extracted.overview.len() > 200 {
        score = score.saturating_add(10);
    }

    // Bonus for well-formatted requirements (contain action verbs)
    let action_verb_pattern = Regex::new(r"(?i)\b(must|shall|should|will|can|may)\b").unwrap();
    let reqs_with_action = extracted
        .functional_requirements
        .iter()
        .filter(|r| action_verb_pattern.is_match(r))
        .count();
    if reqs_with_action > 0 {
        score = score.saturating_add((reqs_with_action * 5).min(20) as u8);
    }

    // Bonus for having numbered or bulleted tasks
    let task_count = extracted.tasks.len();
    if (3..=15).contains(&task_count) {
        score = score.saturating_add(15);
    } else if task_count > 15 {
        score = score.saturating_add(10); // Slightly penalize too many tasks
    }

    // Check for contradictions or confusion (multiple "?" in assistant messages)
    let confusion_count = messages
        .iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .filter(|m| m.content.matches('?').count() > 3)
        .count();
    if confusion_count > 2 {
        score = score.saturating_sub(10);
    }

    score.min(100)
}

fn calculate_actionability_score(extracted: &ExtractedPRDContent, prd_type: Option<&str>) -> u8 {
    let mut score = 40u8; // Base score

    // Bonus for having tasks
    let task_count = extracted.tasks.len();
    score = score.saturating_add((task_count * 5).min(25) as u8);

    // Bonus for acceptance criteria
    let ac_count = extracted.acceptance_criteria.len();
    score = score.saturating_add((ac_count * 5).min(20) as u8);

    // Bonus for having out-of-scope items (shows bounded scope)
    if !extracted.out_of_scope.is_empty() {
        score = score.saturating_add(10);
    }

    // PRD type-specific adjustments
    if let Some(prd_type_str) = prd_type {
        if let Ok(pt) = prd_type_str.parse::<PRDType>() {
            match pt {
                PRDType::BugFix => {
                    // Bug fixes should have clear reproduction steps
                    if extracted.overview.to_lowercase().contains("reproduce")
                        || extracted.overview.to_lowercase().contains("steps")
                    {
                        score = score.saturating_add(10);
                    }
                }
                PRDType::ApiIntegration => {
                    // API integrations should mention endpoints or data formats
                    if extracted.technical_constraints.iter().any(|c| {
                        c.to_lowercase().contains("endpoint")
                            || c.to_lowercase().contains("api")
                            || c.to_lowercase().contains("json")
                    }) {
                        score = score.saturating_add(10);
                    }
                }
                _ => {}
            }
        }
    }

    score.min(100)
}

fn add_type_specific_suggestions(
    suggestions: &mut Vec<String>,
    prd_type: PRDType,
    extracted: &ExtractedPRDContent,
) {
    match prd_type {
        PRDType::BugFix => {
            if !extracted.overview.to_lowercase().contains("reproduce") {
                suggestions.push("Include steps to reproduce the bug".to_string());
            }
            if !extracted.overview.to_lowercase().contains("expected") {
                suggestions.push("Describe expected vs actual behavior".to_string());
            }
        }
        PRDType::NewFeature => {
            if extracted.user_stories.is_empty() {
                suggestions.push("Add user stories to clarify who benefits and how".to_string());
            }
        }
        PRDType::ApiIntegration => {
            if !extracted
                .technical_constraints
                .iter()
                .any(|c| c.to_lowercase().contains("endpoint"))
            {
                suggestions.push("Document the API endpoints that will be used".to_string());
            }
            if !extracted
                .technical_constraints
                .iter()
                .any(|c| c.to_lowercase().contains("auth"))
            {
                suggestions.push("Describe the authentication requirements".to_string());
            }
        }
        PRDType::Refactoring => {
            if !extracted
                .out_of_scope
                .iter()
                .any(|s| s.to_lowercase().contains("behavior"))
            {
                suggestions.push("Clarify that existing behavior should not change".to_string());
            }
        }
        PRDType::General => {}
        PRDType::FullNewApp => {
            if !extracted.overview.to_lowercase().contains("persona")
                && !extracted.overview.to_lowercase().contains("user")
            {
                suggestions.push("Add user personas to clarify target audience".to_string());
            }
            if !extracted.overview.to_lowercase().contains("mvp")
                && !extracted.overview.to_lowercase().contains("minimum viable")
            {
                suggestions.push("Define MVP scope to focus initial development".to_string());
            }
            if !extracted.technical_constraints.iter().any(|c| {
                c.to_lowercase().contains("stack") || c.to_lowercase().contains("framework")
            }) {
                suggestions.push("Document technology stack choices".to_string());
            }
            if !extracted
                .technical_constraints
                .iter()
                .any(|c| c.to_lowercase().contains("deploy") || c.to_lowercase().contains("host"))
            {
                suggestions.push("Include deployment and hosting strategy".to_string());
            }
        }
    }
}

// ============================================================================
// Specific Quality Validation Checks
// ============================================================================

/// Vague terms that should be replaced with specific, measurable criteria
const VAGUE_TERMS: &[(&str, &str)] = &[
    (
        "fast",
        "Specify exact timing (e.g., '< 200ms response time')",
    ),
    ("slow", "Specify exact timing (e.g., '> 3 seconds')"),
    ("easy", "Define specific steps or clicks required"),
    ("simple", "Describe the exact user flow or interface"),
    (
        "secure",
        "Specify security standards (e.g., 'AES-256 encryption', 'OAuth 2.0')",
    ),
    ("good", "Define measurable quality criteria"),
    ("better", "Specify the metric and target improvement"),
    (
        "user-friendly",
        "Define specific usability criteria (e.g., 'fewer than 3 clicks')",
    ),
    (
        "scalable",
        "Specify scale targets (e.g., '10,000 concurrent users')",
    ),
    (
        "robust",
        "Define specific reliability metrics (e.g., '99.9% uptime')",
    ),
    ("efficient", "Specify performance metrics or resource usage"),
    ("flexible", "List specific configuration options required"),
    ("modern", "Specify exact technologies or design patterns"),
    ("intuitive", "Define expected user flows and learning curve"),
    (
        "seamless",
        "Specify integration requirements or error handling",
    ),
];

/// Weak requirement verbs that indicate non-testable requirements
const WEAK_REQUIREMENT_PATTERNS: &[(&str, &str)] = &[
    (
        r"\bshould try\b",
        "Replace 'should try' with 'must' or 'shall'",
    ),
    (
        r"\bwould be nice\b",
        "Convert to a concrete requirement with 'must' or remove",
    ),
    (
        r"\bmight\b",
        "Replace 'might' with definitive 'must' or 'shall'",
    ),
    (
        r"\bcould potentially\b",
        "Replace with 'must' and specific conditions",
    ),
    (
        r"\bpossibly\b",
        "Remove ambiguity - either require it or don't",
    ),
    (
        r"\bmaybe\b",
        "Remove ambiguity - either require it or don't",
    ),
    (
        r"\bprobably\b",
        "Remove ambiguity - specify the actual requirement",
    ),
    (r"\bsomehow\b", "Specify the exact mechanism or approach"),
    (r"\betc\.?\b", "Replace 'etc.' with complete list of items"),
    (r"\band so on\b", "Replace with complete list of items"),
    (
        r"\bas needed\b",
        "Specify exact conditions when something is needed",
    ),
    (
        r"\bif possible\b",
        "Either require it or make it explicitly optional",
    ),
];

/// Perform specific quality checks on PRD content
/// Returns a list of specific issues found
pub fn validate_prd_quality_checks(content: &str, prd_type: Option<&str>) -> Vec<QualityCheck> {
    let mut checks = Vec::new();
    let content_lower = content.to_lowercase();

    // 1. Vague Language Detection
    checks.extend(check_vague_language(content));

    // 2. Non-Testable Requirements Detection
    checks.extend(check_non_testable_requirements(content));

    // 3. Missing Quantifiable Metrics
    checks.extend(check_missing_metrics(content, &content_lower));

    // 4. Acceptance Criteria Validation (per user story)
    checks.extend(check_acceptance_criteria(content, &content_lower));

    // 5. SMART Goal Validation
    checks.extend(check_smart_goals(content, &content_lower));

    // 6. PRD Type-Specific Checks
    if let Some(pt) = prd_type {
        checks.extend(check_type_specific_issues(content, &content_lower, pt));
    }

    checks
}

/// Check for vague language that should be replaced with specific criteria
fn check_vague_language(content: &str) -> Vec<QualityCheck> {
    let mut checks = Vec::new();

    for (term, suggestion) in VAGUE_TERMS {
        let term_lower = term.to_lowercase();
        // Use word boundary matching to avoid false positives
        let pattern = format!(r"\b{}\b", regex::escape(&term_lower));
        if let Ok(re) = Regex::new(&pattern) {
            for mat in re.find_iter(&content.to_lowercase()) {
                // Find the line containing this match
                let line_start = content[..mat.start()]
                    .rfind('\n')
                    .map(|i| i + 1)
                    .unwrap_or(0);
                let line_end = content[mat.end()..]
                    .find('\n')
                    .map(|i| mat.end() + i)
                    .unwrap_or(content.len());
                let line = content[line_start..line_end].trim();

                checks.push(QualityCheck {
                    id: "vague-language".to_string(),
                    name: "Vague Language Detected".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: format!("Found vague term '{}'", term),
                    location: Some(format!(
                        "Line containing: \"{}...\"",
                        truncate_str(line, 60)
                    )),
                    matched_text: Some(term.to_string()),
                    suggestion: Some(suggestion.to_string()),
                });
            }
        }
    }

    checks
}

/// Check for non-testable requirements using weak language
fn check_non_testable_requirements(content: &str) -> Vec<QualityCheck> {
    let mut checks = Vec::new();

    for (pattern, suggestion) in WEAK_REQUIREMENT_PATTERNS {
        if let Ok(re) = Regex::new(&format!("(?i){}", pattern)) {
            for mat in re.find_iter(content) {
                let matched = mat.as_str();
                let line_start = content[..mat.start()]
                    .rfind('\n')
                    .map(|i| i + 1)
                    .unwrap_or(0);
                let line_end = content[mat.end()..]
                    .find('\n')
                    .map(|i| mat.end() + i)
                    .unwrap_or(content.len());
                let line = content[line_start..line_end].trim();

                checks.push(QualityCheck {
                    id: "non-testable-requirement".to_string(),
                    name: "Non-Testable Requirement".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: format!("Weak requirement language: '{}'", matched),
                    location: Some(format!("Line: \"{}...\"", truncate_str(line, 60))),
                    matched_text: Some(matched.to_string()),
                    suggestion: Some(suggestion.to_string()),
                });
            }
        }
    }

    checks
}

/// Check for missing quantifiable metrics in requirements
fn check_missing_metrics(content: &str, content_lower: &str) -> Vec<QualityCheck> {
    let mut checks = Vec::new();

    // Check for performance requirements without numbers
    let perf_keywords = [
        "performance",
        "response time",
        "latency",
        "throughput",
        "load time",
    ];
    for keyword in perf_keywords {
        if content_lower.contains(keyword) {
            // Check if there's a number nearby (within 100 chars after the keyword)
            if let Some(pos) = content_lower.find(keyword) {
                let search_area = &content[pos..std::cmp::min(pos + 150, content.len())];
                let has_number = METRIC_REGEX.is_match(search_area);

                if !has_number {
                    checks.push(QualityCheck {
                        id: "missing-metric".to_string(),
                        name: "Missing Performance Metric".to_string(),
                        severity: QualityCheckSeverity::Warning,
                        message: format!(
                            "Performance requirement '{}' lacks quantifiable metric",
                            keyword
                        ),
                        location: Some(format!("Near '{}'", keyword)),
                        matched_text: Some(keyword.to_string()),
                        suggestion: Some(
                            "Add specific numbers (e.g., '< 200ms', '99.9% uptime')".to_string(),
                        ),
                    });
                }
            }
        }
    }

    // Check for scalability mentions without numbers
    // Note: "scalable" does NOT contain "scale" as substring (s-c-a-l-a-b-l-e vs s-c-a-l-e)
    // So we check for "scal" which matches both "scale" and "scalable"
    if content_lower.contains("scal") || content_lower.contains("concurrent") {
        // Match patterns like "1000 users", "1000 concurrent users", "10k requests/second"
        let has_scale_number =
            Regex::new(r"\d+[k]?\s*(?:concurrent\s+)?(?:users|requests|connections|rps|qps)")
                .map(|re| re.is_match(content_lower))
                .unwrap_or(false);

        if !has_scale_number && !content_lower.contains("not applicable") {
            checks.push(QualityCheck {
                id: "missing-scale-target".to_string(),
                name: "Missing Scale Target".to_string(),
                severity: QualityCheckSeverity::Info,
                message: "Scalability mentioned without specific targets".to_string(),
                location: None,
                matched_text: None,
                suggestion: Some(
                    "Specify scale targets (e.g., '1000 concurrent users', '10k requests/second')"
                        .to_string(),
                ),
            });
        }
    }

    checks
}

/// Check for user stories missing acceptance criteria
fn check_acceptance_criteria(content: &str, _content_lower: &str) -> Vec<QualityCheck> {
    let mut checks = Vec::new();

    // Find user story patterns
    let story_pattern = Regex::new(r"(?i)(as a|user story|US-\d+)").unwrap();
    let ac_pattern =
        Regex::new(r"(?i)(acceptance criteria|given\s+.+\s+when\s+.+\s+then|AC:|criteria:)")
            .unwrap();

    // Count user stories and acceptance criteria sections
    let story_count = story_pattern.find_iter(content).count();
    let ac_count = ac_pattern.find_iter(content).count();

    // If there are stories but significantly fewer AC sections, flag it
    if story_count > 0 && ac_count < story_count / 2 {
        checks.push(QualityCheck {
            id: "missing-acceptance-criteria".to_string(),
            name: "Missing Acceptance Criteria".to_string(),
            severity: QualityCheckSeverity::Warning,
            message: format!(
                "Found {} user stories but only {} acceptance criteria sections",
                story_count, ac_count
            ),
            location: None,
            matched_text: None,
            suggestion: Some(
                "Each user story should have specific, testable acceptance criteria".to_string(),
            ),
        });
    }

    // Check for user stories without the standard format
    let proper_story_format = Regex::new(r"(?i)as a .+,?\s+I want .+,?\s+so that").unwrap();
    let informal_story = Regex::new(r"(?i)user story|US-\d+").unwrap();

    let proper_count = proper_story_format.find_iter(content).count();
    let informal_count = informal_story.find_iter(content).count();

    if informal_count > 0 && proper_count < informal_count {
        checks.push(QualityCheck {
            id: "informal-user-story".to_string(),
            name: "Informal User Story Format".to_string(),
            severity: QualityCheckSeverity::Info,
            message: "Some user stories don't follow the standard format".to_string(),
            location: None,
            matched_text: None,
            suggestion: Some(
                "Use: 'As a [user type], I want [action], so that [benefit]'".to_string(),
            ),
        });
    }

    checks
}

/// Check for SMART goal compliance (Specific, Measurable, Achievable, Relevant, Time-bound)
fn check_smart_goals(content: &str, content_lower: &str) -> Vec<QualityCheck> {
    let mut checks = Vec::new();

    // Check for success metrics / goals section
    let has_metrics_section = content_lower.contains("success metric")
        || content_lower.contains("success criteria")
        || content_lower.contains("kpi")
        || content_lower.contains("goal");

    if has_metrics_section {
        // Check for time-bound language
        // Use regex to match timeframe patterns with word boundaries to avoid false positives
        // like "by 15%" being matched as a timeframe
        let timeframe_patterns = [
            r"\bwithin\b",
            r"\bdeadline\b",
            r"\bsprint\b",
            r"\bweek[s]?\b",
            r"\bmonth[s]?\b",
            r"\bquarter\b",
            r"\bphase\b",
            r"\bmilestone\b",
            r"\bby\s+(?:end|q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|the)",
            r"\bby\s+\d{4}\b", // "by 2024"
        ];
        let has_timeframe = timeframe_patterns.iter().any(|pattern| {
            Regex::new(&format!("(?i){}", pattern))
                .map(|re| re.is_match(content_lower))
                .unwrap_or(false)
        });

        if !has_timeframe {
            checks.push(QualityCheck {
                id: "missing-timeframe".to_string(),
                name: "Missing Timeframe".to_string(),
                severity: QualityCheckSeverity::Info,
                message: "Goals/success criteria lack time-bound elements".to_string(),
                location: None,
                matched_text: None,
                suggestion: Some(
                    "Add timeframes (e.g., 'by end of Sprint 3', 'within 2 weeks of launch')"
                        .to_string(),
                ),
            });
        }

        // Check for measurable language
        let measurement_patterns = [
            "%",
            "increase",
            "decrease",
            "reduce",
            "improve by",
            "target",
        ];
        let has_measurement = measurement_patterns
            .iter()
            .any(|p| content_lower.contains(p))
            || Regex::new(r"\d+")
                .map(|re| re.is_match(content))
                .unwrap_or(false);

        if !has_measurement {
            checks.push(QualityCheck {
                id: "non-measurable-goal".to_string(),
                name: "Non-Measurable Goal".to_string(),
                severity: QualityCheckSeverity::Warning,
                message: "Success criteria lack measurable targets".to_string(),
                location: None,
                matched_text: None,
                suggestion: Some(
                    "Add specific numbers (e.g., 'increase by 20%', 'reduce to < 5%')".to_string(),
                ),
            });
        }
    }

    checks
}

/// PRD type-specific validation checks
fn check_type_specific_issues(
    _content: &str,
    content_lower: &str,
    prd_type: &str,
) -> Vec<QualityCheck> {
    let mut checks = Vec::new();

    match prd_type {
        "bug_fix" => {
            // Bug fixes should have reproduction steps
            if !content_lower.contains("reproduce")
                && !content_lower.contains("steps to")
                && !content_lower.contains("reproduction")
            {
                checks.push(QualityCheck {
                    id: "missing-repro-steps".to_string(),
                    name: "Missing Reproduction Steps".to_string(),
                    severity: QualityCheckSeverity::Error,
                    message: "Bug fix PRD should include steps to reproduce".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "Add numbered steps to reproduce the bug consistently".to_string(),
                    ),
                });
            }

            // Should have expected vs actual behavior
            if !content_lower.contains("expected") || !content_lower.contains("actual") {
                checks.push(QualityCheck {
                    id: "missing-expected-actual".to_string(),
                    name: "Missing Expected/Actual Behavior".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: "Bug fix should describe expected vs actual behavior".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "Add 'Expected Behavior' and 'Actual Behavior' sections".to_string(),
                    ),
                });
            }
        }
        "api_integration" => {
            // API integrations should document endpoints
            if !content_lower.contains("endpoint") && !content_lower.contains("api ") {
                checks.push(QualityCheck {
                    id: "missing-api-details".to_string(),
                    name: "Missing API Details".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: "API integration PRD should document endpoints".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "List API endpoints, methods, and expected request/response formats"
                            .to_string(),
                    ),
                });
            }

            // Should mention authentication
            if !content_lower.contains("auth") && !content_lower.contains("token") {
                checks.push(QualityCheck {
                    id: "missing-auth-details".to_string(),
                    name: "Missing Authentication Details".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: "API integration should document authentication method".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "Specify authentication method (OAuth, API key, JWT, etc.)".to_string(),
                    ),
                });
            }

            // Should mention error handling
            if !content_lower.contains("error")
                && !content_lower.contains("failure")
                && !content_lower.contains("retry")
            {
                checks.push(QualityCheck {
                    id: "missing-error-handling".to_string(),
                    name: "Missing Error Handling".to_string(),
                    severity: QualityCheckSeverity::Info,
                    message: "Consider documenting error handling strategy".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "Document retry logic, timeout handling, and error responses".to_string(),
                    ),
                });
            }
        }
        "refactoring" => {
            // Refactoring should explicitly state behavior preservation
            if !content_lower.contains("behavior")
                && !content_lower.contains("functionality")
                && !content_lower.contains("unchanged")
            {
                checks.push(QualityCheck {
                    id: "unclear-behavior-change".to_string(),
                    name: "Unclear Behavior Change Policy".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: "Refactoring PRD should clarify if behavior will change".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "State explicitly: 'Existing behavior must remain unchanged' or list allowed changes".to_string(),
                    ),
                });
            }

            // Should mention testing strategy
            if !content_lower.contains("test") {
                checks.push(QualityCheck {
                    id: "missing-test-strategy".to_string(),
                    name: "Missing Test Strategy".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: "Refactoring should document testing strategy".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "Describe how to verify the refactoring doesn't break existing functionality"
                            .to_string(),
                    ),
                });
            }
        }
        "full_new_app" | "new_feature" => {
            // New apps/features should have MVP scope
            if !content_lower.contains("mvp")
                && !content_lower.contains("minimum viable")
                && !content_lower.contains("phase 1")
                && !content_lower.contains("v1")
            {
                checks.push(QualityCheck {
                    id: "missing-mvp-scope".to_string(),
                    name: "Missing MVP Scope".to_string(),
                    severity: QualityCheckSeverity::Info,
                    message: "Consider defining MVP scope to focus initial development".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some("Define what's in MVP vs future phases".to_string()),
                });
            }

            // Full new app should have tech stack
            if prd_type == "full_new_app"
                && !content_lower.contains("stack")
                && !content_lower.contains("framework")
                && !content_lower.contains("technology")
            {
                checks.push(QualityCheck {
                    id: "missing-tech-stack".to_string(),
                    name: "Missing Technology Stack".to_string(),
                    severity: QualityCheckSeverity::Warning,
                    message: "Full app PRD should document technology choices".to_string(),
                    location: None,
                    matched_text: None,
                    suggestion: Some(
                        "List frontend framework, backend language, database, etc.".to_string(),
                    ),
                });
            }
        }
        _ => {}
    }

    checks
}

/// Helper to truncate a string for display
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

// ============================================================================
// Enhanced 13-Check Quality Validation System
// ============================================================================

/// Extended vague terms with specific replacement suggestions
/// Vague language patterns with replacement suggestions
const ENHANCED_VAGUE_TERMS: &[(&str, &str)] = &[
    ("fast", "Specify response time (e.g., '< 200ms p95')"),
    ("quick", "Specify response time (e.g., '< 200ms p95')"),
    ("slow", "Specify timing threshold (e.g., '> 3 seconds')"),
    (
        "easy",
        "Define specific steps or clicks (e.g., 'complete in < 3 clicks')",
    ),
    ("simple", "Describe the exact user flow or interface"),
    (
        "user-friendly",
        "Define UX criteria (e.g., 'fewer than 3 clicks', 'time to completion < 30s')",
    ),
    (
        "secure",
        "Specify security controls (e.g., 'bcrypt cost 12', 'TLS 1.3', 'AES-256')",
    ),
    (
        "safe",
        "Specify security controls (e.g., 'bcrypt cost 12', 'TLS 1.3')",
    ),
    (
        "scalable",
        "Define scale targets (e.g., '10k concurrent users', '1M requests/day')",
    ),
    ("flexible", "List specific configuration options required"),
    (
        "performant",
        "Specify throughput/latency targets (e.g., '1000 RPS', '< 100ms p99')",
    ),
    (
        "efficient",
        "Specify performance metrics or resource usage (e.g., '< 100MB memory')",
    ),
    ("good", "Define measurable quality criteria"),
    (
        "better",
        "Quantify improvement (e.g., 'reduce by 50%', 'increase to 99.9%')",
    ),
    ("improved", "Quantify improvement with baseline and target"),
    (
        "robust",
        "Define reliability metrics (e.g., '99.9% uptime', 'auto-retry 3x')",
    ),
    ("modern", "Specify exact technologies or design patterns"),
    ("intuitive", "Define expected user flows and learning curve"),
    (
        "seamless",
        "Specify integration requirements or error handling",
    ),
];

/// Detect all vague language in content and return warnings
/// Detect vague language in PRD content
pub fn detect_vague_language(content: &str) -> Vec<VagueLanguageWarning> {
    let mut warnings = Vec::new();
    let content_lower = content.to_lowercase();

    for (term, suggestion) in ENHANCED_VAGUE_TERMS {
        let term_lower = term.to_lowercase();
        let pattern = format!(r"\b{}\b", regex::escape(&term_lower));
        if let Ok(re) = Regex::new(&pattern) {
            for mat in re.find_iter(&content_lower) {
                // Find the line containing this match
                let line_start = content[..mat.start()]
                    .rfind('\n')
                    .map(|i| i + 1)
                    .unwrap_or(0);
                let line_end = content[mat.end()..]
                    .find('\n')
                    .map(|i| mat.end() + i)
                    .unwrap_or(content.len());
                let line = content[line_start..line_end].trim();

                // Determine section from nearby headers
                let section = find_nearest_section(content, mat.start());

                warnings.push(VagueLanguageWarning {
                    term: term.to_string(),
                    location: format!("{}: \"{}\"", section, truncate_str(line, 50)),
                    suggestion: suggestion.to_string(),
                });
            }
        }
    }

    warnings
}

/// Find the nearest section header before a given position
fn find_nearest_section(content: &str, pos: usize) -> String {
    let before = &content[..pos];
    // Look for markdown headers
    if let Some(header_pos) = before.rfind("\n#") {
        let header_line_end = content[header_pos + 1..]
            .find('\n')
            .map(|i| header_pos + 1 + i)
            .unwrap_or(content.len());
        let header = content[header_pos + 1..header_line_end].trim();
        // Clean up header (remove # symbols)
        let cleaned = header.trim_start_matches('#').trim();
        if !cleaned.is_empty() {
            return cleaned.to_string();
        }
    }
    "Document".to_string()
}

/// Run all 13 enhanced quality checks and return a comprehensive report
pub fn run_enhanced_quality_checks(content: &str, prd_type: Option<&str>) -> EnhancedQualityReport {
    let content_lower = content.to_lowercase();

    // Build the 13-point quality checklist
    let mut checks: Vec<EnhancedQualityCheck> = vec![
        // Check 1: Executive Summary (10 points)
        check_executive_summary(content, &content_lower),
        // Check 2: User Impact in Problem Statement (8 points)
        check_user_impact(content, &content_lower),
        // Check 3: Business Impact in Problem Statement (8 points)
        check_business_impact(content, &content_lower),
        // Check 4: SMART Goals (10 points)
        check_smart_goals_enhanced(content, &content_lower),
        // Check 5: User Stories with Acceptance Criteria (10 points)
        check_user_stories_with_ac(content, &content_lower),
        // Check 6: Testable Requirements (8 points)
        check_testable_requirements(content, &content_lower),
        // Check 7: NFR with Specific Targets (8 points)
        check_nfr_targets(content, &content_lower),
        // Check 8: Architecture Considerations (8 points)
        check_architecture(content, &content_lower),
        // Check 9: Out of Scope Defined (6 points)
        check_out_of_scope(content, &content_lower),
        // Check 10: Task Breakdown Hints (8 points)
        check_task_breakdown(content, &content_lower),
        // Check 11: Complexity Estimates (6 points)
        check_complexity_estimates(content, &content_lower),
        // Check 12: Dependencies Identified (6 points)
        check_dependencies(content, &content_lower),
        // Check 13: Concrete Acceptance Criteria (8 points)
        check_concrete_criteria(content, &content_lower),
    ];

    // Add PRD type-specific checks (4 points bonus)
    if let Some(pt) = prd_type {
        if let Some(type_check) = check_type_specific_requirements(content, &content_lower, pt) {
            checks.push(type_check);
        }
    }

    // Detect vague language
    let vague_warnings = detect_vague_language(content);

    // Calculate totals
    let total_score: u8 = checks.iter().map(|c| c.score).sum();
    let max_score: u8 = checks.iter().map(|c| c.max_score).sum();
    let passed_count = checks.iter().filter(|c| c.passed).count() as u8;
    let total_checks = checks.len() as u8;

    let percentage = if max_score > 0 {
        ((total_score as f32 / max_score as f32) * 100.0) as u8
    } else {
        0
    };

    let grade = QualityGrade::from_percentage(percentage);

    // Check for critical failures (errors that block export)
    let has_critical_failure = checks.iter().any(|c| {
        !c.passed
            && (c.id == "executive_summary"
                || c.id == "user_stories_ac"
                || c.id == "task_breakdown")
    });

    let ready_for_export =
        grade != QualityGrade::NeedsWork && !has_critical_failure && vague_warnings.len() < 5;

    // Generate summary
    let summary = generate_quality_summary(&checks, &vague_warnings, percentage, &grade);

    EnhancedQualityReport {
        checks,
        vague_warnings,
        total_score,
        max_score,
        percentage,
        grade,
        passed_count,
        total_checks,
        ready_for_export,
        summary,
    }
}

fn generate_quality_summary(
    checks: &[EnhancedQualityCheck],
    vague_warnings: &[VagueLanguageWarning],
    percentage: u8,
    grade: &QualityGrade,
) -> String {
    let failed: Vec<_> = checks.iter().filter(|c| !c.passed).collect();

    if failed.is_empty() && vague_warnings.is_empty() {
        return format!(
            "Excellent! All {} checks passed with {}% score.",
            checks.len(),
            percentage
        );
    }

    let mut summary = format!("Quality: {} ({}%). ", grade.as_str(), percentage);

    if !failed.is_empty() {
        summary.push_str(&format!(
            "{} check(s) need attention: {}. ",
            failed.len(),
            failed
                .iter()
                .take(3)
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    if !vague_warnings.is_empty() {
        summary.push_str(&format!(
            "{} vague term(s) should be made specific.",
            vague_warnings.len()
        ));
    }

    summary
}

// Individual check implementations
// These functions implement the 13-check quality validation system

fn check_executive_summary(content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let has_summary = content_lower.contains("## executive summary")
        || content_lower.contains("## overview")
        || content_lower.contains("# overview")
        || content_lower.contains("## summary")
        || content_lower.contains("## problem statement");

    // Check word count in the summary section (50-200 words ideal)
    let word_count = if has_summary {
        // Find and count words in the summary section
        if let Some(start) = content_lower
            .find("## executive summary")
            .or_else(|| content_lower.find("## overview"))
            .or_else(|| content_lower.find("## summary"))
        {
            let section_end = content[start + 10..]
                .find("\n#")
                .map(|i| start + 10 + i)
                .unwrap_or(content.len().min(start + 1000));
            content[start..section_end].split_whitespace().count()
        } else {
            0
        }
    } else {
        0
    };

    let passed = has_summary && word_count >= 20;
    let score = if passed { 10 } else { 0 };

    let message = if !has_summary {
        "No executive summary or overview section found".to_string()
    } else if word_count < 20 {
        format!(
            "Executive summary is too brief ({} words, recommend 50-200)",
            word_count
        )
    } else {
        format!("Executive summary present ({} words)", word_count)
    };

    EnhancedQualityCheck {
        id: "executive_summary".to_string(),
        name: "Executive Summary".to_string(),
        passed,
        score,
        max_score: 10,
        message,
        suggestion: if !passed {
            Some("Add a 2-3 sentence summary: problem + solution + expected impact".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_user_impact(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let user_impact_indicators = [
        "user impact",
        "users will",
        "users can",
        "affects users",
        "user experience",
        "user pain",
        "user problem",
        "pain point",
        "frustration",
        "currently users",
        "who is affected",
    ];

    let has_user_impact = user_impact_indicators
        .iter()
        .any(|ind| content_lower.contains(ind));

    let passed = has_user_impact;
    let score = if passed { 8 } else { 0 };

    EnhancedQualityCheck {
        id: "user_impact".to_string(),
        name: "User Impact".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            "User impact is described".to_string()
        } else {
            "Problem statement lacks explicit user impact".to_string()
        },
        suggestion: if !passed {
            Some(
                "Add: Who is affected? How are they affected? Severity/frequency of the problem?"
                    .to_string(),
            )
        } else {
            None
        },
        location: None,
    }
}

fn check_business_impact(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let business_indicators = [
        "business impact",
        "revenue",
        "cost",
        "efficiency",
        "productivity",
        "roi",
        "return on investment",
        "market",
        "competitive",
        "opportunity cost",
        "support tickets",
        "customer retention",
        "churn",
    ];

    let has_business_impact = business_indicators
        .iter()
        .any(|ind| content_lower.contains(ind));

    let passed = has_business_impact;
    let score = if passed { 8 } else { 0 };

    EnhancedQualityCheck {
        id: "business_impact".to_string(),
        name: "Business Impact".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            "Business impact is described".to_string()
        } else {
            "Problem statement lacks business impact justification".to_string()
        },
        suggestion: if !passed {
            Some(
                "Add: Cost of the problem? Revenue impact? Opportunity cost? Support burden?"
                    .to_string(),
            )
        } else {
            None
        },
        location: None,
    }
}

fn check_smart_goals_enhanced(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    // SMART: Specific, Measurable, Achievable, Relevant, Time-bound
    let has_metrics_section = content_lower.contains("success metric")
        || content_lower.contains("success criteria")
        || content_lower.contains("## goals")
        || content_lower.contains("## metrics")
        || content_lower.contains("kpi");

    let has_numbers = Regex::new(r"\d+\s*(%|ms|s|users|requests|days|weeks)")
        .map(|re| re.is_match(content_lower))
        .unwrap_or(false);

    let has_timeframe = content_lower.contains("by ")
        || content_lower.contains("within ")
        || content_lower.contains("deadline")
        || content_lower.contains("milestone")
        || content_lower.contains("sprint")
        || content_lower.contains("phase");

    let has_baseline = content_lower.contains("baseline")
        || content_lower.contains("current")
        || content_lower.contains("today")
        || content_lower.contains("currently");

    let has_target =
        content_lower.contains("target") || content_lower.contains("goal") || has_numbers;

    let score_parts = [
        has_metrics_section,
        has_numbers,
        has_timeframe,
        has_baseline && has_target,
    ];
    let parts_count = score_parts.iter().filter(|&&x| x).count();

    let passed = parts_count >= 3;
    let score = if passed {
        10
    } else {
        (parts_count * 3).min(10) as u8
    };

    let mut missing = Vec::new();
    if !has_metrics_section {
        missing.push("metrics section");
    }
    if !has_numbers {
        missing.push("quantified values");
    }
    if !has_timeframe {
        missing.push("timeframe");
    }
    if !has_baseline || !has_target {
        missing.push("baseline/target");
    }

    EnhancedQualityCheck {
        id: "smart_goals".to_string(),
        name: "SMART Goals".to_string(),
        passed,
        score,
        max_score: 10,
        message: if passed {
            "Goals follow SMART format".to_string()
        } else {
            format!("Goals missing: {}", missing.join(", "))
        },
        suggestion: if !passed {
            Some(
                "Use format: Metric | Baseline | Target | Timeframe (e.g., 'Response time: 500ms → 200ms by Sprint 3')".to_string(),
            )
        } else {
            None
        },
        location: None,
    }
}

fn check_user_stories_with_ac(content: &str, _content_lower: &str) -> EnhancedQualityCheck {
    // Count user stories
    let story_pattern = Regex::new(r"(?i)(as a\s+\w+.+I want|US-\d+)").unwrap();
    let story_count = story_pattern.find_iter(content).count();

    // Count acceptance criteria sections
    let ac_pattern = Regex::new(r"(?i)(acceptance criteria|given.+when.+then|\bAC:\b)").unwrap();
    let ac_count = ac_pattern.find_iter(content).count();

    // Check for minimum 3 criteria per story (approximation)
    let criteria_items = content.matches("- [ ]").count()
        + content.matches("- [x]").count()
        + content.matches("* [ ]").count()
        + content
            .lines()
            .filter(|l| l.trim().starts_with("- "))
            .count();

    let has_stories = story_count > 0;
    let has_enough_ac = story_count == 0 || ac_count >= story_count / 2;
    let has_criteria_items = criteria_items >= story_count * 2;

    let passed = has_stories && has_enough_ac && has_criteria_items;
    let score = if passed {
        10
    } else if has_stories {
        5
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "user_stories_ac".to_string(),
        name: "User Stories with AC".to_string(),
        passed,
        score,
        max_score: 10,
        message: if passed {
            format!("{} user stories with acceptance criteria", story_count)
        } else if !has_stories {
            "No user stories found".to_string()
        } else {
            format!(
                "{} stories but insufficient acceptance criteria (found {})",
                story_count, ac_count
            )
        },
        suggestion: if !passed {
            Some("Each user story needs at least 3 acceptance criteria".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_testable_requirements(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    // Look for strong requirement language
    let strong_verbs = ["must", "shall", "will"];
    let strong_count: usize = strong_verbs
        .iter()
        .map(|v| content_lower.matches(v).count())
        .sum();

    // Check for absence of weak language
    let weak_patterns = ["should try", "would be nice", "might", "possibly", "maybe"];
    let weak_count: usize = weak_patterns
        .iter()
        .map(|p| content_lower.matches(p).count())
        .sum();

    let passed = strong_count >= 3 && weak_count == 0;
    let score = if passed {
        8
    } else if strong_count >= 3 {
        5
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "testable_requirements".to_string(),
        name: "Testable Requirements".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            format!(
                "Requirements use strong language ({} must/shall/will)",
                strong_count
            )
        } else if weak_count > 0 {
            format!(
                "Found {} weak phrases (should try, might, etc.)",
                weak_count
            )
        } else {
            "Requirements lack definitive language".to_string()
        },
        suggestion: if !passed {
            Some("Replace 'should try', 'might', 'maybe' with 'must' or 'shall'".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_nfr_targets(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let has_nfr_section = content_lower.contains("non-functional")
        || content_lower.contains("performance requirement")
        || content_lower.contains("security requirement")
        || content_lower.contains("## performance")
        || content_lower.contains("## security");

    // Check for specific numbers in NFR context
    let has_perf_numbers = Regex::new(r"\d+\s*(ms|s|second|minute|%|MB|GB|KB|rps|qps)")
        .map(|re| re.is_match(content_lower))
        .unwrap_or(false);

    let has_scale_numbers = Regex::new(r"\d+[k]?\s*(concurrent|users|requests|connections)")
        .map(|re| re.is_match(content_lower))
        .unwrap_or(false);

    let passed = has_nfr_section || (has_perf_numbers && has_scale_numbers);
    let score = if passed {
        8
    } else if has_perf_numbers || has_scale_numbers {
        4
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "nfr_targets".to_string(),
        name: "NFR Specific Targets".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            "Non-functional requirements have specific targets".to_string()
        } else {
            "NFRs lack specific numbers".to_string()
        },
        suggestion: if !passed {
            Some("Add: Response time < Xms, Xk concurrent users, 99.X% uptime, etc.".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_architecture(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let arch_indicators = [
        "architecture",
        "component",
        "module",
        "service",
        "layer",
        "api spec",
        "endpoint",
        "database schema",
        "data model",
        "diagram",
        "flowchart",
        "sequence",
    ];

    let found_indicators: Vec<&str> = arch_indicators
        .iter()
        .filter(|ind| content_lower.contains(*ind))
        .copied()
        .collect();

    let passed = found_indicators.len() >= 2;
    let score = if passed {
        8
    } else if !found_indicators.is_empty() {
        4
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "architecture".to_string(),
        name: "Architecture Considerations".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            format!(
                "Architecture addressed: {}",
                found_indicators
                    .iter()
                    .take(3)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        } else {
            "Technical architecture not documented".to_string()
        },
        suggestion: if !passed {
            Some("Add architecture section: components, data flow, API specs".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_out_of_scope(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let scope_indicators = [
        "out of scope",
        "not included",
        "excluded",
        "non-goal",
        "future phase",
        "v2",
        "later",
        "not in mvp",
        "## scope",
        "### out of scope",
    ];

    let has_scope = scope_indicators
        .iter()
        .any(|ind| content_lower.contains(ind));

    let passed = has_scope;
    let score = if passed { 6 } else { 0 };

    EnhancedQualityCheck {
        id: "out_of_scope".to_string(),
        name: "Out of Scope Defined".to_string(),
        passed,
        score,
        max_score: 6,
        message: if passed {
            "Scope boundaries are defined".to_string()
        } else {
            "No explicit 'out of scope' section".to_string()
        },
        suggestion: if !passed {
            Some("Add 'Out of Scope' section listing what's NOT included".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_task_breakdown(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let task_indicators = [
        "## task",
        "# task",
        "## implementation",
        "## phase",
        "## checklist",
        "## roadmap",
        "task breakdown",
        "work breakdown",
    ];

    let has_task_section = task_indicators
        .iter()
        .any(|ind| content_lower.contains(ind));

    // Check for numbered task list
    let numbered_tasks = Regex::new(r"\n\d+\.\s+\w+")
        .map(|re| re.find_iter(content_lower).count())
        .unwrap_or(0);

    let passed = has_task_section || numbered_tasks >= 3;
    let score = if passed { 8 } else { 0 };

    EnhancedQualityCheck {
        id: "task_breakdown".to_string(),
        name: "Task Breakdown".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            format!("Task breakdown present ({} numbered tasks)", numbered_tasks)
        } else {
            "No task breakdown or implementation plan".to_string()
        },
        suggestion: if !passed {
            Some("Add numbered tasks with descriptions and complexity estimates".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_complexity_estimates(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let complexity_indicators = [
        "small",
        "medium",
        "large",
        "xl",
        "hour",
        "day",
        "week",
        "sprint",
        "effort",
        "complexity",
        "estimate",
        "t-shirt",
        "story point",
    ];

    let found_count = complexity_indicators
        .iter()
        .filter(|ind| content_lower.contains(*ind))
        .count();

    let passed = found_count >= 2;
    let score = if passed {
        6
    } else if found_count >= 1 {
        3
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "complexity_estimates".to_string(),
        name: "Complexity Estimates".to_string(),
        passed,
        score,
        max_score: 6,
        message: if passed {
            "Complexity/effort estimates provided".to_string()
        } else {
            "Tasks lack complexity estimates".to_string()
        },
        suggestion: if !passed {
            Some("Add estimates: Small (2-4h), Medium (4-8h), Large (1-2d)".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_dependencies(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    let dep_indicators = [
        "depends on",
        "dependency",
        "dependencies",
        "blocked by",
        "prerequisite",
        "after",
        "before",
        "requires",
        "→",
        "->",
    ];

    let found_count = dep_indicators
        .iter()
        .filter(|ind| content_lower.contains(*ind))
        .count();

    let passed = found_count >= 2;
    let score = if passed {
        6
    } else if found_count >= 1 {
        3
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "dependencies".to_string(),
        name: "Dependencies Identified".to_string(),
        passed,
        score,
        max_score: 6,
        message: if passed {
            "Task dependencies are documented".to_string()
        } else {
            "Dependencies between tasks not explicit".to_string()
        },
        suggestion: if !passed {
            Some("Add 'Depends on: [US-X.X]' or 'Blocked by:' to each task".to_string())
        } else {
            None
        },
        location: None,
    }
}

fn check_concrete_criteria(_content: &str, content_lower: &str) -> EnhancedQualityCheck {
    // Look for verifiable criteria language
    let verifiable_patterns = [
        "verify",
        "confirm",
        "check that",
        "ensure",
        "validate",
        "test that",
        "returns",
        "displays",
        "shows",
        "navigates to",
        "redirects",
    ];

    let found_count = verifiable_patterns
        .iter()
        .filter(|p| content_lower.contains(*p))
        .count();

    // Count checkbox items (likely acceptance criteria)
    let checkbox_count =
        content_lower.matches("- [ ]").count() + content_lower.matches("- [x]").count();

    let passed = found_count >= 3 || checkbox_count >= 5;
    let score = if passed {
        8
    } else if found_count >= 1 || checkbox_count >= 2 {
        4
    } else {
        0
    };

    EnhancedQualityCheck {
        id: "concrete_criteria".to_string(),
        name: "Concrete Acceptance Criteria".to_string(),
        passed,
        score,
        max_score: 8,
        message: if passed {
            format!(
                "Criteria are verifiable ({} action verbs, {} checkboxes)",
                found_count, checkbox_count
            )
        } else {
            "Acceptance criteria lack verifiable actions".to_string()
        },
        suggestion: if !passed {
            Some(
                "Use action verbs: 'Verify that X returns Y', 'User can navigate to Z'".to_string(),
            )
        } else {
            None
        },
        location: None,
    }
}

fn check_type_specific_requirements(
    _content: &str,
    content_lower: &str,
    prd_type: &str,
) -> Option<EnhancedQualityCheck> {
    match prd_type {
        "bug_fix" => {
            let has_repro = content_lower.contains("reproduce")
                || content_lower.contains("steps to")
                || content_lower.contains("reproduction");
            let has_expected_actual =
                content_lower.contains("expected") && content_lower.contains("actual");

            let passed = has_repro && has_expected_actual;
            Some(EnhancedQualityCheck {
                id: "bug_fix_specific".to_string(),
                name: "Bug Fix Requirements".to_string(),
                passed,
                score: if passed { 4 } else { 0 },
                max_score: 4,
                message: if passed {
                    "Bug fix has repro steps and expected/actual".to_string()
                } else {
                    "Missing reproduction steps or expected/actual behavior".to_string()
                },
                suggestion: if !passed {
                    Some("Add: Steps to reproduce, Expected behavior, Actual behavior".to_string())
                } else {
                    None
                },
                location: None,
            })
        }
        "api_integration" => {
            let has_endpoint = content_lower.contains("endpoint") || content_lower.contains("api");
            let has_auth = content_lower.contains("auth") || content_lower.contains("token");
            let has_error_handling =
                content_lower.contains("error") || content_lower.contains("retry");

            let passed = has_endpoint && has_auth;
            Some(EnhancedQualityCheck {
                id: "api_integration_specific".to_string(),
                name: "API Integration Requirements".to_string(),
                passed,
                score: if passed && has_error_handling {
                    4
                } else if passed {
                    3
                } else {
                    0
                },
                max_score: 4,
                message: if passed {
                    "API integration has endpoint and auth details".to_string()
                } else {
                    "Missing API endpoint or authentication details".to_string()
                },
                suggestion: if !passed {
                    Some("Document: Endpoints, Auth method, Request/Response formats".to_string())
                } else {
                    None
                },
                location: None,
            })
        }
        "refactoring" => {
            let has_behavior = content_lower.contains("behavior")
                || content_lower.contains("unchanged")
                || content_lower.contains("preserve");
            let has_testing = content_lower.contains("test");

            let passed = has_behavior && has_testing;
            Some(EnhancedQualityCheck {
                id: "refactoring_specific".to_string(),
                name: "Refactoring Requirements".to_string(),
                passed,
                score: if passed { 4 } else { 0 },
                max_score: 4,
                message: if passed {
                    "Refactoring clarifies behavior and testing".to_string()
                } else {
                    "Missing behavior change policy or test strategy".to_string()
                },
                suggestion: if !passed {
                    Some("Add: 'Behavior must remain unchanged' and testing strategy".to_string())
                } else {
                    None
                },
                location: None,
            })
        }
        "full_new_app" | "new_feature" => {
            let has_mvp = content_lower.contains("mvp")
                || content_lower.contains("minimum viable")
                || content_lower.contains("phase 1")
                || content_lower.contains("v1");
            let has_tech_stack = prd_type != "full_new_app"
                || content_lower.contains("stack")
                || content_lower.contains("framework")
                || content_lower.contains("technology");

            let passed = has_mvp && has_tech_stack;
            Some(EnhancedQualityCheck {
                id: "new_app_specific".to_string(),
                name: "New App/Feature Requirements".to_string(),
                passed,
                score: if passed { 4 } else { 0 },
                max_score: 4,
                message: if passed {
                    "MVP scope and tech stack defined".to_string()
                } else {
                    "Missing MVP scope or technology stack".to_string()
                },
                suggestion: if !passed {
                    Some("Define MVP scope and technology choices".to_string())
                } else {
                    None
                },
                location: None,
            })
        }
        _ => None,
    }
}

/// Public API for enhanced quality assessment
pub async fn assess_enhanced_prd_quality(
    session_id: String,
    project_path: String,
) -> Result<EnhancedQualityReport, String> {
    let project_path_obj = as_path(&project_path);

    // Get session from file storage
    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Try to use PRD plan file content first if available
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        session.title.as_deref(),
        session.prd_id.as_deref(),
    );

    let content = if plan_path.exists() {
        std::fs::read_to_string(&plan_path)
            .map_err(|e| format!("Failed to read PRD file: {}", e))?
    } else {
        // Fall back to chat messages
        let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        messages
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    let report = run_enhanced_quality_checks(&content, session.prd_type.as_deref());

    // Update session with quality score
    chat_ops::update_chat_session_quality_score(
        project_path_obj,
        &session_id,
        report.percentage as i32,
    )
    .map_err(|e| format!("Failed to update quality score: {}", e))?;

    Ok(report)
}

/// Perform detailed quality assessment including specific checks
pub fn calculate_detailed_quality_assessment(
    content: &str,
    prd_type: Option<&str>,
) -> DetailedQualityAssessment {
    // Get base assessment (from markdown or messages)
    let base = calculate_quality_from_markdown(content, prd_type);

    // Get specific quality checks
    let quality_checks = validate_prd_quality_checks(content, prd_type);

    // Count by severity
    let error_count = quality_checks
        .iter()
        .filter(|c| c.severity == QualityCheckSeverity::Error)
        .count();
    let warning_count = quality_checks
        .iter()
        .filter(|c| c.severity == QualityCheckSeverity::Warning)
        .count();
    let info_count = quality_checks
        .iter()
        .filter(|c| c.severity == QualityCheckSeverity::Info)
        .count();

    DetailedQualityAssessment {
        base,
        quality_checks,
        error_count,
        warning_count,
        info_count,
    }
}

/// Assess detailed quality of a PRD chat session
/// Returns extended assessment with specific quality checks
pub async fn assess_detailed_prd_quality(
    session_id: String,
    project_path: String,
) -> Result<DetailedQualityAssessment, String> {
    let project_path_obj = as_path(&project_path);

    // Get session from file storage
    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Try to use PRD plan file content first if available
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        session.title.as_deref(),
        session.prd_id.as_deref(),
    );

    let assessment = if plan_path.exists() {
        match std::fs::read_to_string(&plan_path) {
            Ok(content) => {
                log::info!(
                    "Detailed quality assessment from PRD plan file: {:?}",
                    plan_path
                );
                calculate_detailed_quality_assessment(&content, session.prd_type.as_deref())
            }
            Err(e) => {
                log::warn!(
                    "Failed to read PRD plan file, falling back to messages: {}",
                    e
                );
                // Fall back to messages
                let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
                    .map_err(|e| format!("Failed to get messages: {}", e))?;
                let content = messages
                    .iter()
                    .map(|m| m.content.as_str())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                calculate_detailed_quality_assessment(&content, session.prd_type.as_deref())
            }
        }
    } else {
        // No plan file yet, use messages
        let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        let content = messages
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        calculate_detailed_quality_assessment(&content, session.prd_type.as_deref())
    };

    // Update session with quality score in file storage
    chat_ops::update_chat_session_quality_score(
        project_path_obj,
        &session_id,
        assessment.base.overall as i32,
    )
    .map_err(|e| format!("Failed to update quality score: {}", e))?;

    Ok(assessment)
}

// ============================================================================
// Guided Questions Generator
// ============================================================================

pub fn generate_guided_questions(prd_type: PRDType) -> Vec<GuidedQuestion> {
    let mut questions = vec![
        // Common questions for all PRD types
        GuidedQuestion {
            id: "problem_statement".to_string(),
            question: "What problem are you trying to solve?".to_string(),
            question_type: QuestionType::FreeText,
            options: None,
            required: true,
            hint: Some("Describe the pain point or need that this addresses".to_string()),
        },
        GuidedQuestion {
            id: "target_user".to_string(),
            question: "Who is the target user for this?".to_string(),
            question_type: QuestionType::FreeText,
            options: None,
            required: true,
            hint: Some("Be specific about the user persona or role".to_string()),
        },
    ];

    // Add type-specific questions
    match prd_type {
        PRDType::NewFeature => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "user_story".to_string(),
                    question: "Can you describe a user story? (As a [user], I want [feature] so that [benefit])".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("User stories help clarify the value proposition".to_string()),
                },
                GuidedQuestion {
                    id: "success_metrics".to_string(),
                    question: "How will you measure success?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("e.g., user adoption rate, time saved, error reduction".to_string()),
                },
                GuidedQuestion {
                    id: "out_of_scope".to_string(),
                    question: "What is explicitly out of scope for this feature?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("Defining boundaries helps prevent scope creep".to_string()),
                },
            ]);
        }
        PRDType::BugFix => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "repro_steps".to_string(),
                    question: "What are the steps to reproduce this bug?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("List numbered steps to reliably trigger the bug".to_string()),
                },
                GuidedQuestion {
                    id: "expected_behavior".to_string(),
                    question: "What is the expected behavior?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "actual_behavior".to_string(),
                    question: "What is the actual (buggy) behavior?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "severity".to_string(),
                    question: "What is the severity of this bug?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Critical - System unusable".to_string(),
                        "High - Major feature broken".to_string(),
                        "Medium - Feature partially broken".to_string(),
                        "Low - Minor inconvenience".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
            ]);
        }
        PRDType::Refactoring => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "current_state".to_string(),
                    question: "What is the current state of the code you want to refactor?"
                        .to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Describe the code smell or architectural issue".to_string()),
                },
                GuidedQuestion {
                    id: "desired_state".to_string(),
                    question: "What is the desired state after refactoring?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Describe the target architecture or patterns".to_string()),
                },
                GuidedQuestion {
                    id: "behavior_change".to_string(),
                    question: "Should this refactoring change any external behavior?".to_string(),
                    question_type: QuestionType::Confirmation,
                    options: Some(vec![
                        "No, behavior must remain identical".to_string(),
                        "Yes, some behavior changes are acceptable".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
            ]);
        }
        PRDType::ApiIntegration => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "api_provider".to_string(),
                    question: "What API or service are you integrating with?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Name of the service and link to API docs if available".to_string()),
                },
                GuidedQuestion {
                    id: "auth_method".to_string(),
                    question: "What authentication method does the API use?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "API Key".to_string(),
                        "OAuth 2.0".to_string(),
                        "JWT/Bearer Token".to_string(),
                        "Basic Auth".to_string(),
                        "No Authentication".to_string(),
                        "Other".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "data_flow".to_string(),
                    question: "Describe the data flow: what data do you send and receive?"
                        .to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Include request/response formats if known".to_string()),
                },
                GuidedQuestion {
                    id: "error_handling".to_string(),
                    question: "How should API errors be handled?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("Retry strategy, fallbacks, user messaging".to_string()),
                },
            ]);
        }
        PRDType::General => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "description".to_string(),
                    question: "Describe what you want to build or change.".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "constraints".to_string(),
                    question: "Are there any technical constraints or dependencies?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some(
                        "e.g., must work with existing database, specific framework requirements"
                            .to_string(),
                    ),
                },
            ]);
        }
        PRDType::FullNewApp => {
            questions.extend(vec![
                // Vision questions
                GuidedQuestion {
                    id: "project_vision".to_string(),
                    question: "What is the vision and main goals for this application?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some(
                        "Describe what success looks like and the core value proposition"
                            .to_string(),
                    ),
                },
                GuidedQuestion {
                    id: "target_audience".to_string(),
                    question: "Who is the target audience? Describe your user personas."
                        .to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Include demographics, needs, and pain points".to_string()),
                },
                GuidedQuestion {
                    id: "success_metrics".to_string(),
                    question: "How will you measure success for this application?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("e.g., user adoption, revenue, engagement metrics".to_string()),
                },
                // Technical questions
                GuidedQuestion {
                    id: "tech_stack".to_string(),
                    question: "What type of application are you building?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Web Application".to_string(),
                        "Mobile Application".to_string(),
                        "Desktop Application".to_string(),
                        "CLI Tool".to_string(),
                        "API/Backend Service".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "frontend_framework".to_string(),
                    question: "Do you have a frontend framework preference?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "React".to_string(),
                        "Vue".to_string(),
                        "Svelte".to_string(),
                        "None/Not applicable".to_string(),
                        "Other".to_string(),
                    ]),
                    required: false,
                    hint: None,
                },
                GuidedQuestion {
                    id: "backend_database".to_string(),
                    question: "What are your backend and database requirements?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some(
                        "Include language preferences, database type, and any infrastructure needs"
                            .to_string(),
                    ),
                },
                GuidedQuestion {
                    id: "auth_needs".to_string(),
                    question: "What authentication does your app need?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Email/Password".to_string(),
                        "OAuth (Google, GitHub, etc.)".to_string(),
                        "No authentication needed".to_string(),
                        "Other".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "core_features".to_string(),
                    question: "What are the core features for the MVP?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("List the essential features needed for first release".to_string()),
                },
                GuidedQuestion {
                    id: "deployment_target".to_string(),
                    question: "Where will this application be deployed?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Cloud (AWS, GCP, Azure, etc.)".to_string(),
                        "Self-hosted".to_string(),
                        "Desktop application".to_string(),
                        "Mobile app stores".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
            ]);
        }
    }

    // Add common closing questions
    questions.push(GuidedQuestion {
        id: "acceptance_criteria".to_string(),
        question: "What are the acceptance criteria for this to be considered complete?"
            .to_string(),
        question_type: QuestionType::FreeText,
        options: None,
        required: true,
        hint: Some("List specific, testable criteria".to_string()),
    });

    questions
}

// ============================================================================
// Unified Quality Assessment (Consolidates Basic + Enhanced)
// ============================================================================

/// Check ID to dimension mapping for deriving 3D scores from 13 checks
/// Completeness: Checks #1, #5, #6, #10, #13 (content coverage)
/// Clarity: Checks #2, #3, #4, #8 (communication quality)
/// Actionability: Checks #7, #9, #11, #12 (execution readiness)
const COMPLETENESS_CHECKS: &[&str] = &[
    "executive_summary",     // Check 1
    "user_stories_ac",       // Check 5
    "testable_requirements", // Check 6
    "task_breakdown",        // Check 10
    "concrete_criteria",     // Check 13
];

const CLARITY_CHECKS: &[&str] = &[
    "user_impact",     // Check 2
    "business_impact", // Check 3
    "smart_goals",     // Check 4
    "architecture",    // Check 8
];

const ACTIONABILITY_CHECKS: &[&str] = &[
    "nfr_targets",          // Check 7
    "out_of_scope",         // Check 9
    "complexity_estimates", // Check 11
    "dependencies",         // Check 12
];

/// Calculate a dimension score (0-100) from a subset of checks
fn calculate_dimension_score(checks: &[EnhancedQualityCheck], dimension_check_ids: &[&str]) -> u8 {
    let matching_checks: Vec<_> = checks
        .iter()
        .filter(|c| dimension_check_ids.contains(&c.id.as_str()))
        .collect();

    if matching_checks.is_empty() {
        return 0;
    }

    let total_score: u16 = matching_checks.iter().map(|c| c.score as u16).sum();
    let max_score: u16 = matching_checks.iter().map(|c| c.max_score as u16).sum();

    if max_score == 0 {
        return 0;
    }

    ((total_score as f32 / max_score as f32) * 100.0) as u8
}

/// Generate suggestions based on failed checks
fn generate_suggestions_from_checks(checks: &[EnhancedQualityCheck]) -> Vec<String> {
    checks
        .iter()
        .filter(|c| !c.passed && c.suggestion.is_some())
        .map(|c| c.suggestion.clone().unwrap())
        .take(5) // Limit to top 5 suggestions
        .collect()
}

/// Generate missing sections list from failed checks
fn generate_missing_sections_from_checks(checks: &[EnhancedQualityCheck]) -> Vec<String> {
    checks
        .iter()
        .filter(|c| !c.passed)
        .map(|c| c.name.clone())
        .collect()
}

/// Run unified quality assessment combining 13-check system with 3D dimension scores
pub fn run_unified_quality_assessment(
    content: &str,
    prd_type: Option<&str>,
) -> UnifiedQualityReport {
    // Run the 13-point enhanced quality checks
    let enhanced_report = run_enhanced_quality_checks(content, prd_type);

    // Extract derived dimension scores from the checks
    let completeness = calculate_dimension_score(&enhanced_report.checks, COMPLETENESS_CHECKS);
    let clarity = calculate_dimension_score(&enhanced_report.checks, CLARITY_CHECKS);
    let actionability = calculate_dimension_score(&enhanced_report.checks, ACTIONABILITY_CHECKS);

    // Calculate overall score as weighted average (same weights as legacy)
    // 40% completeness, 30% clarity, 30% actionability
    let overall =
        ((completeness as f32 * 0.4) + (clarity as f32 * 0.3) + (actionability as f32 * 0.3)) as u8;

    // Generate suggestions from failed checks
    let suggestions = generate_suggestions_from_checks(&enhanced_report.checks);

    // Generate missing sections from failed checks
    let missing_sections = generate_missing_sections_from_checks(&enhanced_report.checks);

    UnifiedQualityReport {
        // 13-point checklist
        checks: enhanced_report.checks,
        passed_count: enhanced_report.passed_count,
        total_checks: enhanced_report.total_checks,

        // 3D dimension scores (derived from checks)
        completeness,
        clarity,
        actionability,
        overall,

        // Issue detection
        vague_warnings: enhanced_report.vague_warnings,
        missing_sections,

        // Summary
        grade: enhanced_report.grade,
        ready_for_export: enhanced_report.ready_for_export,
        summary: enhanced_report.summary,
        suggestions,
    }
}

/// Public API for unified quality assessment - replaces both assess_prd_quality and assess_enhanced_prd_quality
pub async fn assess_unified_prd_quality(
    session_id: String,
    project_path: String,
) -> Result<UnifiedQualityReport, String> {
    let project_path_obj = as_path(&project_path);

    // Get session from file storage
    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Try to use PRD plan file content first if available
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        session.title.as_deref(),
        session.prd_id.as_deref(),
    );

    let content = if plan_path.exists() {
        log::info!(
            "Unified quality assessment from PRD plan file: {:?}",
            plan_path
        );
        std::fs::read_to_string(&plan_path)
            .map_err(|e| format!("Failed to read PRD file: {}", e))?
    } else {
        // Fall back to chat messages
        let messages = chat_ops::get_messages_by_session(project_path_obj, &session_id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        messages
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    let report = run_unified_quality_assessment(&content, session.prd_type.as_deref());

    // Update session with quality score
    chat_ops::update_chat_session_quality_score(
        project_path_obj,
        &session_id,
        report.overall as i32,
    )
    .map_err(|e| format!("Failed to update quality score: {}", e))?;

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quality_assessment_empty_conversation() {
        let messages: Vec<ChatMessage> = vec![];
        let assessment = calculate_quality_assessment(&messages, None);

        assert_eq!(assessment.completeness, 0);
        assert!(assessment.missing_sections.len() > 0);
        assert!(!assessment.ready_for_export);
    }

    #[test]
    fn test_quality_assessment_basic_conversation() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app that must support multiple lists and must allow task prioritization".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "I'll help you create a comprehensive PRD for your todo app. Here's the overview: The todo application will support multiple task lists with prioritization features.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        let assessment = calculate_quality_assessment(&messages, Some("new_feature"));

        // Should have some completeness score
        assert!(assessment.completeness > 0);
        // Should have suggestions
        assert!(assessment.suggestions.len() > 0);
    }

    #[test]
    fn test_quality_assessment_complete_conversation() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app. As a user, I want to create tasks so that I can track my work.".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "The app must support task creation. The system shall allow task prioritization. We should implement a clean UI.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "The acceptance criteria: verify that tasks can be created, ensure tasks appear in list".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "4".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Tasks to implement: 1. Create task model 2. Build task list component 3. Add task creation form. Success metric: increase task completion by 20%".to_string(),
                created_at: "2026-01-17T00:03:00Z".to_string(),
                attachments: None,
            },
        ];

        let assessment = calculate_quality_assessment(&messages, Some("new_feature"));

        // Should have higher completeness with more content
        assert!(assessment.completeness > 30);
        assert!(assessment.overall > 20);
    }

    #[test]
    fn test_guided_questions_new_feature() {
        let questions = generate_guided_questions(PRDType::NewFeature);

        // Should have common questions plus feature-specific ones
        assert!(questions.len() >= 4);

        // Should have problem statement
        assert!(questions.iter().any(|q| q.id == "problem_statement"));

        // Should have user story question for new features
        assert!(questions.iter().any(|q| q.id == "user_story"));

        // All questions should have required field set
        assert!(questions.iter().all(|q| q.question.len() > 0));
    }

    #[test]
    fn test_guided_questions_bug_fix() {
        let questions = generate_guided_questions(PRDType::BugFix);

        // Bug fix should have reproduction steps
        assert!(questions.iter().any(|q| q.id == "repro_steps"));

        // Should have expected vs actual behavior
        assert!(questions.iter().any(|q| q.id == "expected_behavior"));
        assert!(questions.iter().any(|q| q.id == "actual_behavior"));

        // Should have severity
        assert!(questions.iter().any(|q| q.id == "severity"));
    }

    #[test]
    fn test_guided_questions_api_integration() {
        let questions = generate_guided_questions(PRDType::ApiIntegration);

        // API integration should ask about the API
        assert!(questions.iter().any(|q| q.id == "api_provider"));

        // Should ask about auth method
        assert!(questions.iter().any(|q| q.id == "auth_method"));

        // Auth method should have multiple choice options
        let auth_q = questions.iter().find(|q| q.id == "auth_method").unwrap();
        assert!(auth_q.options.is_some());
        assert!(auth_q.options.as_ref().unwrap().len() >= 4);
    }

    #[test]
    fn test_has_numbered_task_list_with_task_verbs() {
        let content = r#"
Here are the implementation steps:
1. Implement the user authentication module
2. Create the database schema
3. Build the API endpoints
4. Test the integration
"#;
        assert!(has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_with_parentheses() {
        let content = r#"
Tasks:
1) Create the login form
2) Implement password validation
3) Add session management
"#;
        assert!(has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_insufficient_items() {
        // Only 2 items - should return false (need 3+)
        let content = r#"
1. Implement feature
2. Test feature
"#;
        assert!(!has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_no_task_verbs() {
        // Numbered list but no task verbs
        let content = r#"
1. First item here
2. Second item here
3. Third item here
"#;
        assert!(!has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_mixed_verbs() {
        let content = r#"
1. Design the architecture
2. Develop the backend services
3. Integrate with third-party APIs
4. Write unit tests
"#;
        assert!(has_numbered_task_list(content));
    }

    #[test]
    fn test_quality_from_markdown_detects_implementation_tasks_header() {
        let content = r#"
# Feature PRD

## Overview
This is the overview.

## Implementation Tasks
1. First task
2. Second task
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect '## Implementation Tasks' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_h1_tasks() {
        let content = r#"
# Tasks

1. Implement authentication
2. Build the dashboard
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect '# Tasks' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_phase_sections() {
        let content = r#"
## Overview
Feature description here.

## Phase 1: Setup
Initial setup tasks.

## Phase 2: Implementation
Core implementation.
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect '## Phase X' headers"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_checklist() {
        let content = r#"
## Overview
Description.

## Master Checklist
- [ ] Task 1
- [ ] Task 2
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect '## Master Checklist' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_numbered_task_list_fallback() {
        // No explicit task header, but has numbered tasks with action verbs
        let content = r#"
## Overview
We need to build a new feature.

## Requirements
The system must do X.

Here's what we need to do:
1. Implement the data model
2. Create the API endpoints
3. Build the frontend components
4. Write integration tests
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect numbered task list via fallback"
        );
    }

    #[test]
    fn test_quality_from_markdown_missing_tasks_when_none_present() {
        let content = r#"
## Overview
This is a feature description.

## Requirements
The system should work well.
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should report missing Implementation Tasks when none present"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_work_breakdown() {
        let content = r#"
## Overview
Feature overview.

## Work Breakdown
- Component A
- Component B
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect '## Work Breakdown' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_todo_section() {
        let content = r#"
## Overview
Description.

## TODO
- Item 1
- Item 2
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment
                .missing_sections
                .contains(&"Implementation Tasks".to_string()),
            "Should detect '## TODO' header"
        );
    }

    // ============================================================================
    // Specific Quality Check Tests
    // ============================================================================

    #[test]
    fn test_vague_language_detection() {
        let content = "The system should be fast and easy to use with a simple interface.";
        let checks = check_vague_language(content);

        assert!(!checks.is_empty(), "Should detect vague language");

        let vague_terms_found: Vec<_> = checks
            .iter()
            .filter_map(|c| c.matched_text.as_ref())
            .collect();
        assert!(vague_terms_found.contains(&&"fast".to_string()));
        assert!(vague_terms_found.contains(&&"easy".to_string()));
        assert!(vague_terms_found.contains(&&"simple".to_string()));
    }

    #[test]
    fn test_vague_language_no_false_positives() {
        let content = "The API response time must be < 200ms. User can complete task in 3 clicks.";
        let checks = check_vague_language(content);

        assert!(
            checks.is_empty(),
            "Should not flag specific, measurable language"
        );
    }

    #[test]
    fn test_non_testable_requirement_detection() {
        let content = "The feature should try to load quickly. It would be nice to have caching. We might add offline support.";
        let checks = check_non_testable_requirements(content);

        assert!(
            !checks.is_empty(),
            "Should detect weak requirement language"
        );

        let patterns_found: Vec<_> = checks
            .iter()
            .filter_map(|c| c.matched_text.as_ref())
            .map(|s| s.to_lowercase())
            .collect();
        assert!(patterns_found.iter().any(|s| s.contains("should try")));
        assert!(patterns_found.iter().any(|s| s.contains("would be nice")));
        assert!(patterns_found.iter().any(|s| s.contains("might")));
    }

    #[test]
    fn test_missing_metrics_detection() {
        let content = "The application must have good performance and be scalable.";
        let content_lower = content.to_lowercase();

        let checks = check_missing_metrics(content, &content_lower);

        // Should detect scalability mention without numbers
        // Note: we check for "scal" to match both "scale" and "scalable"
        assert!(
            checks.iter().any(|c| c.id == "missing-scale-target"),
            "Should detect missing scale target. Got: {:?}",
            checks.iter().map(|c| &c.id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_missing_metrics_with_numbers() {
        let content =
            "The API must respond in < 200ms. The system must support 1000 concurrent users.";
        let content_lower = content.to_lowercase();
        let checks = check_missing_metrics(content, &content_lower);

        assert!(
            checks.is_empty(),
            "Should not flag when metrics are present"
        );
    }

    #[test]
    fn test_acceptance_criteria_check() {
        let content = r#"
## User Stories

As a user, I want to login so that I can access my account.

As a user, I want to reset my password so that I can recover my account.

As a user, I want to view my profile so that I can see my information.
"#;
        let content_lower = content.to_lowercase();
        let checks = check_acceptance_criteria(content, &content_lower);

        assert!(
            checks.iter().any(|c| c.id == "missing-acceptance-criteria"),
            "Should detect user stories without acceptance criteria"
        );
    }

    #[test]
    fn test_acceptance_criteria_present() {
        let content = r#"
## User Stories

As a user, I want to login so that I can access my account.

**Acceptance Criteria:**
- User can enter email and password
- Invalid credentials show error message
- Successful login redirects to dashboard
"#;
        let content_lower = content.to_lowercase();
        let checks = check_acceptance_criteria(content, &content_lower);

        // Should not flag missing AC when present
        assert!(
            !checks.iter().any(|c| c.id == "missing-acceptance-criteria"),
            "Should not flag when acceptance criteria are present"
        );
    }

    #[test]
    fn test_smart_goals_missing_timeframe() {
        let content = r#"
## Success Metrics
- Increase user engagement
- Reduce churn rate by 15%
"#;
        let content_lower = content.to_lowercase();
        let checks = check_smart_goals(content, &content_lower);

        assert!(
            checks.iter().any(|c| c.id == "missing-timeframe"),
            "Should detect missing timeframe in goals"
        );
    }

    #[test]
    fn test_smart_goals_complete() {
        let content = r#"
## Success Metrics
- Increase user engagement by 25% within 3 months
- Reduce churn rate by 15% by end of Q2
"#;
        let content_lower = content.to_lowercase();
        let checks = check_smart_goals(content, &content_lower);

        assert!(
            !checks.iter().any(|c| c.id == "missing-timeframe"),
            "Should not flag when timeframe is present"
        );
        assert!(
            !checks.iter().any(|c| c.id == "non-measurable-goal"),
            "Should not flag when measurements are present"
        );
    }

    #[test]
    fn test_bug_fix_type_specific_checks() {
        let content = "The button is broken and needs to be fixed.";
        let content_lower = content.to_lowercase();
        let checks = check_type_specific_issues(content, &content_lower, "bug_fix");

        assert!(
            checks.iter().any(|c| c.id == "missing-repro-steps"),
            "Bug fix should require reproduction steps"
        );
        assert!(
            checks.iter().any(|c| c.id == "missing-expected-actual"),
            "Bug fix should require expected/actual behavior"
        );
    }

    #[test]
    fn test_bug_fix_complete() {
        let content = r#"
## Bug Description
The save button is not working.

## Steps to Reproduce
1. Open the form
2. Fill in the fields
3. Click Save

## Expected Behavior
The form should be saved and a success message should appear.

## Actual Behavior
Nothing happens when clicking Save.
"#;
        let content_lower = content.to_lowercase();
        let checks = check_type_specific_issues(content, &content_lower, "bug_fix");

        assert!(
            !checks.iter().any(|c| c.id == "missing-repro-steps"),
            "Should not flag when repro steps are present"
        );
        assert!(
            !checks.iter().any(|c| c.id == "missing-expected-actual"),
            "Should not flag when expected/actual are present"
        );
    }

    #[test]
    fn test_api_integration_checks() {
        let content = "We need to integrate with the payment service.";
        let content_lower = content.to_lowercase();
        let checks = check_type_specific_issues(content, &content_lower, "api_integration");

        assert!(
            checks.iter().any(|c| c.id == "missing-api-details"),
            "API integration should require endpoint details"
        );
        assert!(
            checks.iter().any(|c| c.id == "missing-auth-details"),
            "API integration should require auth details"
        );
    }

    #[test]
    fn test_refactoring_checks() {
        let content = "We need to refactor the user module to improve code quality.";
        let content_lower = content.to_lowercase();
        let checks = check_type_specific_issues(content, &content_lower, "refactoring");

        assert!(
            checks.iter().any(|c| c.id == "unclear-behavior-change"),
            "Refactoring should clarify behavior change policy"
        );
        assert!(
            checks.iter().any(|c| c.id == "missing-test-strategy"),
            "Refactoring should include test strategy"
        );
    }

    #[test]
    fn test_detailed_quality_assessment() {
        let content = r#"
## Overview
This is a fast and easy to use application.

## User Stories
As a user, I want to login.

## Tasks
1. Implement login
2. Add validation
"#;
        let assessment = calculate_detailed_quality_assessment(content, Some("new_feature"));

        // Should have base assessment
        assert!(assessment.base.overall > 0);

        // Should have quality checks
        assert!(!assessment.quality_checks.is_empty());

        // Should count severities
        let total = assessment.error_count + assessment.warning_count + assessment.info_count;
        assert_eq!(total, assessment.quality_checks.len());
    }

    #[test]
    fn test_truncate_str() {
        assert_eq!(truncate_str("short", 10), "short");
        assert_eq!(truncate_str("this is a long string", 10), "this is a ...");
    }
}
