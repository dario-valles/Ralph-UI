import { describe, it, expect } from 'vitest'
import { categorizeError, getErrorCategoryInfo, categorizeErrors } from '../error-categorization'

describe('error-categorization', () => {
  describe('categorizeError', () => {
    it('returns null for empty errors', () => {
      expect(categorizeError(null)).toBeNull()
      expect(categorizeError(undefined)).toBeNull()
      expect(categorizeError('')).toBeNull()
    })

    describe('test_failure', () => {
      it('detects test failures', () => {
        const result = categorizeError('FAIL src/components/Button.test.tsx')
        expect(result?.category).toBe('test_failure')
      })

      it('detects assertion errors', () => {
        const result = categorizeError('AssertionError: expected true to be false')
        expect(result?.category).toBe('test_failure')
      })

      it('detects expect() failures', () => {
        const result = categorizeError('Error: expect(received).toBe(expected)')
        expect(result?.category).toBe('test_failure')
      })

      it('detects "N tests failed" pattern', () => {
        const result = categorizeError('5 tests failed')
        expect(result?.category).toBe('test_failure')
      })
    })

    describe('lint_error', () => {
      it('detects eslint errors', () => {
        const result = categorizeError('eslint: 3 errors, 5 warnings')
        expect(result?.category).toBe('lint_error')
      })

      it('detects prettier errors', () => {
        const result = categorizeError('Prettier: formatting issues in 2 files')
        expect(result?.category).toBe('lint_error')
      })

      it('detects parsing errors', () => {
        const result = categorizeError('Parsing error: Unexpected token')
        expect(result?.category).toBe('lint_error')
      })
    })

    describe('build_error', () => {
      it('detects TypeScript errors', () => {
        const result = categorizeError("TS2322: Type 'string' is not assignable to type 'number'")
        expect(result?.category).toBe('build_error')
      })

      it('detects Rust errors', () => {
        const result = categorizeError('error[E0433]: failed to resolve')
        expect(result?.category).toBe('build_error')
      })

      it('detects module not found', () => {
        const result = categorizeError("Cannot find module './missing'")
        expect(result?.category).toBe('build_error')
      })

      it('detects compilation failed', () => {
        const result = categorizeError('Compilation failed with 3 errors')
        expect(result?.category).toBe('build_error')
      })
    })

    describe('timeout', () => {
      it('detects timeout errors', () => {
        const result = categorizeError('Operation timed out after 30 seconds')
        expect(result?.category).toBe('timeout')
      })

      it('detects max iterations', () => {
        const result = categorizeError('Max iterations reached: 100')
        expect(result?.category).toBe('timeout')
      })
    })

    describe('crash', () => {
      it('detects segmentation faults', () => {
        const result = categorizeError('Segmentation fault (core dumped)')
        expect(result?.category).toBe('crash')
      })

      it('detects signals', () => {
        const result = categorizeError('SIGKILL received')
        expect(result?.category).toBe('crash')
      })

      it('detects exit codes', () => {
        const result = categorizeError('Process exited with exit code 1')
        expect(result?.category).toBe('crash')
      })

      it('detects panic', () => {
        const result = categorizeError("thread 'main' panicked at")
        expect(result?.category).toBe('crash')
      })
    })

    describe('rate_limit', () => {
      it('detects rate limit errors', () => {
        const result = categorizeError('Rate limit exceeded')
        expect(result?.category).toBe('rate_limit')
      })

      it('detects 429 status', () => {
        const result = categorizeError('HTTP 429: Too Many Requests')
        expect(result?.category).toBe('rate_limit')
      })

      it('detects quota exceeded', () => {
        const result = categorizeError('API quota exceeded for today')
        expect(result?.category).toBe('rate_limit')
      })
    })

    describe('conflict', () => {
      it('detects merge conflicts', () => {
        const result = categorizeError('CONFLICT (content): Merge conflict in src/main.rs')
        expect(result?.category).toBe('conflict')
      })

      it('detects cannot merge', () => {
        const result = categorizeError('Cannot merge: local changes would be overwritten')
        expect(result?.category).toBe('conflict')
      })
    })

    describe('dependency', () => {
      it('detects npm errors', () => {
        const result = categorizeError('npm ERR! peer dependency conflict')
        expect(result?.category).toBe('dependency')
      })

      it('detects missing dependencies', () => {
        const result = categorizeError('Missing dependency: react@18.0.0')
        expect(result?.category).toBe('dependency')
      })

      it('detects version conflicts', () => {
        const result = categorizeError('Version conflict between packages')
        expect(result?.category).toBe('dependency')
      })
    })

    describe('unknown', () => {
      it('returns unknown for unrecognized errors', () => {
        const result = categorizeError('Something went wrong in the application')
        expect(result?.category).toBe('unknown')
      })
    })

    describe('message extraction', () => {
      it('extracts a meaningful message from error', () => {
        const result = categorizeError('FAIL src/test.tsx\nAssertionError: expected true')
        expect(result?.message).toBeTruthy()
        expect(result?.message.length).toBeGreaterThan(5)
      })

      it('includes details for long errors', () => {
        const longError = 'Error: '.padEnd(250, 'x')
        const result = categorizeError(longError)
        expect(result?.details).toBe(longError)
      })
    })
  })

  describe('getErrorCategoryInfo', () => {
    it('returns correct info for test_failure', () => {
      const info = getErrorCategoryInfo('test_failure')
      expect(info.label).toBe('Test Failure')
      expect(info.color).toContain('red')
    })

    it('returns correct info for lint_error', () => {
      const info = getErrorCategoryInfo('lint_error')
      expect(info.label).toBe('Lint Error')
      expect(info.color).toContain('yellow')
    })

    it('returns correct info for build_error', () => {
      const info = getErrorCategoryInfo('build_error')
      expect(info.label).toBe('Build Error')
      expect(info.color).toContain('orange')
    })

    it('returns correct info for unknown', () => {
      const info = getErrorCategoryInfo('unknown')
      expect(info.label).toBe('Error')
      expect(info.color).toContain('gray')
    })
  })

  describe('categorizeErrors', () => {
    it('groups multiple errors by category', () => {
      const errors = [
        '3 tests failed in the suite',
        'eslint: 3 errors, 2 warnings',
        'TS2322: Type string is not assignable',
        'rate limit exceeded - please wait',
        null,
        undefined,
      ]

      const result = categorizeErrors(errors)

      expect(result.total).toBe(4)
      expect(result.categories.has('test_failure')).toBe(true)
      expect(result.categories.has('lint_error')).toBe(true)
      expect(result.categories.has('build_error')).toBe(true)
      expect(result.categories.has('rate_limit')).toBe(true)
    })

    it('handles empty array', () => {
      const result = categorizeErrors([])
      expect(result.total).toBe(0)
      expect(result.categories.size).toBe(0)
    })

    it('handles all null/undefined', () => {
      const result = categorizeErrors([null, undefined, ''])
      expect(result.total).toBe(0)
    })
  })
})
