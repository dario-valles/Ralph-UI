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
    description: 'Analyze codebase and suggest improvements',
    icon: <Lightbulb className="h-4 w-4 mr-2" />,
    type: 'template',
    template: `Please analyze the codebase and suggest improvements in the following categories:

## Quick Wins (< 1 hour)
- TODOs, dead code, missing docs

## Refactoring Opportunities (1-8 hours)
- Code duplication, complexity, better abstractions

## Architecture Improvements (> 1 day)
- Patterns, performance, scalability

## Feature Ideas
- Natural extensions based on existing code patterns

Focus on actionable, specific suggestions with file paths where relevant.`,
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
  critique: <Sparkles className="h-4 w-4 mr-2" />,
  epic: <Layers className="h-4 w-4 mr-2" />,
  story: <FileText className="h-4 w-4 mr-2" />,
  'story-dep': <GitBranch className="h-4 w-4 mr-2" />,
  task: <CheckSquare className="h-4 w-4 mr-2" />,
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
