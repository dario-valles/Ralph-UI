import type { PRDTypeValue } from '@/types'

/**
 * Workflow step for PRD type guidance
 */
export interface WorkflowStep {
  step: number
  title: string
  description: string
  /** Optional slash command hint */
  command?: string
}

/**
 * Quick command reference for PRD type
 */
export interface QuickCommand {
  command: string
  label: string
  description: string
}

/**
 * Type-specific guidance configuration
 */
export interface PRDTypeGuidance {
  /** Main title, e.g., "Let's fix that bug" */
  title: string
  /** Brief context/subtitle */
  subtitle: string
  /** Workflow steps */
  workflow: WorkflowStep[]
  /** Sample prompts to get started */
  samplePrompts: string[]
  /** Quick command references */
  quickCommands: QuickCommand[]
}

/**
 * Guidance content for each PRD type
 */
export const PRD_TYPE_GUIDANCE: Record<PRDTypeValue, PRDTypeGuidance> = {
  bug_fix: {
    title: "Let's squash that bug",
    subtitle: 'Document the issue and create a clear fix plan',
    workflow: [
      {
        step: 1,
        title: 'Describe the bug',
        description: 'Explain what happens and how to reproduce it',
      },
      {
        step: 2,
        title: 'Document behavior',
        description: "I'll help capture expected vs actual behavior",
      },
      {
        step: 3,
        title: 'Validate completeness',
        description: 'Use /critique to ensure nothing is missed',
        command: '/critique',
      },
      {
        step: 4,
        title: 'Generate tasks',
        description: 'Break down the fix into actionable tasks',
        command: '/task',
      },
    ],
    samplePrompts: [
      "The login button doesn't respond on mobile Safari",
      'API returns 500 error when submitting empty form',
      'Memory leak occurs after viewing 100+ items',
    ],
    quickCommands: [
      { command: '/critique', label: 'Critique', description: 'Validate requirements' },
      { command: '/task', label: 'Task', description: 'Generate fix tasks' },
      { command: '/story', label: 'Story', description: 'Create user story' },
    ],
  },

  refactoring: {
    title: 'Time to clean up the code',
    subtitle: 'Plan safe, incremental improvements',
    workflow: [
      {
        step: 1,
        title: 'Describe current state',
        description: 'Explain pain points and technical debt',
      },
      {
        step: 2,
        title: 'Define the goal',
        description: 'What should the code look like after refactoring?',
      },
      {
        step: 3,
        title: 'Document the change',
        description: 'Use /spec to capture current vs desired state',
        command: '/spec',
      },
      {
        step: 4,
        title: 'Plan incremental tasks',
        description: 'Break into safe, testable changes',
        command: '/task',
      },
    ],
    samplePrompts: [
      'The authentication module has grown too complex',
      'We need to migrate from callbacks to async/await',
      'Split the monolithic UserService into smaller services',
    ],
    quickCommands: [
      { command: '/spec', label: 'Spec', description: 'Current vs desired' },
      { command: '/task', label: 'Task', description: 'Generate tasks' },
      { command: '/critique', label: 'Critique', description: 'Validate plan' },
    ],
  },

  api_integration: {
    title: "Let's connect that API",
    subtitle: 'Plan authentication, data flow, and error handling',
    workflow: [
      {
        step: 1,
        title: 'Describe the API',
        description: 'What API and what functionality do you need?',
      },
      {
        step: 2,
        title: 'Document the flow',
        description: "I'll help plan authentication and data mapping",
      },
      {
        step: 3,
        title: 'Research best practices',
        description: 'Use /research to identify patterns and pitfalls',
        command: '/research',
      },
      {
        step: 4,
        title: 'Define edge cases',
        description: 'Plan error handling and rate limiting',
        command: '/criteria',
      },
    ],
    samplePrompts: [
      'Integrate Stripe for payment processing',
      'Connect to OpenAI API for text generation',
      'Sync user data with Salesforce CRM',
    ],
    quickCommands: [
      { command: '/research', label: 'Research', description: 'Best practices' },
      { command: '/criteria', label: 'Criteria', description: 'Acceptance criteria' },
      { command: '/story', label: 'Story', description: 'User stories' },
    ],
  },

  new_feature: {
    title: "Let's build something great",
    subtitle: 'Design, scope, and plan your new feature',
    workflow: [
      {
        step: 1,
        title: 'Describe the feature',
        description: 'What problem does it solve and for whom?',
      },
      {
        step: 2,
        title: 'Structure the work',
        description: 'Use /epic to organize into deliverables',
        command: '/epic',
      },
      {
        step: 3,
        title: 'Define stories',
        description: 'Break into user stories with acceptance criteria',
        command: '/story',
      },
      {
        step: 4,
        title: 'Validate scope',
        description: 'Use /critique to ensure completeness',
        command: '/critique',
      },
    ],
    samplePrompts: [
      'Add dark mode support to the app',
      'Implement real-time notifications',
      'Create a dashboard for analytics',
    ],
    quickCommands: [
      { command: '/epic', label: 'Epic', description: 'Structure work' },
      { command: '/story', label: 'Story', description: 'User stories' },
      { command: '/criteria', label: 'Criteria', description: 'Acceptance criteria' },
    ],
  },

  full_new_app: {
    title: "Let's design your application",
    subtitle: 'From vision to MVP scope',
    workflow: [
      {
        step: 1,
        title: 'Share your vision',
        description: 'Describe your app idea and target users',
      },
      {
        step: 2,
        title: 'Validate approach',
        description: 'Use /research to explore technical options',
        command: '/research',
      },
      {
        step: 3,
        title: 'Structure features',
        description: 'Organize into epics and milestones',
        command: '/epic',
      },
      {
        step: 4,
        title: 'Define MVP scope',
        description: 'Prioritize stories for initial release',
        command: '/story',
      },
    ],
    samplePrompts: [
      'A task management app for remote teams',
      'A recipe sharing platform with meal planning',
      'A CLI tool for managing Docker containers',
    ],
    quickCommands: [
      { command: '/epic', label: 'Epic', description: 'Major features' },
      { command: '/research', label: 'Research', description: 'Technical validation' },
      { command: '/spec', label: 'Spec', description: 'Architecture overview' },
    ],
  },

  general: {
    title: 'What are we building?',
    subtitle: 'Tell me about your project and requirements',
    workflow: [
      {
        step: 1,
        title: 'Describe your project',
        description: 'What are you building and why?',
      },
      {
        step: 2,
        title: 'Structure requirements',
        description: "I'll help organize into clear deliverables",
      },
      {
        step: 3,
        title: 'Use slash commands',
        description: 'Speed up common tasks with built-in commands',
        command: '/epic',
      },
      {
        step: 4,
        title: 'Export when ready',
        description: 'Generate a complete PRD for development',
      },
    ],
    samplePrompts: [
      'I need to document requirements for...',
      'Help me plan the technical approach for...',
      'What questions should I answer for this project?',
    ],
    quickCommands: [
      { command: '/epic', label: 'Epic', description: 'Structure work' },
      { command: '/story', label: 'Story', description: 'User stories' },
      { command: '/critique', label: 'Critique', description: 'Validate requirements' },
    ],
  },
}

/**
 * Get guidance for a specific PRD type
 */
export function getPRDTypeGuidance(prdType: PRDTypeValue): PRDTypeGuidance {
  return PRD_TYPE_GUIDANCE[prdType]
}
