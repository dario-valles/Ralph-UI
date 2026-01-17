import '@testing-library/jest-dom'
import { toHaveNoViolations } from 'jest-axe'
import { expect } from 'vitest'

// Extend Vitest's expect with jest-axe matchers
expect.extend(toHaveNoViolations)
