/**
 * Date utilities for handling backend RFC3339 timestamps
 *
 * The backend sends timestamps as RFC3339 strings. These utilities
 * provide consistent parsing and formatting across the application.
 */

/**
 * Parse an RFC3339 timestamp string from the backend to a Date object
 * @param dateStr - RFC3339 formatted date string or undefined
 * @returns Date object or null if input is falsy/invalid
 */
export function parseBackendDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Format a backend date string for display
 * @param dateStr - RFC3339 formatted date string
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string or empty string if invalid
 */
export function formatBackendDate(
  dateStr: string | undefined | null,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = parseBackendDate(dateStr)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

/**
 * Format a backend date string as a full date and time
 * @param dateStr - RFC3339 formatted date string
 * @returns Formatted date and time string
 */
export function formatBackendDateTime(dateStr: string | undefined | null): string {
  return formatBackendDate(dateStr, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Format a backend date string as just the time
 * @param dateStr - RFC3339 formatted date string
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatBackendTime(dateStr: string | undefined | null): string {
  return formatBackendDate(dateStr, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Format a backend date string as a localized date only
 * @param dateStr - RFC3339 formatted date string
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export function formatBackendDateOnly(dateStr: string | undefined | null): string {
  return formatBackendDate(dateStr, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Check if a backend date string represents today's date
 * @param dateStr - RFC3339 formatted date string
 * @returns true if the date is today
 */
export function isToday(dateStr: string | undefined | null): boolean {
  const date = parseBackendDate(dateStr)
  if (!date) return false
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

/**
 * Check if a backend date string represents a date within the last N days
 * @param dateStr - RFC3339 formatted date string
 * @param days - Number of days to check
 * @returns true if the date is within the last N days
 */
export function isWithinDays(dateStr: string | undefined | null, days: number): boolean {
  const date = parseBackendDate(dateStr)
  if (!date) return false
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= days
}

/**
 * Get a relative time string (e.g., "2 hours ago", "yesterday")
 * @param dateStr - RFC3339 formatted date string
 * @returns Relative time string
 */
export function formatRelativeTime(dateStr: string | undefined | null): string {
  const date = parseBackendDate(dateStr)
  if (!date) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return formatBackendDateOnly(dateStr)
}

/**
 * Compare two backend date strings
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareBackendDates(
  a: string | undefined | null,
  b: string | undefined | null
): number {
  const dateA = parseBackendDate(a)
  const dateB = parseBackendDate(b)

  if (!dateA && !dateB) return 0
  if (!dateA) return -1
  if (!dateB) return 1

  return dateA.getTime() - dateB.getTime()
}

/**
 * Get the most recent of multiple backend date strings
 * @param dates - Array of RFC3339 formatted date strings
 * @returns The most recent date string, or null if all are invalid
 */
export function getMostRecentDate(...dates: (string | undefined | null)[]): string | null {
  let mostRecent: string | null = null
  let mostRecentTime = -Infinity

  for (const dateStr of dates) {
    const date = parseBackendDate(dateStr)
    if (date && date.getTime() > mostRecentTime) {
      mostRecentTime = date.getTime()
      mostRecent = dateStr ?? null
    }
  }

  return mostRecent
}
