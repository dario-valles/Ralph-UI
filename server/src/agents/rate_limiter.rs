// Rate limit detection for agent processes

#![allow(dead_code)] // Rate limiting infrastructure (Phase 4)

use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Result of rate limit detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitInfo {
    /// Whether a rate limit was detected
    pub is_rate_limited: bool,
    /// The type of rate limit detected
    pub limit_type: Option<RateLimitType>,
    /// Suggested retry delay in milliseconds (from retry-after header if available)
    pub retry_after_ms: Option<u64>,
    /// The matched pattern that triggered detection
    pub matched_pattern: Option<String>,
    /// Timestamp when the rate limit was detected
    pub detected_at: DateTime<Utc>,
}

/// Types of rate limits that can be detected
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RateLimitType {
    /// HTTP 429 Too Many Requests
    Http429,
    /// Generic rate limit message
    RateLimit,
    /// Quota exceeded
    QuotaExceeded,
    /// Service overloaded
    Overloaded,
    /// Claude-specific rate limit
    ClaudeRateLimit,
    /// OpenAI-specific rate limit
    OpenAiRateLimit,
}

/// Rate limit detector for parsing stderr output
pub struct RateLimitDetector {
    patterns: Vec<RateLimitPattern>,
}

struct RateLimitPattern {
    regex: Regex,
    limit_type: RateLimitType,
    description: String,
}

// Static patterns for efficient reuse
static PATTERNS: OnceLock<Vec<CompiledPattern>> = OnceLock::new();

struct CompiledPattern {
    regex: Regex,
    limit_type: RateLimitType,
}

fn get_patterns() -> &'static Vec<CompiledPattern> {
    PATTERNS.get_or_init(|| {
        vec![
            // Claude-specific patterns (check before generic rate limit)
            CompiledPattern {
                regex: Regex::new(r"(?i)anthropic[:\s].*rate\s*limit").unwrap(),
                limit_type: RateLimitType::ClaudeRateLimit,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)claude[:\s].*rate\s*limit").unwrap(),
                limit_type: RateLimitType::ClaudeRateLimit,
            },
            // OpenAI-specific patterns (check before generic rate limit)
            CompiledPattern {
                regex: Regex::new(r"(?i)openai[:\s].*rate\s*limit").unwrap(),
                limit_type: RateLimitType::OpenAiRateLimit,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)tokens?\s+per\s+minute\s+(limit|exceeded)").unwrap(),
                limit_type: RateLimitType::OpenAiRateLimit,
            },
            // HTTP 429 patterns
            // Use word boundary to prevent false positives from IDs containing "429"
            // (e.g., session ID "ses_429f18024ffeVo6UO6EAo2tIHG" should NOT match)
            CompiledPattern {
                regex: Regex::new(r"(?i)\b429\b\s*(?:too many requests|rate limit)?").unwrap(),
                limit_type: RateLimitType::Http429,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)status[:\s]*429").unwrap(),
                limit_type: RateLimitType::Http429,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)HTTP/\d+(?:\.\d+)?\s+429").unwrap(),
                limit_type: RateLimitType::Http429,
            },
            // Generic rate limit patterns
            CompiledPattern {
                regex: Regex::new(r"(?i)rate[_\-\s]?limit(ed|ing)?").unwrap(),
                limit_type: RateLimitType::RateLimit,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)too\s+many\s+requests").unwrap(),
                limit_type: RateLimitType::RateLimit,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)request\s+limit\s+exceeded").unwrap(),
                limit_type: RateLimitType::RateLimit,
            },
            // Quota exceeded patterns
            CompiledPattern {
                regex: Regex::new(r"(?i)quota\s*(exceeded|limit)").unwrap(),
                limit_type: RateLimitType::QuotaExceeded,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)usage\s+limit\s+(exceeded|reached)").unwrap(),
                limit_type: RateLimitType::QuotaExceeded,
            },
            // Overloaded patterns
            CompiledPattern {
                regex: Regex::new(r"(?i)overloaded").unwrap(),
                limit_type: RateLimitType::Overloaded,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)service\s+(unavailable|busy)").unwrap(),
                limit_type: RateLimitType::Overloaded,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)capacity\s+(exceeded|limit)").unwrap(),
                limit_type: RateLimitType::Overloaded,
            },
            // Concurrency limit patterns (e.g., ZhiPu AI "High concurrency usage")
            CompiledPattern {
                regex: Regex::new(r"(?i)high\s+concurrency").unwrap(),
                limit_type: RateLimitType::Overloaded,
            },
            CompiledPattern {
                regex: Regex::new(r"(?i)reduce\s+concurrency").unwrap(),
                limit_type: RateLimitType::Overloaded,
            },
        ]
    })
}

// Regex for extracting retry-after values
static RETRY_AFTER_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_retry_after_regex() -> &'static Regex {
    RETRY_AFTER_REGEX.get_or_init(|| Regex::new(r"(?i)retry[_\-\s]?after[:\s]*(\d+)").unwrap())
}

impl RateLimitDetector {
    /// Create a new rate limit detector
    pub fn new() -> Self {
        Self {
            patterns: Vec::new(),
        }
    }

    /// Detect rate limits in stderr output only
    /// Returns None if no rate limit detected
    pub fn detect_in_stderr(&self, stderr: &str) -> Option<RateLimitInfo> {
        self.detect(stderr)
    }

    /// Internal detection logic
    fn detect(&self, output: &str) -> Option<RateLimitInfo> {
        let patterns = get_patterns();

        for pattern in patterns {
            if pattern.regex.is_match(output) {
                let retry_after_ms = self.extract_retry_after(output);
                let matched = pattern.regex.find(output).map(|m| m.as_str().to_string());

                return Some(RateLimitInfo {
                    is_rate_limited: true,
                    limit_type: Some(pattern.limit_type),
                    retry_after_ms,
                    matched_pattern: matched,
                    detected_at: Utc::now(),
                });
            }
        }

        None
    }

    /// Extract retry-after delay from output
    fn extract_retry_after(&self, output: &str) -> Option<u64> {
        let regex = get_retry_after_regex();

        regex
            .captures(output)
            .and_then(|caps| caps.get(1).and_then(|m| m.as_str().parse::<u64>().ok()))
    }

    /// Check if output indicates a rate limit (convenience method)
    pub fn is_rate_limited(&self, stderr: &str) -> bool {
        self.detect_in_stderr(stderr).is_some()
    }
}

impl Default for RateLimitDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detects_http_429_in_stderr() {
        let detector = RateLimitDetector::new();

        let stderr = "Error: 429 Too Many Requests - please slow down";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert!(info.is_rate_limited);
        assert_eq!(info.limit_type, Some(RateLimitType::Http429));
    }

    #[test]
    fn test_detects_rate_limit_keyword() {
        let detector = RateLimitDetector::new();

        let stderr = "API Error: rate-limit exceeded, please wait";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert!(info.is_rate_limited);
        assert_eq!(info.limit_type, Some(RateLimitType::RateLimit));
    }

    #[test]
    fn test_detects_quota_exceeded() {
        let detector = RateLimitDetector::new();

        let stderr = "Error: Quota exceeded for today";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert!(info.is_rate_limited);
        assert_eq!(info.limit_type, Some(RateLimitType::QuotaExceeded));
    }

    #[test]
    fn test_extracts_retry_after_delay() {
        let detector = RateLimitDetector::new();

        let stderr = "Rate limited. Retry-After: 30 seconds";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.retry_after_ms, Some(30));
    }

    #[test]
    fn test_returns_none_when_no_rate_limit_detected() {
        let detector = RateLimitDetector::new();

        let stderr = "Normal error: file not found";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_none());
    }

    #[test]
    fn test_detects_overloaded() {
        let detector = RateLimitDetector::new();

        let stderr = "Error: service overloaded, try again later";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert!(info.is_rate_limited);
        assert_eq!(info.limit_type, Some(RateLimitType::Overloaded));
    }

    #[test]
    fn test_detects_high_concurrency() {
        let detector = RateLimitDetector::new();

        // ZhiPu AI style concurrency limit
        let stderr = "High concurrency usage of this API, please reduce concurrency or contact customer service";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert!(info.is_rate_limited);
        assert_eq!(info.limit_type, Some(RateLimitType::Overloaded));
    }

    #[test]
    fn test_detects_claude_rate_limit() {
        let detector = RateLimitDetector::new();

        let stderr = "Anthropic: rate limit reached for claude-opus-4-5";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.limit_type, Some(RateLimitType::ClaudeRateLimit));
    }

    #[test]
    fn test_detects_openai_rate_limit() {
        let detector = RateLimitDetector::new();

        let stderr = "OpenAI: rate limit - tokens per minute limit exceeded";
        let result = detector.detect_in_stderr(stderr);

        assert!(result.is_some());
        let info = result.unwrap();
        // Should match OpenAI rate limit (tokens per minute pattern)
        assert!(
            info.limit_type == Some(RateLimitType::OpenAiRateLimit)
                || info.limit_type == Some(RateLimitType::RateLimit)
        );
    }

    #[test]
    fn test_is_rate_limited_convenience_method() {
        let detector = RateLimitDetector::new();

        assert!(detector.is_rate_limited("429 Too Many Requests"));
        assert!(detector.is_rate_limited("rate-limited"));
        assert!(!detector.is_rate_limited("success"));
    }

    #[test]
    fn test_case_insensitive_detection() {
        let detector = RateLimitDetector::new();

        assert!(detector.is_rate_limited("RATE LIMIT EXCEEDED"));
        assert!(detector.is_rate_limited("Rate Limit"));
        assert!(detector.is_rate_limited("QUOTA EXCEEDED"));
    }

    #[test]
    fn test_status_code_variations() {
        let detector = RateLimitDetector::new();

        assert!(detector.is_rate_limited("status: 429"));
        assert!(detector.is_rate_limited("HTTP/1.1 429"));
        assert!(detector.is_rate_limited("HTTP/2 429"));
    }

    #[test]
    fn test_no_false_positive_on_session_ids() {
        let detector = RateLimitDetector::new();

        // Session IDs that happen to contain "429" should NOT trigger rate limit detection
        assert!(!detector.is_rate_limited("ses_429f18024ffeVo6UO6EAo2tIHG"));
        assert!(
            !detector.is_rate_limited("Created session with id: ses_429f18024ffeVo6UO6EAo2tIHG")
        );
        assert!(!detector.is_rate_limited("agent-429abc-def"));
        assert!(!detector.is_rate_limited("task_id_429_hash"));

        // But actual 429 errors should still be detected
        assert!(detector.is_rate_limited("Error: 429"));
        assert!(detector.is_rate_limited("Response code: 429"));
        assert!(detector.is_rate_limited("429 Too Many Requests"));
    }

    #[test]
    fn test_retry_after_extraction_variations() {
        let detector = RateLimitDetector::new();

        // Test various retry-after formats (combined with rate limit keywords)
        let info1 = detector
            .detect_in_stderr("rate limited, retry-after: 60")
            .unwrap();
        assert_eq!(info1.retry_after_ms, Some(60));

        let info2 = detector
            .detect_in_stderr("Rate limited. Retry_After: 120")
            .unwrap();
        assert_eq!(info2.retry_after_ms, Some(120));

        let info3 = detector
            .detect_in_stderr("rate limit hit, retry after 45 seconds")
            .unwrap();
        assert_eq!(info3.retry_after_ms, Some(45));
    }
}
