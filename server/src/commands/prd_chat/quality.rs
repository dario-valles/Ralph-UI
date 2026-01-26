// PRD Chat quality assessment functions

use crate::file_storage::chat_ops;
use crate::models::{
    ChatMessage, ExtractedPRDContent, GuidedQuestion, MessageRole, PRDType, QualityAssessment,
    QuestionType,
};
use crate::utils::as_path;
use regex::Regex;

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
}
