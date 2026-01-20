//! Retry Logic with Exponential Backoff
//!
//! Implements retry patterns from Ralphy CLI for handling transient errors
//! like rate limits, timeouts, and network issues.

use std::future::Future;
use std::time::Duration;

/// Patterns that indicate a retryable error (from Ralphy CLI)
/// Note: All patterns must be lowercase since we lowercase the error before matching
pub const RETRYABLE_PATTERNS: &[&str] = &[
    "rate limit",
    "too many requests",
    "429",
    "timeout",
    "network",
    "connection",
    "econnreset",
    "etimedout",
    "enotfound",
    "overloaded",
    "capacity",
    "temporarily unavailable",
    "service unavailable",
    "503",
    "502",
    "500",
];

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts (default: 3)
    pub max_attempts: u32,
    /// Initial delay in milliseconds (default: 1000)
    pub initial_delay_ms: u64,
    /// Maximum delay in milliseconds (default: 30000)
    pub max_delay_ms: u64,
    /// Backoff multiplier (default: 2.0)
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
        }
    }
}

/// Result of a retry operation
#[derive(Debug)]
pub struct RetryResult<T> {
    /// The successful result (if any)
    pub result: Result<T, String>,
    /// Number of attempts made
    pub attempts: u32,
    /// Total time spent retrying (including delays)
    pub total_retry_time_ms: u64,
    /// Whether the final attempt was a retry (not the first attempt)
    pub was_retried: bool,
}

/// Check if an error message indicates a retryable condition
pub fn is_retryable_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    RETRYABLE_PATTERNS.iter().any(|p| lower.contains(p))
}

/// Classify an error into a category
#[derive(Debug, Clone, PartialEq)]
pub enum ErrorCategory {
    /// Can be retried (rate limit, timeout, network)
    Retryable,
    /// Should not be retried (auth error, invalid input)
    Fatal,
    /// Unknown error type
    Unknown,
}

/// Classify an error based on its message
pub fn classify_error(error: &str) -> ErrorCategory {
    if is_retryable_error(error) {
        ErrorCategory::Retryable
    } else if error.to_lowercase().contains("auth")
        || error.to_lowercase().contains("permission")
        || error.to_lowercase().contains("invalid")
        || error.to_lowercase().contains("not found")
    {
        ErrorCategory::Fatal
    } else {
        ErrorCategory::Unknown
    }
}

/// Execute an async operation with retry logic
///
/// # Arguments
/// * `operation` - A closure that returns a Future with Result<T, String>
/// * `config` - Retry configuration
/// * `on_retry` - Optional callback invoked before each retry attempt
///
/// # Returns
/// RetryResult containing the final result and retry statistics
pub async fn with_retry<F, Fut, T, R>(
    operation: F,
    config: &RetryConfig,
    mut on_retry: Option<R>,
) -> RetryResult<T>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, String>>,
    R: FnMut(u32, &str, u64),
{
    let mut attempts = 0u32;
    let mut total_retry_time_ms = 0u64;
    let mut current_delay_ms = config.initial_delay_ms;

    loop {
        attempts += 1;
        let result = operation().await;

        match result {
            Ok(value) => {
                return RetryResult {
                    result: Ok(value),
                    attempts,
                    total_retry_time_ms,
                    was_retried: attempts > 1,
                };
            }
            Err(error) => {
                // Check if we should retry
                let should_retry = attempts < config.max_attempts && is_retryable_error(&error);

                if !should_retry {
                    return RetryResult {
                        result: Err(error),
                        attempts,
                        total_retry_time_ms,
                        was_retried: attempts > 1,
                    };
                }

                // Log retry attempt
                log::warn!(
                    "[RalphLoop] Retryable error on attempt {}/{}: {}. Retrying in {}ms...",
                    attempts,
                    config.max_attempts,
                    error,
                    current_delay_ms
                );

                // Invoke callback if provided
                if let Some(ref mut callback) = on_retry {
                    callback(attempts, &error, current_delay_ms);
                }

                // Wait before retrying
                tokio::time::sleep(Duration::from_millis(current_delay_ms)).await;
                total_retry_time_ms += current_delay_ms;

                // Calculate next delay with exponential backoff
                current_delay_ms = ((current_delay_ms as f64 * config.backoff_multiplier) as u64)
                    .min(config.max_delay_ms);
            }
        }
    }
}

/// Synchronous version for checking if we should retry based on exit code and output
pub fn should_retry_agent(exit_code: i32, output: &str) -> bool {
    // Non-zero exit with retryable error in output
    exit_code != 0 && is_retryable_error(output)
}

/// Format a retry note for progress.txt
pub fn format_retry_note(attempt: u32, error: &str, delay_ms: u64) -> String {
    format!(
        "Retry attempt {} after error: {}. Waiting {}s before next attempt.",
        attempt,
        error.lines().next().unwrap_or(error), // First line only
        delay_ms / 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_retryable_error() {
        assert!(is_retryable_error("rate limit exceeded"));
        assert!(is_retryable_error("Error 429: Too Many Requests"));
        assert!(is_retryable_error("connection timeout"));
        assert!(is_retryable_error("ECONNRESET"));
        assert!(is_retryable_error("service temporarily unavailable"));
        assert!(is_retryable_error("Error 503"));

        assert!(!is_retryable_error("invalid api key"));
        assert!(!is_retryable_error("file not found"));
        assert!(!is_retryable_error("syntax error"));
    }

    #[test]
    fn test_classify_error() {
        assert_eq!(
            classify_error("rate limit exceeded"),
            ErrorCategory::Retryable
        );
        assert_eq!(
            classify_error("authentication failed"),
            ErrorCategory::Fatal
        );
        assert_eq!(classify_error("unknown error xyz"), ErrorCategory::Unknown);
    }

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_attempts, 3);
        assert_eq!(config.initial_delay_ms, 1000);
        assert_eq!(config.max_delay_ms, 30000);
        assert_eq!(config.backoff_multiplier, 2.0);
    }

    #[test]
    fn test_format_retry_note() {
        let note = format_retry_note(1, "rate limit exceeded", 2000);
        assert!(note.contains("Retry attempt 1"));
        assert!(note.contains("rate limit"));
        assert!(note.contains("2s"));
    }

    #[tokio::test]
    async fn test_with_retry_success_first_attempt() {
        let config = RetryConfig::default();
        let result = with_retry(|| async { Ok::<_, String>(42) }, &config, None::<fn(u32, &str, u64)>).await;

        assert_eq!(result.result.unwrap(), 42);
        assert_eq!(result.attempts, 1);
        assert!(!result.was_retried);
    }

    #[tokio::test]
    async fn test_with_retry_fatal_error() {
        let config = RetryConfig::default();
        let result = with_retry(
            || async { Err::<i32, _>("invalid api key".to_string()) },
            &config,
            None::<fn(u32, &str, u64)>,
        )
        .await;

        assert!(result.result.is_err());
        assert_eq!(result.attempts, 1); // No retry for fatal errors
        assert!(!result.was_retried);
    }
}
