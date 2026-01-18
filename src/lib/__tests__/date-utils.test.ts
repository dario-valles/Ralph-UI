import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseBackendDate,
  formatBackendDate,
  formatBackendDateTime,
  formatBackendTime,
  formatBackendDateOnly,
  isToday,
  isWithinDays,
  formatRelativeTime,
  compareBackendDates,
  getMostRecentDate,
} from '../date-utils'

describe('date-utils', () => {
  describe('parseBackendDate', () => {
    it('should parse valid RFC3339 date string', () => {
      const dateStr = '2024-01-15T10:30:00Z'
      const result = parseBackendDate(dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result?.getUTCFullYear()).toBe(2024)
      expect(result?.getUTCMonth()).toBe(0) // January
      expect(result?.getUTCDate()).toBe(15)
    })

    it('should return null for undefined', () => {
      expect(parseBackendDate(undefined)).toBeNull()
    })

    it('should return null for null', () => {
      expect(parseBackendDate(null)).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parseBackendDate('')).toBeNull()
    })

    it('should return null for invalid date string', () => {
      expect(parseBackendDate('not-a-date')).toBeNull()
    })
  })

  describe('formatBackendDate', () => {
    it('should format date with default options', () => {
      const dateStr = '2024-01-15T10:30:00Z'
      const result = formatBackendDate(dateStr)
      expect(result).toContain('Jan')
      expect(result).toContain('15')
      expect(result).toContain('2024')
    })

    it('should return empty string for null', () => {
      expect(formatBackendDate(null)).toBe('')
    })

    it('should return empty string for undefined', () => {
      expect(formatBackendDate(undefined)).toBe('')
    })

    it('should return empty string for invalid date', () => {
      expect(formatBackendDate('invalid')).toBe('')
    })
  })

  describe('formatBackendDateTime', () => {
    it('should format date with time', () => {
      const dateStr = '2024-01-15T14:30:00Z'
      const result = formatBackendDateTime(dateStr)
      expect(result).toContain('Jan')
      expect(result).toContain('15')
      expect(result).toContain('2024')
    })

    it('should return empty string for null', () => {
      expect(formatBackendDateTime(null)).toBe('')
    })
  })

  describe('formatBackendTime', () => {
    it('should format only time portion', () => {
      const dateStr = '2024-01-15T14:30:00Z'
      const result = formatBackendTime(dateStr)
      // Result should contain time but not date
      expect(result).not.toContain('Jan')
      expect(result).not.toContain('2024')
    })

    it('should return empty string for null', () => {
      expect(formatBackendTime(null)).toBe('')
    })
  })

  describe('formatBackendDateOnly', () => {
    it('should format only date portion', () => {
      const dateStr = '2024-01-15T14:30:00Z'
      const result = formatBackendDateOnly(dateStr)
      expect(result).toContain('Jan')
      expect(result).toContain('15')
      expect(result).toContain('2024')
    })

    it('should return empty string for null', () => {
      expect(formatBackendDateOnly(null)).toBe('')
    })
  })

  describe('isToday', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for today', () => {
      expect(isToday('2024-01-15T10:30:00Z')).toBe(true)
    })

    it('should return false for yesterday', () => {
      expect(isToday('2024-01-14T10:30:00Z')).toBe(false)
    })

    it('should return false for null', () => {
      expect(isToday(null)).toBe(false)
    })
  })

  describe('isWithinDays', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for date within range', () => {
      expect(isWithinDays('2024-01-13T10:30:00Z', 7)).toBe(true)
    })

    it('should return false for date outside range', () => {
      expect(isWithinDays('2024-01-01T10:30:00Z', 7)).toBe(false)
    })

    it('should return false for null', () => {
      expect(isWithinDays(null, 7)).toBe(false)
    })

    it('should return false for future dates', () => {
      expect(isWithinDays('2024-01-20T10:30:00Z', 7)).toBe(false)
    })
  })

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "just now" for very recent', () => {
      expect(formatRelativeTime('2024-01-15T11:59:50Z')).toBe('just now')
    })

    it('should return minutes ago', () => {
      expect(formatRelativeTime('2024-01-15T11:30:00Z')).toBe('30m ago')
    })

    it('should return hours ago', () => {
      expect(formatRelativeTime('2024-01-15T09:00:00Z')).toBe('3h ago')
    })

    it('should return "yesterday"', () => {
      expect(formatRelativeTime('2024-01-14T12:00:00Z')).toBe('yesterday')
    })

    it('should return days ago for recent dates', () => {
      expect(formatRelativeTime('2024-01-12T12:00:00Z')).toBe('3d ago')
    })

    it('should return formatted date for older dates', () => {
      const result = formatRelativeTime('2024-01-01T12:00:00Z')
      expect(result).toContain('Jan')
      expect(result).toContain('1')
    })

    it('should return empty string for null', () => {
      expect(formatRelativeTime(null)).toBe('')
    })
  })

  describe('compareBackendDates', () => {
    it('should return negative when a < b', () => {
      expect(compareBackendDates('2024-01-14T12:00:00Z', '2024-01-15T12:00:00Z')).toBeLessThan(0)
    })

    it('should return positive when a > b', () => {
      expect(compareBackendDates('2024-01-15T12:00:00Z', '2024-01-14T12:00:00Z')).toBeGreaterThan(0)
    })

    it('should return 0 when equal', () => {
      expect(compareBackendDates('2024-01-15T12:00:00Z', '2024-01-15T12:00:00Z')).toBe(0)
    })

    it('should handle null values', () => {
      expect(compareBackendDates(null, null)).toBe(0)
      expect(compareBackendDates(null, '2024-01-15T12:00:00Z')).toBe(-1)
      expect(compareBackendDates('2024-01-15T12:00:00Z', null)).toBe(1)
    })
  })

  describe('getMostRecentDate', () => {
    it('should return the most recent date', () => {
      const result = getMostRecentDate(
        '2024-01-14T12:00:00Z',
        '2024-01-15T12:00:00Z',
        '2024-01-13T12:00:00Z'
      )
      expect(result).toBe('2024-01-15T12:00:00Z')
    })

    it('should handle null values', () => {
      const result = getMostRecentDate(null, '2024-01-15T12:00:00Z', undefined)
      expect(result).toBe('2024-01-15T12:00:00Z')
    })

    it('should return null when all values are null', () => {
      expect(getMostRecentDate(null, undefined)).toBeNull()
    })
  })
})
