//! Research agent prompts for GSD workflow
//!
//! Provides specialized prompts for each type of research agent.

use crate::gsd::config::ResearchAgentType;
use std::path::Path;

/// Prompt generator for research agents
pub struct ResearchPrompts;

impl ResearchPrompts {
    /// Get the prompt for a specific research agent type
    pub fn get_prompt(agent_type: ResearchAgentType, context: &str, project_path: &Path) -> String {
        let project_info = format!(
            "Project path: {}\n\nProject context:\n{}",
            project_path.display(),
            context
        );

        match agent_type {
            ResearchAgentType::Architecture => Self::architecture_prompt(&project_info),
            ResearchAgentType::Codebase => Self::codebase_prompt(&project_info),
            ResearchAgentType::BestPractices => Self::best_practices_prompt(&project_info),
            ResearchAgentType::Risks => Self::risks_prompt(&project_info),
        }
    }

    /// Prompt for architecture research
    fn architecture_prompt(project_info: &str) -> String {
        format!(
            r#"# Architecture Research Task

You are a senior software architect. Your task is to research and document the best architectural approaches for this project.

## Context
{project_info}

## Your Research Goals

1. **Design Patterns**: Identify relevant design patterns that would work well for this project
2. **System Architecture**: Propose high-level architecture (monolith, microservices, modular, etc.)
3. **Component Structure**: Suggest how to organize major components
4. **Data Flow**: Document how data should flow through the system
5. **Technology Stack**: Recommend appropriate technologies and frameworks

## Output Format

Write your findings in Markdown format with clear sections:

```markdown
# Architecture Research

## Executive Summary
[Brief overview of recommended approach]

## Design Patterns
[Relevant patterns and why they apply]

## System Architecture
[High-level architecture recommendation]

## Component Structure
[How to organize the codebase]

## Data Flow
[How data moves through the system]

## Technology Recommendations
[Specific technologies and frameworks]

## Trade-offs
[Pros and cons of the recommended approach]
```

Be specific and practical. Reference the project context in your recommendations.
"#,
            project_info = project_info
        )
    }

    /// Prompt for codebase analysis
    fn codebase_prompt(project_info: &str) -> String {
        format!(
            r#"# Codebase Analysis Task

You are a senior developer. Your task is to analyze the existing codebase and document patterns, conventions, and integration points.

## Context
{project_info}

## Your Research Goals

1. **Existing Patterns**: Identify patterns already used in the codebase
2. **Coding Conventions**: Document code style and conventions
3. **Integration Points**: Find where new code should connect
4. **Dependencies**: Understand existing dependencies
5. **Testing Approach**: Document existing test patterns

## Output Format

Write your findings in Markdown format:

```markdown
# Codebase Analysis

## Summary
[Overview of codebase state]

## Existing Patterns
[Patterns already in use]

## Coding Conventions
[Style guide and conventions]

## Integration Points
[Where new features should connect]

## Key Dependencies
[Important libraries and frameworks]

## Testing Patterns
[How tests are organized and written]

## Recommendations
[Suggestions for new code]
```

If you can't access the codebase, provide general recommendations based on the project context.
"#,
            project_info = project_info
        )
    }

    /// Prompt for best practices research
    fn best_practices_prompt(project_info: &str) -> String {
        format!(
            r#"# Best Practices Research Task

You are a technical consultant. Your task is to research industry best practices relevant to this project.

## Context
{project_info}

## Your Research Goals

1. **Industry Standards**: Document relevant standards and guidelines
2. **Security Best Practices**: Security considerations for this type of project
3. **Performance Guidelines**: Performance optimization recommendations
4. **Accessibility**: If applicable, accessibility requirements
5. **Maintainability**: Long-term maintenance considerations

## Output Format

Write your findings in Markdown format:

```markdown
# Best Practices Research

## Summary
[Overview of key best practices]

## Industry Standards
[Relevant standards and guidelines]

## Security Considerations
[Security best practices]

## Performance Guidelines
[Performance optimization tips]

## Accessibility
[Accessibility requirements if applicable]

## Maintainability
[Long-term maintenance recommendations]

## Common Pitfalls
[Mistakes to avoid]
```

Focus on practical, actionable recommendations.
"#,
            project_info = project_info
        )
    }

    /// Prompt for risks research
    fn risks_prompt(project_info: &str) -> String {
        format!(
            r#"# Risks & Challenges Research Task

You are a risk analyst. Your task is to identify potential risks and challenges for this project.

## Context
{project_info}

## Your Research Goals

1. **Technical Risks**: Identify technical challenges and unknowns
2. **Complexity Risks**: Areas that might be more complex than expected
3. **Dependency Risks**: Risks related to external dependencies
4. **Timeline Risks**: Factors that could affect delivery
5. **Mitigation Strategies**: How to address identified risks

## Output Format

Write your findings in Markdown format:

```markdown
# Risks & Challenges

## Summary
[Overview of key risks]

## Technical Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ... | ... | ... | ... |

## Complexity Hotspots
[Areas likely to be more complex]

## Dependency Risks
[Risks from external dependencies]

## Timeline Considerations
[Factors affecting delivery]

## Recommended Mitigations
[Specific actions to reduce risk]

## Unknowns
[Things that need more investigation]
```

Be honest about risks but also provide actionable mitigations.
"#,
            project_info = project_info
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_get_prompt_contains_context() {
        let context = "Building a real-time chat app";
        let project_path = PathBuf::from("/test/project");

        for agent_type in ResearchAgentType::all() {
            let prompt = ResearchPrompts::get_prompt(*agent_type, context, &project_path);
            assert!(prompt.contains(context));
            assert!(prompt.contains("/test/project"));
        }
    }

    #[test]
    fn test_architecture_prompt_has_sections() {
        let prompt = ResearchPrompts::get_prompt(
            ResearchAgentType::Architecture,
            "Test context",
            &PathBuf::from("/test"),
        );

        assert!(prompt.contains("Design Patterns"));
        assert!(prompt.contains("System Architecture"));
        assert!(prompt.contains("Component Structure"));
    }

    #[test]
    fn test_risks_prompt_has_table_format() {
        let prompt = ResearchPrompts::get_prompt(
            ResearchAgentType::Risks,
            "Test context",
            &PathBuf::from("/test"),
        );

        assert!(prompt.contains("| Risk | Likelihood | Impact | Mitigation |"));
    }
}
