import {
  Layers,
  FileText,
  CheckSquare,
  Sparkles,
  Search,
  Lightbulb,
  FileCode,
  ListChecks,
  GitCompare,
  GitBranch,
  MessageSquare,
  CheckCircle,
  Network,
  FileSliders,
  Microscope,
  Workflow,
} from 'lucide-react'
import type { ChatCommandConfig } from '@/types'

/**
 * Slash command action types
 */
export type SlashCommandType = 'template' | 'action'

/**
 * Action kinds for action-based commands
 */
export type SlashCommandActionKind =
  | 'invoke' // Invoke a backend command
  | 'modal' // Open a modal dialog
  | 'inline' // Execute inline and show result in chat

/**
 * Action configuration for action-based commands
 */
export interface SlashCommandAction {
  kind: SlashCommandActionKind
  /** Backend command to invoke (for 'invoke' kind) */
  cmd?: string
  /** Arguments for the command */
  args?: Record<string, unknown>
  /** Modal component to open (for 'modal' kind) */
  modalId?: string
}

/**
 * Slash command definition
 */
export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  /** Command type: template inserts text, action executes behavior */
  type: SlashCommandType
  /** Template text to insert (for template commands) */
  template?: string
  /** Action configuration (for action commands) */
  action?: SlashCommandAction
  /** Whether this command requires an active workflow */
  requiresWorkflow?: boolean
  /** Whether this command requires an existing codebase */
  requiresCodebase?: boolean
}

/**
 * Result type for action commands
 */
export interface SlashCommandResult {
  success: boolean
  message?: string
  data?: unknown
  error?: string
}

/**
 * Available slash commands
 *
 * Commands are organized by type:
 * - High-value AI prompts: /ideas, /research, /agents, /criteria, /spec
 * - Hybrid commands: /critique (sends message to AI)
 * - Template commands: /epic, /story, /task
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  // ==========================================================================
  // High-Value AI Prompt Commands
  // ==========================================================================
  {
    id: 'ideas',
    label: 'Ideas',
    description: 'Analyze codebase and suggest specific improvements',
    icon: <Lightbulb className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Analyze this codebase and provide SPECIFIC, ACTIONABLE improvements.

For EACH suggestion, you MUST provide:
1. **File path(s)** affected
2. **Current problem** (cite specific lines if possible)
3. **Proposed solution** (concrete steps, not vague advice)
4. **Effort estimate** (minutes/hours/days)
5. **Impact** (what specifically improves: performance, readability, maintainability, etc.)

## Categories to Analyze

### Quick Wins (< 1 hour)
- Unused imports, dead code, missing error handling
- TODO/FIXME comments that should be addressed
- Inconsistent naming or formatting

### Refactoring (1-8 hours)
- Code duplication (show the duplicated code locations)
- Functions that are too long or complex
- Missing abstractions that would simplify code

### Architecture (> 1 day)
- Performance bottlenecks (cite evidence)
- Scalability concerns
- Technical debt patterns

## Rules
- Do NOT suggest vague improvements like "add more tests" or "improve error handling"
- Each suggestion MUST be immediately actionable with a clear first step
- If you can't cite a specific file/line, the suggestion isn't specific enough`,
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Research and analyze requirements',
    icon: <Search className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please research and analyze the requirements we've discussed. Consider:

## Architecture
- System design and component structure
- Integration points and data flow

## Best Practices
- Industry patterns for similar features
- Security and performance considerations

## Risks & Challenges
- Technical complexity
- Potential blockers
- Edge cases to consider

Provide a comprehensive analysis to inform the implementation plan.`,
  },
  {
    id: 'agents',
    label: 'AGENTS.md',
    description: 'Generate AGENTS.md for AI coding agents',
    icon: <FileCode className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please generate an AGENTS.md file for this project. Include:

## Setup
- Build commands
- Test commands
- Lint commands

## Code Conventions
- Framework patterns (e.g., React, Vue)
- State management approach
- Component organization

## Architecture
- Frontend/Backend structure
- Key directories and their purposes

## Testing
- Test framework
- Test organization
- Coverage requirements

Format as a valid AGENTS.md that AI coding agents can use for context.`,
  },
  {
    id: 'criteria',
    label: 'Criteria',
    description: 'Generate BDD acceptance criteria',
    icon: <ListChecks className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please generate BDD-style acceptance criteria for the feature we're discussing. Use Given/When/Then format:

\`\`\`gherkin
Feature: [Feature Name]

Scenario: Happy path
  Given [precondition]
  When [action]
  Then [expected result]

Scenario: Error handling
  Given [precondition]
  When [error condition]
  Then [error handling]
\`\`\`

Include scenarios for:
- Happy path
- Error handling
- Edge cases
- Validation rules`,
  },
  {
    id: 'spec',
    label: 'Spec',
    description: 'Analyze current → desired state',
    icon: <GitCompare className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please analyze the current state vs desired state for this feature:

## Current State
- What exists today
- Current user flow
- Existing code patterns

## Desired State
- What should exist after implementation
- New user flow
- Required code changes

## Gap Analysis
- What needs to change
- New components/modules needed
- Data model changes
- API changes

This will help clarify the implementation scope.`,
  },
  {
    id: 'verify',
    label: 'Verify',
    description: 'Verify requirements completeness and quality',
    icon: <CheckCircle className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please verify the requirements in the PRD against this quality checklist:

## Completeness Check
- [ ] Every user story has acceptance criteria
- [ ] Edge cases documented (empty states, max limits, errors)
- [ ] Error handling defined for each feature
- [ ] Success metrics are quantifiable

## Specificity Check
- [ ] No vague terms ("fast", "easy", "simple") - all values are measurable
- [ ] Response times, limits, and thresholds are explicit
- [ ] User actions are described step-by-step

## Consistency Check
- [ ] No conflicting requirements
- [ ] Terminology is used consistently
- [ ] Dependencies between stories are explicit

## Testability Check
- [ ] Each acceptance criterion can be verified by a test
- [ ] Expected vs actual behavior is clear
- [ ] Boundary conditions are defined

For EACH failed check:
1. Cite the specific requirement that fails
2. Explain why it fails the check
3. Provide a concrete suggestion to fix it

If all checks pass, confirm the PRD is ready for implementation.`,
  },
  {
    id: 'template',
    label: 'PRD Template',
    description: 'Insert comprehensive 11-section PRD template',
    icon: <FileSliders className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please generate a comprehensive PRD using this 11-section template structure:

# PRD: [Project Name]

## 1. Executive Summary
<!-- 2-3 sentences: problem + solution + expected impact with measurable outcome -->

## 2. Problem Statement
### Current Situation
### User Impact
- **Who is affected:** [Specific user segments]
- **How they're affected:** [Pain points with examples]
- **Severity:** [Critical/High/Medium with evidence]

### Business Impact
- **Cost of problem:** [Quantified]
- **Opportunity cost:** [What's being missed]

## 3. Goals & Success Metrics
<!-- Use SMART format with specific numbers -->
| Goal | Metric | Baseline | Target | Timeframe |
|------|--------|----------|--------|-----------|

## 4. User Stories
<!-- Each story needs 3+ acceptance criteria -->
#### US-1.1: [Title]
**As a** [user], **I want** [action], **So that** [benefit].
**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]
**Effort:** [S|M|L] **Depends on:** [US-X.X or None]

## 5. Functional Requirements
<!-- Numbered, prioritized: Must/Should/Could -->
### REQ-001: [Title] (Must Have)
**Task Breakdown:**
- Task 1.1: [Description] (Small: 2-4h)
- Task 1.2: [Description] (Medium: 4-8h)

## 6. Non-Functional Requirements
<!-- Specific numbers only - no "fast" or "scalable" -->
- **Response time:** < [X]ms p95
- **Concurrent users:** [X] users
- **Uptime:** [X]%

## 7. Technical Considerations
### Architecture
### API Specifications
### Database Schema

## 8. Implementation Roadmap
### Phase 1: [Name] (Week X-Y)
| Task | Description | Effort | Depends On |
**Checkpoint:** [What to test]

## 9. Out of Scope
- [Item]: [Reason]

## 10. Open Questions & Risks
| Risk | Likelihood | Impact | Mitigation |

## 11. Validation Checkpoints
- [ ] After Phase 1: [Criteria]
- [ ] Before Launch: [Criteria]

Fill in this template based on our discussion, using specific numbers and measurable criteria throughout.`,
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    description: 'Analyze and visualize story dependencies',
    icon: <Network className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Analyze the story dependencies in the PRD and provide:

## Dependency Graph
Create a Mermaid diagram showing story dependencies:

\`\`\`mermaid
graph TD
    US-1.1["US-1.1: Story Title"]
    US-1.2["US-1.2: Another Story"]
    US-1.1 --> US-1.2
\`\`\`

## Critical Path
Identify the longest dependency chain that determines the minimum timeline.
List each story in the critical path with its effort estimate.

## Parallelization Opportunities
Which stories can be worked on simultaneously by different developers?
Group stories into "parallel tracks" that have no dependencies on each other.

## Recommended Execution Order
Provide a numbered list of stories in the order they should be implemented:
1. **[US-X.X]** - [Reason: no dependencies, unblocks X other stories]
2. **[US-X.X]** - [Reason: depends only on completed stories]
...

## Dependency Risks
- Are there any circular dependencies?
- Are there bottleneck stories that block many others?
- Any stories with unclear dependencies?`,
  },

  // ==========================================================================
  // Hybrid Commands (Template + AI Processing)
  // ==========================================================================
  {
    id: 'critique',
    label: 'Critique',
    description: 'Ask for a critique of the current PRD',
    icon: <Sparkles className="h-4 w-4 mr-2" />,
    type: 'template',
    template: 'Please critique the current requirements for clarity, completeness, and feasibility.',
  },
  {
    id: 'parallel-prep',
    label: 'Parallel Prep',
    description: 'Optimize PRD for parallel execution',
    icon: <Workflow className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Analyze this PRD for parallel execution optimization.

## Current Dependency Analysis
1. List all stories and their dependencies
2. Identify bottleneck stories (blocking 3+ others)
3. Find over-dependent stories that could be independent

## Parallelization Recommendations
For each story that could be parallelized:
- Current: depends on [X, Y, Z]
- Suggested: depends on [X only] or [independent]
- Rationale: why this dependency can be removed

## Parallel Execution Plan
Create a Mermaid diagram showing execution waves:

\`\`\`mermaid
gantt
    title Parallel Execution Waves
    dateFormat X
    axisFormat %s
    section Wave 1 (Parallel)
    Story-1: 0, 1
    Story-2: 0, 1
    section Wave 2 (Parallel)
    Story-3: 1, 2
\`\`\`

## Summary
- Stories ready for Wave 1: [list]
- Total execution waves: [N]
- Estimated speedup vs sequential: [X%]`,
  },

  // ==========================================================================
  // Template Commands (Insert Text)
  // ==========================================================================
  {
    id: 'epic',
    label: 'Epic',
    description: 'Insert an Epic template',
    icon: <Layers className="h-4 w-4 mr-2" />,
    type: 'template',
    template: '### Epic: [Title]\n**Description:** [Description]\n',
  },
  {
    id: 'story',
    label: 'User Story',
    description: 'Insert a User Story template',
    icon: <FileText className="h-4 w-4 mr-2" />,
    type: 'template',
    template:
      '#### US-X.X: [Title]\n**As a** [user],\n**I want** [action],\n**So that** [benefit].\n\n**Acceptance Criteria:**\n- [Criterion 1]\n',
  },
  {
    id: 'story-dep',
    label: 'Story with Dependencies',
    description: 'Insert a User Story template with dependency syntax',
    icon: <GitBranch className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `#### US-X.X: [Title]
**Depends on:** [US-1.1, US-1.2]
**As a** [user],
**I want** [action],
**So that** [benefit].

**Acceptance Criteria:**
- [Criterion 1]
- [Criterion 2]

**Effort:** [S/M/L/XL]
`,
  },
  {
    id: 'task',
    label: 'Task',
    description: 'Insert a Task template',
    icon: <CheckSquare className="h-4 w-4 mr-2" />,
    type: 'template',
    template: '- [ ] Task: [Title]\n',
  },
  // ==========================================================================
  // Ultra Research Command
  // ==========================================================================
  {
    id: 'ultra-research',
    label: 'Ultra Research',
    description: 'Start multi-agent deep research session',
    icon: <Microscope className="h-4 w-4 mr-2" />,
    type: 'action',
    action: {
      kind: 'modal',
      modalId: 'ultra-research-config',
    },
    requiresCodebase: true,
  },
]

/**
 * Get a slash command by ID
 */
export function getSlashCommand(id: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((cmd) => cmd.id === id)
}

/**
 * Filter commands by type
 */
export function getCommandsByType(type: SlashCommandType): SlashCommand[] {
  return SLASH_COMMANDS.filter((cmd) => cmd.type === type)
}

/**
 * Check if a command is an action command
 */
export function isActionCommand(command: SlashCommand): boolean {
  return command.type === 'action'
}

/**
 * Check if a command is a template command
 */
export function isTemplateCommand(command: SlashCommand): boolean {
  return command.type === 'template'
}

/**
 * Filter commands based on context
 */
export function getAvailableCommands(options: {
  hasWorkflow?: boolean
  hasCodebase?: boolean
}): SlashCommand[] {
  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.requiresWorkflow && !options.hasWorkflow) return false
    if (cmd.requiresCodebase && !options.hasCodebase) return false
    return true
  })
}

/**
 * Icon mapping for command IDs
 * Used to display icons for both builtin and custom commands
 */
export const COMMAND_ICONS: Record<string, React.ReactNode> = {
  ideas: <Lightbulb className="h-4 w-4 mr-2" />,
  research: <Search className="h-4 w-4 mr-2" />,
  agents: <FileCode className="h-4 w-4 mr-2" />,
  criteria: <ListChecks className="h-4 w-4 mr-2" />,
  spec: <GitCompare className="h-4 w-4 mr-2" />,
  verify: <CheckCircle className="h-4 w-4 mr-2" />,
  dependencies: <Network className="h-4 w-4 mr-2" />,
  template: <FileSliders className="h-4 w-4 mr-2" />,
  critique: <Sparkles className="h-4 w-4 mr-2" />,
  'parallel-prep': <Workflow className="h-4 w-4 mr-2" />,
  epic: <Layers className="h-4 w-4 mr-2" />,
  story: <FileText className="h-4 w-4 mr-2" />,
  'story-dep': <GitBranch className="h-4 w-4 mr-2" />,
  task: <CheckSquare className="h-4 w-4 mr-2" />,
  'ultra-research': <Microscope className="h-4 w-4 mr-2" />,
}

/**
 * Default icon for custom commands
 */
const DEFAULT_COMMAND_ICON = <MessageSquare className="h-4 w-4 mr-2" />

/**
 * Get icon for a command by ID
 */
export function getCommandIcon(commandId: string): React.ReactNode {
  return COMMAND_ICONS[commandId] ?? DEFAULT_COMMAND_ICON
}

/**
 * Convert a ChatCommandConfig (from backend) to a SlashCommand (for UI)
 */
export function configToSlashCommand(config: ChatCommandConfig): SlashCommand {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    icon: getCommandIcon(config.id),
    type: 'template',
    template: config.template,
  }
}

/**
 * Convert multiple ChatCommandConfigs to SlashCommands
 */
export function configsToSlashCommands(configs: ChatCommandConfig[]): SlashCommand[] {
  return configs.map(configToSlashCommand)
}
