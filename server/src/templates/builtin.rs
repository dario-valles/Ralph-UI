// Built-in prompt templates

use std::collections::HashMap;

/// Built-in template names
pub const TASK_PROMPT: &str = "task_prompt";
pub const TASK_WITH_PRD: &str = "task_with_prd";
pub const BUG_FIX: &str = "bug_fix";
pub const FEATURE: &str = "feature";
pub const REFACTOR: &str = "refactor";
pub const TEST: &str = "test";
pub const REQUIREMENT_GENERATION: &str = "requirement_generation";

/// Get all built-in templates
pub fn get_builtin_templates() -> HashMap<String, String> {
    let mut templates = HashMap::new();

    templates.insert(TASK_PROMPT.to_string(), TASK_PROMPT_TEMPLATE.to_string());
    templates.insert(
        TASK_WITH_PRD.to_string(),
        TASK_WITH_PRD_TEMPLATE.to_string(),
    );
    templates.insert(BUG_FIX.to_string(), BUG_FIX_TEMPLATE.to_string());
    templates.insert(FEATURE.to_string(), FEATURE_TEMPLATE.to_string());
    templates.insert(REFACTOR.to_string(), REFACTOR_TEMPLATE.to_string());
    templates.insert(TEST.to_string(), TEST_TEMPLATE.to_string());
    templates.insert(
        REQUIREMENT_GENERATION.to_string(),
        REQUIREMENT_GENERATION_TEMPLATE.to_string(),
    );

    templates
}

/// Get a specific built-in template
pub fn get_builtin_template(name: &str) -> Option<&'static str> {
    match name {
        TASK_PROMPT => Some(TASK_PROMPT_TEMPLATE),
        TASK_WITH_PRD => Some(TASK_WITH_PRD_TEMPLATE),
        BUG_FIX => Some(BUG_FIX_TEMPLATE),
        FEATURE => Some(FEATURE_TEMPLATE),
        REFACTOR => Some(REFACTOR_TEMPLATE),
        TEST => Some(TEST_TEMPLATE),
        REQUIREMENT_GENERATION => Some(REQUIREMENT_GENERATION_TEMPLATE),
        _ => None,
    }
}

/// List all built-in template names
pub fn list_builtin_templates() -> Vec<&'static str> {
    vec![
        TASK_PROMPT,
        TASK_WITH_PRD,
        BUG_FIX,
        FEATURE,
        REFACTOR,
        TEST,
        REQUIREMENT_GENERATION,
    ]
}

// Template definitions

const TASK_PROMPT_TEMPLATE: &str = r#"You are working on: {{ task.title }}

## Description
{{ task.description }}
{% if acceptance_criteria | length > 0 %}

## Acceptance Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}
{% if dependencies | length > 0 %}

## Completed Dependencies
{% for dep in dependencies %}
- {{ dep.title }} ({{ dep.status }})
{% endfor %}
{% endif %}

## Instructions
- Complete the task as described above
- Follow the project's coding standards and conventions
- Write clean, maintainable code
- Add appropriate tests if applicable
- Update documentation if needed
"#;

const TASK_WITH_PRD_TEMPLATE: &str = r#"You are working on: {{ task.title }}

## Description
{{ task.description }}
{% if prd_content %}

## PRD Context
{{ prd_content }}
{% endif %}
{% if acceptance_criteria | length > 0 %}

## Acceptance Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}
{% if dependencies | length > 0 %}

## Completed Dependencies
{% for dep in dependencies %}
- {{ dep.title }} ({{ dep.status }})
{% endfor %}
{% endif %}

## Instructions
- Review the PRD context to understand the broader goals
- Complete the task as described above
- Ensure your implementation aligns with the PRD requirements
- Follow the project's coding standards and conventions
"#;

const BUG_FIX_TEMPLATE: &str = r#"# Bug Fix: {{ task.title }}

## Bug Description
{{ task.description }}

## Instructions
1. Reproduce the bug to confirm it exists
2. Identify the root cause
3. Implement a fix that addresses the root cause
4. Add tests to prevent regression
5. Verify the fix works correctly
6. Ensure no other functionality is broken
{% if acceptance_criteria | length > 0 %}

## Acceptance Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}

## Notes
- Focus on fixing the specific bug without introducing new issues
- Document any related issues discovered during investigation
- If the fix requires changes in multiple places, explain the reasoning
"#;

const FEATURE_TEMPLATE: &str = r#"# Feature: {{ task.title }}

## Feature Description
{{ task.description }}
{% if acceptance_criteria | length > 0 %}

## Acceptance Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}
{% if dependencies | length > 0 %}

## Prerequisites (Completed)
{% for dep in dependencies %}
- [x] {{ dep.title }}
{% endfor %}
{% endif %}

## Implementation Instructions
1. Design the implementation approach
2. Implement the feature incrementally
3. Write comprehensive tests
4. Update relevant documentation
5. Ensure backwards compatibility if applicable

## Guidelines
- Follow SOLID principles
- Write clean, maintainable code
- Consider edge cases
- Add appropriate error handling
"#;

const REFACTOR_TEMPLATE: &str = r#"# Refactoring: {{ task.title }}

## Refactoring Goal
{{ task.description }}
{% if acceptance_criteria | length > 0 %}

## Success Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}

## Instructions
1. Understand the current implementation thoroughly
2. Plan the refactoring approach
3. Make incremental changes
4. Ensure all existing tests pass
5. Improve test coverage if needed
6. Verify behavior remains unchanged

## Guidelines
- Do not change external behavior (unless fixing bugs)
- Preserve all existing functionality
- Improve code clarity and maintainability
- Consider performance implications
- Update documentation to reflect changes
"#;

const TEST_TEMPLATE: &str = r#"# Testing Task: {{ task.title }}

## Test Requirements
{{ task.description }}
{% if acceptance_criteria | length > 0 %}

## Test Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}

## Instructions
1. Analyze the code to understand what needs testing
2. Identify edge cases and error scenarios
3. Write unit tests for individual components
4. Write integration tests for component interactions
5. Ensure tests are deterministic and independent
6. Add appropriate assertions and error messages

## Testing Guidelines
- Follow the project's testing conventions
- Use descriptive test names
- Cover happy path and error cases
- Mock external dependencies appropriately
- Aim for meaningful coverage, not just high numbers
"#;

const REQUIREMENT_GENERATION_TEMPLATE: &str = r#"You are an expert requirements engineer. Generate clear, actionable software requirements based on the user's description.

{% if project_context %}
## Project Context
{{ project_context }}
{% endif %}

{% if existing_requirements | length > 0 %}
## Existing Requirements (avoid duplicates)
{% for req in existing_requirements %}
- {{ req.id }}: {{ req.title }}
{% endfor %}
{% endif %}

## User Request
{{ user_prompt }}

## Instructions
Generate {{ count }} software requirements as a JSON array. Each requirement must be:
- Specific and measurable (avoid vague terms like "fast", "easy", "simple")
- User-focused (describe the benefit to users)
- Atomic (one capability per requirement, not multiple combined)
- Testable with clear acceptance criteria
- Non-overlapping with existing requirements

**IMPORTANT**: You are generating SOFTWARE REQUIREMENTS, not CLI commands, not tool names, not function names. Each requirement should describe a FEATURE or CAPABILITY that a user would interact with.

## Output Format
Output ONLY a valid JSON array with no additional text, no markdown formatting, and no trailing commas.
Each object must have these exact fields:
- "category": one of "core", "ui", "data", "integration", "security", "performance", "testing", "documentation", "other"
- "title": concise title (5-10 words) - THIS FIELD IS MANDATORY
- "description": detailed description (1-3 sentences)
- "acceptanceCriteria": array of 2-4 testable criteria
- "suggestedScope": one of "v1", "v2", "out_of_scope" based on complexity and importance

REMINDER: Every requirement object MUST include ALL fields. Do NOT omit the "title" field - it is required for every requirement.

## Example Output
[
  {
    "category": "security",
    "title": "OAuth 2.0 Provider Integration",
    "description": "Enable users to authenticate using third-party OAuth 2.0 providers like Google and GitHub, reducing friction for new users and eliminating password management burden.",
    "acceptanceCriteria": [
      "Users can sign in with Google OAuth",
      "Users can sign in with GitHub OAuth",
      "OAuth tokens are securely stored and refreshed",
      "Account linking works for existing email users"
    ],
    "suggestedScope": "v1"
  },
  {
    "category": "security",
    "title": "Password Reset via Email",
    "description": "Allow users who forget their password to securely reset it via a time-limited email link.",
    "acceptanceCriteria": [
      "Users receive reset email within 1 minute",
      "Reset links expire after 1 hour",
      "Old password is invalidated on successful reset",
      "User is notified of password change"
    ],
    "suggestedScope": "v1"
  }
]

## Common Mistakes to Avoid
❌ DO NOT include explanatory text before/after the JSON
❌ DO NOT wrap the JSON in markdown code blocks (```json ... ```)
❌ DO NOT use trailing commas (not valid in strict JSON)
❌ DO NOT omit the "title" field (it is required for every requirement)
❌ DO NOT return a single object - always return an array
❌ DO NOT list tool names, command names, or function names - you are generating REQUIREMENTS, not code
✅ DO output only the raw JSON array starting with [ and ending with ]
✅ DO ensure each array element is an object with the fields listed above
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_builtin_templates() {
        let templates = get_builtin_templates();
        assert!(templates.len() >= 6);
        assert!(templates.contains_key(TASK_PROMPT));
        assert!(templates.contains_key(BUG_FIX));
    }

    #[test]
    fn test_get_builtin_template() {
        let template = get_builtin_template(TASK_PROMPT);
        assert!(template.is_some());
        assert!(template.unwrap().contains("You are working on:"));
    }

    #[test]
    fn test_get_nonexistent_template() {
        let template = get_builtin_template("nonexistent");
        assert!(template.is_none());
    }

    #[test]
    fn test_list_builtin_templates() {
        let names = list_builtin_templates();
        assert!(names.contains(&TASK_PROMPT));
        assert!(names.contains(&BUG_FIX));
        assert!(names.contains(&FEATURE));
    }

    #[test]
    fn test_templates_contain_placeholders() {
        let templates = get_builtin_templates();

        for (name, template) in &templates {
            // Skip requirement_generation as it uses different placeholders
            if name == REQUIREMENT_GENERATION {
                assert!(
                    template.contains("user_prompt") && template.contains("count"),
                    "Template '{}' should contain user_prompt and count placeholders",
                    name
                );
                continue;
            }
            assert!(
                template.contains("task.title") || template.contains("task.description"),
                "Template '{}' should contain task placeholders",
                name
            );
        }
    }

    #[test]
    fn test_requirement_generation_template() {
        let template = get_builtin_template(REQUIREMENT_GENERATION);
        assert!(template.is_some());
        let content = template.unwrap();
        assert!(content.contains("user_prompt"));
        assert!(content.contains("count"));
        assert!(content.contains("project_context"));
        assert!(content.contains("JSON array"));
    }
}
