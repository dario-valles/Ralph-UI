import type { PRDTypeValue } from '@/types'

export type WorkflowMode = 'guided' | 'gsd'

export interface PRDTypeConfig {
  value: PRDTypeValue
  label: string
  description: string
  icon: string
  color: string
  /** Which workflow modes this type supports */
  supportedModes: WorkflowMode[]
  /** Whether this type is recommended for GSD mode */
  gsdRecommended?: boolean
  /** Warning message to show when this type is used in GSD mode */
  gsdWarning?: string
}

/**
 * Centralized configuration for PRD types.
 * This is the single source of truth for PRD type definitions.
 * Used by PRDTypeSelector, backend validation, and other components.
 */
export const PRD_TYPES: PRDTypeConfig[] = [
  {
    value: 'new_feature',
    label: 'New Feature',
    description: 'Build something new from scratch',
    icon: 'Sparkles',
    color: 'text-blue-500',
    supportedModes: ['guided', 'gsd'],
  },
  {
    value: 'full_new_app',
    label: 'Full New App',
    description: 'Design and plan an entirely new application',
    icon: 'Rocket',
    color: 'text-amber-500',
    supportedModes: ['guided', 'gsd'],
    gsdRecommended: true,
  },
  {
    value: 'bug_fix',
    label: 'Bug Fix',
    description: 'Fix an existing problem or issue',
    icon: 'Bug',
    color: 'text-red-500',
    supportedModes: ['guided'],
    gsdWarning: 'Full workflow is overkill for bug fixes. Use Guided Interview instead.',
  },
  {
    value: 'refactoring',
    label: 'Refactoring',
    description: 'Improve code without changing behavior',
    icon: 'RefreshCw',
    color: 'text-green-500',
    supportedModes: ['guided'],
    gsdWarning: 'Full workflow is overkill for refactoring. Use Guided Interview instead.',
  },
  {
    value: 'api_integration',
    label: 'API Integration',
    description: 'Integrate with external APIs or services',
    icon: 'Link',
    color: 'text-purple-500',
    supportedModes: ['guided'],
    gsdWarning: 'API integrations benefit from focused guidance. Use Guided Interview instead.',
  },
  {
    value: 'general',
    label: 'General',
    description: 'Other product requirements',
    icon: 'FileText',
    color: 'text-gray-500',
    supportedModes: ['guided'],
    gsdWarning:
      'General requirements are too vague for GSD workflow. Use Guided Interview instead.',
  },
]

/**
 * Get PRD type config by value
 */
export function getPRDTypeConfig(value: PRDTypeValue): PRDTypeConfig | undefined {
  return PRD_TYPES.find((t) => t.value === value)
}

/**
 * Get display label for a PRD type
 */
export function getPRDTypeLabel(value: PRDTypeValue): string {
  return getPRDTypeConfig(value)?.label || value
}

/**
 * Get all PRD type values
 */
export function getAllPRDTypeValues(): PRDTypeValue[] {
  return PRD_TYPES.map((t) => t.value)
}

/**
 * Validate if a string is a valid PRD type
 */
export function isValidPRDType(value: string): value is PRDTypeValue {
  return PRD_TYPES.some((t) => t.value === value)
}

/**
 * Get PRD types filtered by workflow mode
 */
export function getPRDTypesForMode(mode: WorkflowMode): PRDTypeConfig[] {
  return PRD_TYPES.filter((t) => t.supportedModes.includes(mode))
}

/**
 * Check if a PRD type supports a given workflow mode
 */
export function typeSupportsMode(value: PRDTypeValue, mode: WorkflowMode): boolean {
  const config = getPRDTypeConfig(value)
  return config?.supportedModes.includes(mode) ?? false
}
