// Error categorization utilities for task failures
import type { ErrorCategory, CategorizedError } from '@/types'

// Patterns for detecting error categories
const ERROR_PATTERNS: Array<{
  category: ErrorCategory
  patterns: RegExp[]
  suggestedFix?: string
}> = [
  {
    category: 'test_failure',
    patterns: [
      /test[s]?\s+failed/i,
      /assertion\s+error/i,
      /expect(ed)?\s*\(/i,
      /\bfailed\s+\d+\s+test/i,
      /\d+\s+test[s]?\s+failed/i,
      /FAIL\s+.*\.test\./i,
      /AssertionError/i,
      /Error:\s+expect\(/i,
      /toBe\(|toEqual\(|toHaveBeenCalled/i,
    ],
    suggestedFix: 'Review test assertions and fix the failing tests',
  },
  {
    category: 'lint_error',
    patterns: [
      /eslint|tslint|prettier/i,
      /lint\s+error/i,
      /warning:\s+.*\(.*-lint\)/i,
      /\d+\s+error[s]?,?\s+\d+\s+warning/i,
      /Parsing error:/i,
      /Unexpected token/i,
      /\brust(fmt|clippy)\b/i,
      /cargo\s+fmt\s+--\s+--check/i,
    ],
    suggestedFix: 'Run the linter/formatter and fix the reported issues',
  },
  {
    category: 'build_error',
    patterns: [
      /compile\s+error/i,
      /compilation\s+failed/i,
      /build\s+failed/i,
      /cannot\s+find\s+module/i,
      /module\s+not\s+found/i,
      /type\s+error/i,
      /syntax\s+error/i,
      /TS\d{4}:/i,  // TypeScript error codes
      /error\[E\d{4}\]/,  // Rust error codes
      /error:\s+cannot\s+find/i,
    ],
    suggestedFix: 'Fix the compilation errors by addressing type mismatches or missing imports',
  },
  {
    category: 'timeout',
    patterns: [
      /timeout/i,
      /timed?\s*out/i,
      /exceeded\s+.*\s*limit/i,
      /operation\s+took\s+too\s+long/i,
      /max\s+iterations\s+reached/i,
    ],
    suggestedFix: 'The task took too long. Consider breaking it into smaller subtasks or increasing the timeout',
  },
  {
    category: 'crash',
    patterns: [
      /segmentation\s+fault/i,
      /stack\s+overflow/i,
      /out\s+of\s+memory/i,
      /killed/i,
      /signal\s+\d+/i,
      /exit\s+code\s+[1-9]/i,
      /SIGTERM|SIGKILL|SIGSEGV/i,
      /process\s+exited\s+unexpectedly/i,
      /panic/i,
    ],
    suggestedFix: 'The process crashed unexpectedly. Check for infinite loops, excessive memory usage, or resource exhaustion',
  },
  {
    category: 'rate_limit',
    patterns: [
      /rate\s+limit/i,
      /too\s+many\s+requests/i,
      /429/,
      /throttl/i,
      /api\s+limit/i,
      /quota\s+exceeded/i,
    ],
    suggestedFix: 'API rate limit reached. Wait before retrying or reduce concurrency',
  },
  {
    category: 'conflict',
    patterns: [
      /merge\s+conflict/i,
      /conflict\s+in\s+file/i,
      /CONFLICT\s+\(content\)/,
      /cannot\s+merge/i,
      /conflict:\s+/i,
    ],
    suggestedFix: 'Git merge conflict detected. Resolve conflicts manually or use the conflict resolution tool',
  },
  {
    category: 'dependency',
    patterns: [
      /dependency\s+error/i,
      /missing\s+dependency/i,
      /package\s+not\s+found/i,
      /npm\s+ERR!/i,
      /yarn\s+error/i,
      /pip\s+install.*failed/i,
      /cargo.*failed\s+to\s+compile/i,
      /version\s+conflict/i,
      /peer\s+dependency/i,
    ],
    suggestedFix: 'Install missing dependencies or resolve version conflicts',
  },
]

// Extract file and line number from error message
function extractLocation(error: string): { file?: string; line?: number } {
  // Common patterns for file:line references
  const patterns = [
    /([^\s:]+):(\d+):\d+/,  // file:line:column
    /([^\s:]+):(\d+)/,       // file:line
    /at\s+([^\s:]+):(\d+)/,  // at file:line
    /in\s+([^\s:]+)\s+line\s+(\d+)/i,  // in file line N
  ]

  for (const pattern of patterns) {
    const match = error.match(pattern)
    if (match) {
      return {
        file: match[1],
        line: parseInt(match[2], 10),
      }
    }
  }

  return {}
}

// Extract first meaningful error message (skip stack traces)
function extractMessage(error: string): string {
  const lines = error.split('\n').filter(line => line.trim())

  // Find the first line that looks like an error message
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip stack trace lines
    if (trimmed.startsWith('at ') || trimmed.startsWith('  at ')) {
      continue
    }
    // Skip empty or very short lines
    if (trimmed.length < 10) {
      continue
    }
    return trimmed
  }

  // Fall back to first line, truncated
  return lines[0]?.slice(0, 200) || 'Unknown error'
}

/**
 * Categorize an error string into a structured error object
 */
export function categorizeError(error: string | null | undefined): CategorizedError | null {
  if (!error) return null

  const normalizedError = error.toLowerCase()

  // Try to match against known patterns
  for (const { category, patterns, suggestedFix } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedError) || pattern.test(error)) {
        const location = extractLocation(error)
        return {
          category,
          message: extractMessage(error),
          details: error.length > 200 ? error : undefined,
          suggestedFix,
          ...location,
        }
      }
    }
  }

  // Default to unknown
  return {
    category: 'unknown',
    message: extractMessage(error),
    details: error.length > 200 ? error : undefined,
    suggestedFix: 'Review the error details and fix the underlying issue',
  }
}

/**
 * Get display info for an error category
 */
export function getErrorCategoryInfo(category: ErrorCategory): {
  label: string
  color: string
  icon: string
  bgColor: string
} {
  switch (category) {
    case 'test_failure':
      return {
        label: 'Test Failure',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        icon: '🧪',
      }
    case 'lint_error':
      return {
        label: 'Lint Error',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        icon: '⚠️',
      }
    case 'build_error':
      return {
        label: 'Build Error',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        icon: '🔨',
      }
    case 'timeout':
      return {
        label: 'Timeout',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        icon: '⏱️',
      }
    case 'crash':
      return {
        label: 'Crash',
        color: 'text-red-700',
        bgColor: 'bg-red-200',
        icon: '💥',
      }
    case 'rate_limit':
      return {
        label: 'Rate Limited',
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        icon: '🚫',
      }
    case 'conflict':
      return {
        label: 'Merge Conflict',
        color: 'text-amber-600',
        bgColor: 'bg-amber-100',
        icon: '⚔️',
      }
    case 'dependency':
      return {
        label: 'Dependency Error',
        color: 'text-cyan-600',
        bgColor: 'bg-cyan-100',
        icon: '📦',
      }
    case 'unknown':
    default:
      return {
        label: 'Error',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        icon: '❓',
      }
  }
}

/**
 * Get a summary of errors by category
 */
export function categorizeErrors(errors: (string | null | undefined)[]): {
  categories: Map<ErrorCategory, CategorizedError[]>
  total: number
} {
  const categories = new Map<ErrorCategory, CategorizedError[]>()
  let total = 0

  for (const error of errors) {
    const categorized = categorizeError(error)
    if (categorized) {
      total++
      const existing = categories.get(categorized.category) || []
      existing.push(categorized)
      categories.set(categorized.category, existing)
    }
  }

  return { categories, total }
}
