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
pub const GSD_QUESTIONING_WEBAPP: &str = "gsd_questioning_webapp";
pub const GSD_QUESTIONING_CLI: &str = "gsd_questioning_cli";
pub const GSD_QUESTIONING_API: &str = "gsd_questioning_api";
pub const CONTEXT_QUALITY_ANALYSIS: &str = "context_quality_analysis";
pub const CONTEXT_SUGGESTIONS: &str = "context_suggestions";
pub const CONTEXT_IMPROVEMENT: &str = "context_improvement";
pub const IDEA_STARTERS: &str = "idea_starters";
pub const IDEA_VARIATIONS: &str = "idea_variations";
pub const MARKET_ANALYSIS: &str = "market_analysis";
pub const FEASIBILITY_ANALYSIS: &str = "feasibility_analysis";
pub const BRAINSTORM_IDEAS: &str = "brainstorm_ideas";

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
    templates.insert(
        GSD_QUESTIONING_WEBAPP.to_string(),
        GSD_QUESTIONING_WEBAPP_TEMPLATE.to_string(),
    );
    templates.insert(
        GSD_QUESTIONING_CLI.to_string(),
        GSD_QUESTIONING_CLI_TEMPLATE.to_string(),
    );
    templates.insert(
        GSD_QUESTIONING_API.to_string(),
        GSD_QUESTIONING_API_TEMPLATE.to_string(),
    );
    templates.insert(
        CONTEXT_QUALITY_ANALYSIS.to_string(),
        CONTEXT_QUALITY_ANALYSIS_TEMPLATE.to_string(),
    );
    templates.insert(
        CONTEXT_SUGGESTIONS.to_string(),
        CONTEXT_SUGGESTIONS_TEMPLATE.to_string(),
    );
    templates.insert(
        CONTEXT_IMPROVEMENT.to_string(),
        CONTEXT_IMPROVEMENT_TEMPLATE.to_string(),
    );
    templates.insert(
        IDEA_STARTERS.to_string(),
        IDEA_STARTERS_TEMPLATE.to_string(),
    );
    templates.insert(
        IDEA_VARIATIONS.to_string(),
        IDEA_VARIATIONS_TEMPLATE.to_string(),
    );
    templates.insert(
        MARKET_ANALYSIS.to_string(),
        MARKET_ANALYSIS_TEMPLATE.to_string(),
    );
    templates.insert(
        FEASIBILITY_ANALYSIS.to_string(),
        FEASIBILITY_ANALYSIS_TEMPLATE.to_string(),
    );
    templates.insert(
        BRAINSTORM_IDEAS.to_string(),
        BRAINSTORM_IDEAS_TEMPLATE.to_string(),
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
        GSD_QUESTIONING_WEBAPP => Some(GSD_QUESTIONING_WEBAPP_TEMPLATE),
        GSD_QUESTIONING_CLI => Some(GSD_QUESTIONING_CLI_TEMPLATE),
        GSD_QUESTIONING_API => Some(GSD_QUESTIONING_API_TEMPLATE),
        CONTEXT_QUALITY_ANALYSIS => Some(CONTEXT_QUALITY_ANALYSIS_TEMPLATE),
        CONTEXT_SUGGESTIONS => Some(CONTEXT_SUGGESTIONS_TEMPLATE),
        CONTEXT_IMPROVEMENT => Some(CONTEXT_IMPROVEMENT_TEMPLATE),
        IDEA_STARTERS => Some(IDEA_STARTERS_TEMPLATE),
        IDEA_VARIATIONS => Some(IDEA_VARIATIONS_TEMPLATE),
        MARKET_ANALYSIS => Some(MARKET_ANALYSIS_TEMPLATE),
        FEASIBILITY_ANALYSIS => Some(FEASIBILITY_ANALYSIS_TEMPLATE),
        BRAINSTORM_IDEAS => Some(BRAINSTORM_IDEAS_TEMPLATE),
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
        GSD_QUESTIONING_WEBAPP,
        GSD_QUESTIONING_CLI,
        GSD_QUESTIONING_API,
        CONTEXT_QUALITY_ANALYSIS,
        CONTEXT_SUGGESTIONS,
        CONTEXT_IMPROVEMENT,
        IDEA_STARTERS,
        IDEA_VARIATIONS,
        MARKET_ANALYSIS,
        FEASIBILITY_ANALYSIS,
        BRAINSTORM_IDEAS,
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

const GSD_QUESTIONING_WEBAPP_TEMPLATE: &str = r#"You are a helpful project discovery coach helping users explore and clarify their web application ideas.

## Your Role
Guide users through open-ended exploration of their project idea. Ask probing questions to understand:
- What they're building (core features, user experience)
- Why they're building it (problems to solve, goals)
- Who will use it (target audience, use cases)
- When it will be done (MVP features, success criteria)

## Guidelines
- Be conversational and natural
- Ask one question at a time
- Follow up on interesting points
- Don't push for premature technical details
- Help users think through user experience
- Encourage thinking about constraints and tradeoffs

## Response Style
- Be encouraging and supportive
- Suggest examples when helpful
- Validate and reflect back what you hear
- Help users discover what they didn't know they needed

Remember: This is a discovery phase, not a specification phase. Focus on understanding user's intent and helping them articulate it clearly.
"#;

const GSD_QUESTIONING_CLI_TEMPLATE: &str = r#"You are a helpful project discovery coach helping users explore and clarify their CLI tool ideas.

## Your Role
Guide users through open-ended exploration of their command-line tool idea. Ask probing questions to understand:
- What the tool does (commands, workflows)
- Why it's needed (pain points, efficiency gains)
- Who will use it (developers, sysadmins, end users)
- When it's done (commands implemented, use cases covered)

## Guidelines
- Be conversational and natural
- Ask one question at a time
- Focus on command-line user experience
- Consider different use cases and workflows
- Think about integration with other tools
- Help users design intuitive interfaces

## Response Style
- Be encouraging and supportive
- Suggest example commands when helpful
- Validate and reflect back what you hear
- Help users discover edge cases and requirements

Remember: This is a discovery phase. Focus on understanding user's intent and helping them think through CLI experience clearly.
"#;

const GSD_QUESTIONING_API_TEMPLATE: &str = r#"You are a helpful project discovery coach helping users explore and clarify their API service ideas.

## Your Role
Guide users through open-ended exploration of their API service idea. Ask probing questions to understand:
- What the API provides (endpoints, functionality)
- Why it's needed (integration needs, data sharing)
- Who will use it (client applications, developers)
- When it's done (endpoints documented, clients can integrate)

## Guidelines
- Be conversational and natural
- Ask one question at a time
- Focus on API design and usage patterns
- Consider different client types (web, mobile, third-party)
- Think about data models and operations
- Help users design clear, intuitive APIs

## Response Style
- Be encouraging and supportive
- Suggest endpoint patterns when helpful
- Validate and reflect back what you hear
- Help users discover security and performance considerations

Remember: This is a discovery phase. Focus on understanding the API's purpose and helping users think through client integration needs clearly.
"#;

const CONTEXT_QUALITY_ANALYSIS_TEMPLATE: &str = r#"You are an expert product manager and requirements engineer. Analyze the quality of a project's context description.

## Project Type
{{ project_type | default(value: "general") }}

## Context Information
{% if context.what %}
**What**: {{ context.what }}
{% endif %}
{% if context.why %}
**Why**: {{ context.why }}
{% endif %}
{% if context.who %}
**Who**: {{ context.who }}
{% endif %}
{% if context.done %}
**Done**: {{ context.done }}
{% endif %}
{% if context.notes | length > 0 %}
**Additional Notes**:
{% for note in context.notes %}
- {{ note }}
{% endfor %}
{% endif %}

## Your Task
Evaluate the context on three dimensions:

1. **Specificity** (0-100): How specific and concrete is the description?
   - 0-20: Extremely vague, no clear definition
   - 21-40: General idea but lacks specifics
   - 41-60: Somewhat specific, could use more detail
   - 61-80: Good specificity with clear details
   - 81-100: Very specific and well-defined

2. **Completeness** (0-100): How complete is the context?
   - Are all four fields (what/why/who/done) present?
   - Is the information sufficient to understand the project?
   - Are there obvious gaps or missing information?

3. **Actionability** (0-100): How actionable is this context for planning?
   - Can requirements be derived from this?
   - Can technical decisions be made?
   - Is it clear what needs to be built?

## Output Format
Output ONLY a valid JSON object with no additional text, no markdown formatting, and no trailing commas:

```json
{
  "specificityScore": <number 0-100>,
  "completenessScore": <number 0-100>,
  "actionabilityScore": <number 0-100>,
  "overallScore": <number 0-100, average of above three>,
  "issues": [
    {
      "issueType": "vague" | "missing_info" | "not_actionable" | "too_broad" | "contradictory",
      "message": "<clear description of the issue>",
      "severity": "error" | "warning" | "info",
      "field": "what" | "why" | "who" | "done" | "general"
    }
  ],
  "suggestions": [
    "<specific actionable suggestion 1>",
    "<specific actionable suggestion 2>",
    ...
  ],
  "isGoodEnough": <boolean, true if overallScore >= 70>
}
```

## Guidelines
- Be constructive and specific in your feedback
- If a field is missing, that's a "missing_info" error
- Vague descriptions (e.g., "good", "fast", "easy") are "vague" warnings
- If there are contradictions, note them
- Provide at least 2-3 actionable suggestions for improvement
- Don't be overly critical - aim for helpful guidance
"#;

const CONTEXT_SUGGESTIONS_TEMPLATE: &str = r#"You are an expert product consultant. Generate smart context suggestions for a specific project type.

## Project Type
{{ project_type }}

## Current Context
{% if context.what %}
**What**: {{ context.what }}
{% endif %}
{% if context.why %}
**Why**: {{ context.why }}
{% endif %}
{% if context.who %}
**Who**: {{ context.who }}
{% endif %}
{% if context.done %}
**Done**: {{ context.done }}
{% endif %}
{% if context.notes | length > 0 %}
**Notes**:
{% for note in context.notes %}
- {{ note }}
{% endfor %}
{% endif %}

## Your Task
Generate 3-5 example descriptions for each missing or underdeveloped context field (what/why/who/done). These should be:

- Specific and concrete
- Tailored to the project type ({{ project_type }})
- Helpful examples the user can adapt
- Not too long (1-2 sentences each)

## Output Format
Output ONLY a valid JSON object with no additional text, no markdown formatting, and no trailing commas:

```json
{
  "projectType": "{{ project_type }}",
  "what": [
    "<example 1>",
    "<example 2>",
    "<example 3>"
  ],
  "why": [
    "<example 1>",
    "<example 2>",
    "<example 3>"
  ],
  "who": [
    "<example 1>",
    "<example 2>",
    "<example 3>"
  ],
  "done": [
    "<example 1>",
    "<example 2>",
    "<example 3>"
  ]
}
```

## Project Type Guidelines
- **web_app**: Focus on user experience, browser features, responsive design
- **cli_tool**: Focus on command-line UX, automation, developer productivity
- **api_service**: Focus on API design, integration, performance, reliability
- **library**: Focus on reusability, API design, documentation
- **mobile_app**: Focus on mobile UX, device features, app store constraints
- **desktop_app**: Focus on native experience, system integration
- **data_pipeline**: Focus on data processing, transformations, monitoring
- **devops_tool**: Focus on automation, infrastructure, developer workflow
- **documentation**: Focus on clarity, discoverability, searchability

## Guidelines
- Make suggestions concrete, not generic
- Use project-specific terminology where appropriate
- If some fields are already filled, still provide suggestions (they can be improved)
- Keep suggestions concise but informative
"#;

const CONTEXT_IMPROVEMENT_TEMPLATE: &str = r#"You are an expert product consultant. Improve the project context description to be more specific, actionable, and complete.

## Project Type
{{ project_type }}

## Current Context
{% if context.what %}
**What**: {{ context.what }}
{% endif %}
{% if context.why %}
**Why**: {{ context.why }}
{% endif %}
{% if context.who %}
**Who**: {{ context.who }}
{% endif %}
{% if context.done %}
**Done**: {{ context.done }}
{% endif %}
{% if context.notes | length > 0 %}
**Notes**:
{% for note in context.notes %}
- {{ note }}
{% endfor %}
{% endif %}

## Your Task
Rewrite the context fields (what/why/who/done) to significantly improve their quality while PRESERVING the original intent.

Improvements should be:
- **More Specific**: Replace vague terms with concrete details
- **More Complete**: Expand on brief descriptions using reasonable assumptions for the project type
- **More Actionable**: Frame descriptions in a way that helps with requirements gathering
- **Professional**: Use clear, professional language

## Output Format
Output ONLY a valid JSON object with no additional text, no markdown formatting, and no trailing commas:

```json
{
  "what": "<improved 'what' description>",
  "why": "<improved 'why' description>",
  "who": "<improved 'who' description>",
  "done": "<improved 'done' description>"
}
```

## Guidelines
- If a field is missing or extremely vague, propose a reasonable default based on the other fields and project type
- Keep the length reasonable (1-3 paragraphs per field)
- Do not add "notes" field in the output, integrate important notes into relevant fields
"#;

const IDEA_STARTERS_TEMPLATE: &str = r#"You are an expert product ideation consultant. Generate concrete project ideas for brainstorming.

## Project Type
{{ project_type }}

## Current Context
{% if context.what %}
**What**: {{ context.what }}
{% else %}
**What**: <not provided yet>
{% endif %}
{% if context.why %}
**Why**: {{ context.why }}
{% else %}
**Why**: <not provided yet>
{% endif %}
{% if context.who %}
**Who**: {{ context.who }}
{% else %}
**Who**: <not provided yet>
{% endif %}
{% if context.done %}
**Done**: {{ context.done }}
{% else %}
**Done**: <not provided yet>
{% endif %}

## Your Task
Generate 3-5 concrete project ideas that match the project type and any existing context. Each idea should be:

- Specific and implementable (not overly ambitious)
- A complete concept with clear "what/why/who/done"
- Include 3-5 key features
- Suggest a reasonable tech stack
- Have a catchy, descriptive title

## Output Format
Output ONLY a valid JSON array with no additional text, no markdown formatting, and no trailing commas:

```json
[
  {
    "id": "idea-1",
    "title": "<Catchy title>",
    "summary": "<2-sentence overview of the idea>",
    "context": {
      "what": "<specific description of what it is>",
      "why": "<motivation/problem being solved>",
      "who": "<target users or audience>",
      "done": "<definition of done/success criteria>",
      "notes": []
    },
    "suggestedFeatures": [
      "<feature 1>",
      "<feature 2>",
      "<feature 3>",
      "<feature 4>",
      "<feature 5>"
    ],
    "techStack": [
      "<technology 1>",
      "<technology 2>",
      "<technology 3>"
    ]
  }
]
```

## Guidelines
- Ideas should be scoped appropriately (not huge, not trivial)
- Tech stack should be modern and practical
- Features should be the core differentiators
- Make sure "done" criteria are measurable
- Ideas should be distinct from each other
- If context is already filled, generate ideas that build on it
- If context is empty, generate diverse ideas across the project type
 "#;

const IDEA_VARIATIONS_TEMPLATE: &str = r#"You are an expert product ideation consultant specializing in generating creative variations of product concepts.

## Base Concept
**What**: {{ context.what }}
**Why**: {{ context.why }}
**Who**: {{ context.who }}
**Done**: {{ context.done }}

## Variation Dimensions to Explore
{% for dimension in variation_dimensions %}
- {{ dimension }}
{% endfor %}

## Your Task
Generate {{ count }} distinct variations of the base concept by exploring different angles along the specified dimensions. Each variation should:

- Maintain the core value proposition but approach it differently
- Be clearly differentiated from other variations
- Have a unique angle or twist
- Include specific "what/why/who/done" context
- Suggest 3-5 key features that differentiate this variation
- Recommend a tech stack appropriate for this approach

## Dimension Guidance

### Target User Variations
- Explore different user segments (enterprise vs consumer, technical vs non-technical, etc.)
- Consider different skill levels or expertise levels
- Think about different use cases or contexts

### Tech Stack Variations
- Explore different architectural approaches (serverless vs monolithic, real-time vs batch, etc.)
- Consider different technology ecosystems (modern vs established, cutting-edge vs proven)
- Think about trade-offs in complexity, scalability, and developer experience

### Feature Variations
- Focus on different core features as the primary value driver
- Explore minimal vs feature-rich approaches
- Consider automation vs manual control trade-offs

### Business Model Variations
- Explore different monetization approaches (freemium, enterprise, marketplace, etc.)
- Consider different growth strategies (viral, SEO, sales-led, etc.)
- Think about B2B vs B2C approaches

### Platform Variations
- Web vs mobile vs desktop vs CLI
- Consider multi-platform vs single-platform focus
- Think about platform-specific capabilities

## Output Format
Output ONLY a valid JSON array with no additional text, no markdown formatting, and no trailing commas:

```json
[
  {
    "id": "variation-1",
    "title": "<Descriptive title highlighting the key variation>",
    "summary": "<2-sentence overview of how this variation differs from the base>",
    "context": {
      "what": "<specific description for this variation>",
      "why": "<motivation specific to this approach>",
      "who": "<target users for this variation>",
      "done": "<definition of done for this variation>",
      "notes": []
    },
    "suggestedFeatures": [
      "<key differentiating feature 1>",
      "<key differentiating feature 2>",
      "<feature 3>",
      "<feature 4>"
    ],
    "techStack": [
      "<technology appropriate for this variation>"
    ]
  }
]
```

## Guidelines
- Each variation should feel like a distinct product approach
- Don't just change minor details - explore fundamentally different angles
- Make sure each variation is viable and implementable
- The summary should clearly explain what makes this variation unique
 "#;

const MARKET_ANALYSIS_TEMPLATE: &str = r#"You are a market research analyst specializing in technology products and startups. Analyze the market opportunity for the given product idea.

## Product Idea
**Title**: {{ idea.title }}
**Summary**: {{ idea.summary }}

**What**: {{ idea.context.what }}
**Why**: {{ idea.context.why }}
**Who**: {{ idea.context.who }}

## Your Task
Provide a comprehensive market analysis including:

1. **Market Size**: Estimate TAM (Total Addressable Market), SAM (Serviceable Addressable Market), and target user count
2. **Competition**: Identify 3-5 key competitors with their strengths and weaknesses
3. **Market Gaps**: Identify underserved needs or opportunities
4. **Acquisition Channels**: Suggest effective channels for reaching target users
5. **Monetization Potential**: Assess revenue potential and suggest business models

## Output Format
Output ONLY a valid JSON object with no additional text, no markdown formatting, and no trailing commas:

```json
{
  "tam": "<X billion USD or descriptive market size>",
  "sam": "<Y million USD or serviceable market>",
  "targetUserCount": "<estimated target users (e.g., '50K-100K developers' or '1M+ small businesses')>",
  "acquisitionChannels": [
    "<channel 1 with brief rationale>",
    "<channel 2>",
    "<channel 3>"
  ],
  "competition": "low|medium|high",
  "monetizationPotential": "low|medium|high",
  "competitors": [
    {
      "name": "<Competitor name>",
      "strengths": [
        "<strength 1>",
        "<strength 2>"
      ],
      "weaknesses": [
        "<weakness 1>",
        "<weakness 2>"
      ]
    }
  ],
  "gaps": [
    "<market gap or opportunity 1>",
    "<market gap or opportunity 2>",
    "<market gap or opportunity 3>"
  ]
}
```

## Guidelines
- Be realistic about market size - justify your estimates with the type of users and problem
- Competition should be "low" if this is a novel approach with few direct competitors
- Monetization potential should consider both willingness to pay and ability to capture value
- Include both direct competitors (similar products) and indirect alternatives (solving the same problem differently)
- Market gaps should be specific opportunities this product can exploit
- Acquisition channels should be practical for the given target users and budget
 "#;

const FEASIBILITY_ANALYSIS_TEMPLATE: &str = r#"You are a senior software architect and technical consultant. Analyze the technical feasibility of the given product idea.

## Product Idea
**Title**: {{ idea.title }}
**Summary**: {{ idea.summary }}

**What**: {{ idea.context.what }}
**Why**: {{ idea.context.why }}
**Key Features**:
{% for feature in idea.suggested_features %}
- {{ feature }}
{% endfor %}

**Suggested Tech Stack**:
{% for tech in idea.tech_stack %}
- {{ tech }}
{% endfor %}

## Project Type
{{ project_type }}

## Your Task
Provide a comprehensive technical feasibility analysis including:

1. **Feasibility Score** (0-100): Overall technical feasibility considering complexity, risk, and implementation challenges
2. **Complexity Level**: low, medium, or high
3. **Time Estimates**: Weeks for MVP, V1, and V2
4. **Required Skills**: Technical skills needed (frameworks, languages, domains)
5. **Risk Factors**: Key technical risks with mitigation strategies
6. **Simplified MVP** (if score < 70): A more achievable initial version

## Output Format
Output ONLY a valid JSON object with no additional text, no markdown formatting, and no trailing commas:

```json
{
  "feasibilityScore": <0-100 number>,
  "complexityLevel": "low|medium|high",
  "estimatedWeeks": {
    "mvp": <number, e.g., 4>,
    "v1": <number, e.g., 8>,
    "v2": <number, e.g., 12>
  },
  "requiredSkills": [
    "<skill 1, e.g., 'React/TypeScript'>",
    "<skill 2, e.g., 'PostgreSQL'>",
    "<skill 3>"
  ],
  "riskFactors": [
    {
      "risk": "<specific technical risk>",
      "mitigation": "<how to address this risk>"
    }
  ],
  "simplifiedMvp": {
    "id": "{{ idea.id }}-simplified",
    "title": "<Simpler title>",
    "summary": "<1-2 sentence overview of simplified approach>",
    "context": {
      "what": "<simplified what>",
      "why": "<same why>",
      "who": "<same who>",
      "done": "<simplified done criteria>",
      "notes": []
    },
    "suggestedFeatures": [
      "<reduced feature set>"
    ],
    "techStack": [
      "<simplified tech stack if different>"
    ]
  }
}
```

## Guidelines

### Feasibility Scoring
- **90-100**: Straightforward implementation, well-understood tech stack, minimal external dependencies
- **70-89**: Standard complexity, some challenging aspects, proven technologies
- **50-69**: Significant challenges, requires expertise, some uncertainty
- **30-49**: High complexity, many unknowns, cutting-edge or experimental tech
- **<30**: Extremely ambitious, requires breakthrough or major simplification

### Complexity Levels
- **Low**: Single developer, standard frameworks, no complex integrations
- **Medium**: Small team (2-3), some specialized knowledge, moderate integrations
- **High**: Multiple specialized skills, complex architecture, significant integrations

### Time Estimates
- MVP: Core value only, minimal polish, manual workarounds OK
- V1: Production-ready with core features, proper UX, basic scalability
- V2: Advanced features, optimization, polish, scalability

### When to Provide Simplified MVP
- Provide a simplified MVP idea if feasibility score is below 70
- The simplified version should:
  - Reduce feature scope to absolute minimum
  - Use more proven/established technologies
  - Eliminate or defer the most complex aspects
  - Still deliver core value proposition
- Don't simplify if the idea is already achievable (score >= 70)

### Risk Factors
Include risks like:
- Third-party API reliability
- Scalability challenges
- Security/privacy concerns
- Performance requirements
- Regulatory/compliance issues
- Technical expertise availability
- Integration complexity

Each risk must include a practical mitigation strategy.
 "#;

const BRAINSTORM_IDEAS_TEMPLATE: &str = r#"You are a creative product consultant helping users explore project ideas based on their interests.

## User's Interests
{% for interest in interests %}
- {{ interest }}
{% endfor %}

{% if domain %}
## Domain of Interest
{{ domain }}
{% endif %}

## Your Task
Generate {{ count }} diverse project ideas that align with the user's interests. Each idea should:

- Be inspired by the listed interests but not limited to them
- Span different complexity levels (mix of simple, moderate, and complex)
- Cover different types of projects (web app, CLI, API, library, etc. if appropriate)
- Be specific and implementable
- Include clear value propositions
- Suggest realistic tech stacks

## Idea Diversity
Generate ideas across these dimensions:
1. **Complexity**: Mix of weekend projects, month-long builds, and ambitious undertakings
2. **Novelty**: Some practical/utilitarian, some creative/experimental
3. **Scope**: From focused tools to comprehensive platforms
4. **Personal vs Professional**: Ideas for personal use vs commercial potential

## Output Format
Output ONLY a valid JSON array with no additional text, no markdown formatting, and no trailing commas:

```json
[
  {
    "id": "brainstorm-1",
    "title": "<Catchy title>",
    "summary": "<2-sentence overview>",
    "context": {
      "what": "<specific description>",
      "why": "<motivation or problem it solves>",
      "who": "<target users or just yourself>",
      "done": "<clear completion criteria>",
      "notes": []
    },
    "suggestedFeatures": [
      "<core feature 1>",
      "<feature 2>",
      "<feature 3>"
    ],
    "techStack": [
      "<appropriate tech>"
    ]
  }
]
```

## Guidelines
- Draw connections between interests in creative ways
- Don't just clone existing products - add unique angles
- Make sure ideas are actually buildable (not science fiction)
- Consider both learning projects and portfolio-worthy work
- Include a mix of established tech stacks and newer/interesting technologies
- Ideas should feel exciting and motivating to build
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
            // Skip templates that use different placeholders
            if name == REQUIREMENT_GENERATION {
                assert!(
                    template.contains("user_prompt") && template.contains("count"),
                    "Template '{}' should contain user_prompt and count placeholders",
                    name
                );
                continue;
            }
            if name == CONTEXT_QUALITY_ANALYSIS
                || name == CONTEXT_SUGGESTIONS
                || name == IDEA_STARTERS
                || name == CONTEXT_IMPROVEMENT
                || name == IDEA_VARIATIONS
                || name == MARKET_ANALYSIS
                || name == FEASIBILITY_ANALYSIS
            {
                assert!(
                    template.contains("context.") || template.contains("idea."),
                    "Template '{}' should contain context or idea placeholders",
                    name
                );
                continue;
            }
            // BRAINSTORM_IDEAS uses its own placeholders (interests, domain, count)
            if name == BRAINSTORM_IDEAS {
                assert!(
                    template.contains("interests")
                        || template.contains("domain")
                        || template.contains("count"),
                    "Template '{}' should contain interests, domain, or count placeholders",
                    name
                );
                continue;
            }
            // GSD questioning templates use different format
            if name == GSD_QUESTIONING_WEBAPP
                || name == GSD_QUESTIONING_CLI
                || name == GSD_QUESTIONING_API
            {
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
