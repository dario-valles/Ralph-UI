/**
 * Error type utilities for user-friendly error messages
 */

export enum ErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  API_LIMIT = 'api_limit',
  NOT_FOUND = 'not_found',
  PERMISSION_DENIED = 'permission_denied',
  VALIDATION_ERROR = 'validation_error',
  UNKNOWN = 'unknown',
}

export interface ErrorInfo {
  type: ErrorType
  title: string
  message: string
  canRetry: boolean
  retryDelay?: number // milliseconds
}

/**
 * Helper to append context to error message
 */
function appendContext(message: string, context?: string): string {
  return context ? `${message} (${context})` : message
}

/**
 * Get user-friendly error information based on error type
 */
export function getErrorInfo(error: unknown, context?: string): ErrorInfo {
  if (isNetworkError(error)) {
    return {
      type: ErrorType.NETWORK_ERROR,
      title: 'Connection Error',
      message: appendContext('Having trouble connecting. Please check your internet connection.', context),
      canRetry: true,
      retryDelay: 2000,
    }
  }

  if (isTimeoutError(error)) {
    return {
      type: ErrorType.TIMEOUT,
      title: 'Request Timed Out',
      message: appendContext('The request took too long to complete. Please try again.', context),
      canRetry: true,
      retryDelay: 1000,
    }
  }

  if (isApiLimitError(error)) {
    return {
      type: ErrorType.API_LIMIT,
      title: 'Too Many Requests',
      message: appendContext("You've hit the rate limit. Please wait a moment and try again.", context),
      canRetry: true,
      retryDelay: 5000,
    }
  }

  if (isPermissionError(error)) {
    return {
      type: ErrorType.PERMISSION_DENIED,
      title: 'Permission Denied',
      message: appendContext("You don't have permission to perform this action.", context),
      canRetry: false,
    }
  }

  if (isValidationError(error)) {
    return {
      type: ErrorType.VALIDATION_ERROR,
      title: 'Invalid Input',
      message: appendContext('Please check your input and try again.', context),
      canRetry: false,
    }
  }

  if (isNotFoundError(error)) {
    return {
      type: ErrorType.NOT_FOUND,
      title: 'Not Found',
      message: appendContext('The requested resource was not found.', context),
      canRetry: false,
    }
  }

  return {
    type: ErrorType.UNKNOWN,
    title: 'Something Went Wrong',
    message: appendContext('An unexpected error occurred. Please try again.', context),
    canRetry: true,
    retryDelay: 2000,
  }
}

/**
 * Check if error is a network error
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('failed to fetch')
    )
  }
  return false
}

/**
 * Check if error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('aborted') ||
      message.includes('deadline')
    )
  }
  return false
}

/**
 * Check if error is an API limit error
 */
function isApiLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      message.includes('quota exceeded')
    )
  }
  // Also check for HTTP status code
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return false
}

/**
 * Check if error is a permission error
 */
function isPermissionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('permission') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('401') ||
      message.includes('403')
    )
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status
    return status === 401 || status === 403
  }
  return false
}

/**
 * Check if error is a validation error
 */
function isValidationError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('malformed')
    )
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: number }).status === 400
  }
  return false
}

/**
 * Check if error is a not found error
 */
function isNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('not found') ||
      message.includes('no such') ||
      message.includes('404')
    )
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: number }).status === 404
  }
  return false
}

/**
 * Format error for display
 */
export function formatError(error: unknown, context?: string): string {
  const errorInfo = getErrorInfo(error, context)
  return `${errorInfo.title}: ${errorInfo.message}`
}

/**
 * Hook for retrying operations with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const errorInfo = getErrorInfo(error)

      // Don't retry if not allowed
      if (!errorInfo.canRetry) {
        throw error
      }

      // Don't retry on last attempt
      if (attempt < maxRetries - 1) {
        // Exponential backoff: baseDelay * 2^attempt
        const delay = (errorInfo.retryDelay || baseDelay) * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}
