//! Completion Detection - Detects when the Ralph loop should stop
//!
//! The completion detector looks for a promise token in the agent's output
//! to determine when all tasks are complete.

/// Completion detector for Ralph loop
pub struct CompletionDetector {
    /// The promise string to look for
    promise: String,
    /// Maximum lines from end to check (security: prevent injection from earlier output)
    max_lines_from_end: usize,
}

impl CompletionDetector {
    /// Create a new completion detector
    pub fn new(promise: &str) -> Self {
        Self {
            promise: promise.to_string(),
            max_lines_from_end: 50, // Only check last 50 lines for security
        }
    }

    /// Set custom max lines to check
    pub fn with_max_lines(mut self, max_lines: usize) -> Self {
        self.max_lines_from_end = max_lines;
        self
    }

    /// Check if the output contains the completion promise
    ///
    /// For security, only checks the last N lines of output to prevent
    /// malicious code from injecting the promise earlier in the output.
    pub fn check(&self, output: &str) -> bool {
        let lines: Vec<&str> = output.lines().collect();
        let start_line = lines.len().saturating_sub(self.max_lines_from_end);
        let recent_output: String = lines[start_line..].join("\n");

        recent_output.contains(&self.promise)
    }

    /// Check for completion and return the match location if found
    pub fn check_with_location(&self, output: &str) -> Option<CompletionMatch> {
        let lines: Vec<&str> = output.lines().collect();
        let start_line = lines.len().saturating_sub(self.max_lines_from_end);

        for (i, line) in lines[start_line..].iter().enumerate() {
            if let Some(col) = line.find(&self.promise) {
                return Some(CompletionMatch {
                    line: start_line + i + 1, // 1-indexed
                    column: col + 1,          // 1-indexed
                    context: line.to_string(),
                });
            }
        }

        None
    }

    /// Get the promise string
    pub fn promise(&self) -> &str {
        &self.promise
    }

    /// Validate that a promise string is safe to use
    ///
    /// Prevents common injection issues.
    pub fn validate_promise(promise: &str) -> Result<(), String> {
        if promise.is_empty() {
            return Err("Promise cannot be empty".to_string());
        }

        if promise.len() < 5 {
            return Err("Promise should be at least 5 characters for security".to_string());
        }

        // Check for common shell/code injection patterns
        let dangerous_patterns = ["$(", "`", "&&", "||", ";", "|", "\n", "\r"];
        for pattern in dangerous_patterns {
            if promise.contains(pattern) {
                return Err(format!(
                    "Promise contains potentially dangerous pattern: {}",
                    pattern
                ));
            }
        }

        Ok(())
    }
}

/// Information about where a completion match was found
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CompletionMatch {
    /// Line number (1-indexed)
    pub line: usize,
    /// Column number (1-indexed)
    pub column: usize,
    /// The full line content
    pub context: String,
}

/// Possible completion states
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum CompletionState {
    /// Still running, no completion signal
    Running,
    /// Completion promise detected
    Complete,
    /// Agent exited with error before completion
    Failed {
        exit_code: i32,
        error: Option<String>,
    },
    /// Max iterations reached
    MaxIterationsReached { iterations: u32 },
    /// Max cost exceeded
    MaxCostExceeded { cost: f64 },
    /// User cancelled
    Cancelled,
}

/// Extended completion detection with multiple signals
pub struct ExtendedCompletionDetector {
    /// Primary promise detector
    promise_detector: CompletionDetector,
    /// Alternative completion signals
    alternative_signals: Vec<String>,
    /// Failure patterns to detect
    failure_patterns: Vec<FailurePattern>,
}

/// A pattern that indicates failure
#[derive(Debug, Clone)]
pub struct FailurePattern {
    /// Pattern to match
    pub pattern: String,
    /// Whether this is a fatal error (should stop the loop)
    pub fatal: bool,
    /// Error message to report
    pub message: String,
}

impl ExtendedCompletionDetector {
    /// Create a new extended completion detector
    pub fn new(promise: &str) -> Self {
        Self {
            promise_detector: CompletionDetector::new(promise),
            alternative_signals: Vec::new(),
            failure_patterns: Self::default_failure_patterns(),
        }
    }

    /// Add an alternative completion signal
    pub fn add_alternative_signal(&mut self, signal: impl Into<String>) {
        self.alternative_signals.push(signal.into());
    }

    /// Add a failure pattern
    pub fn add_failure_pattern(&mut self, pattern: FailurePattern) {
        self.failure_patterns.push(pattern);
    }

    /// Default failure patterns to detect common issues
    fn default_failure_patterns() -> Vec<FailurePattern> {
        vec![
            FailurePattern {
                pattern: "rate limit exceeded".to_string(),
                fatal: false,
                message: "Rate limit hit - will retry".to_string(),
            },
            FailurePattern {
                pattern: "API error".to_string(),
                fatal: false,
                message: "API error encountered".to_string(),
            },
            FailurePattern {
                pattern: "FATAL ERROR".to_string(),
                fatal: true,
                message: "Fatal error occurred".to_string(),
            },
            FailurePattern {
                pattern: "context window exceeded".to_string(),
                fatal: true,
                message: "Context window exceeded - agent needs fresh context".to_string(),
            },
        ]
    }

    /// Check for completion using all signals
    pub fn check(&self, output: &str, exit_code: Option<i32>) -> DetectionResult {
        let lines: Vec<&str> = output.lines().collect();
        let start_line = lines
            .len()
            .saturating_sub(self.promise_detector.max_lines_from_end);
        let recent_output: String = lines[start_line..].join("\n");

        // Check primary promise
        if recent_output.contains(&self.promise_detector.promise) {
            return DetectionResult::Complete {
                signal: self.promise_detector.promise.clone(),
            };
        }

        // Check alternative signals
        for signal in &self.alternative_signals {
            if recent_output.contains(signal) {
                return DetectionResult::Complete {
                    signal: signal.clone(),
                };
            }
        }

        // Check failure patterns
        for pattern in &self.failure_patterns {
            if output
                .to_lowercase()
                .contains(&pattern.pattern.to_lowercase())
            {
                if pattern.fatal {
                    return DetectionResult::FatalError {
                        pattern: pattern.pattern.clone(),
                        message: pattern.message.clone(),
                    };
                } else {
                    return DetectionResult::RecoverableError {
                        pattern: pattern.pattern.clone(),
                        message: pattern.message.clone(),
                    };
                }
            }
        }

        // Check exit code
        if let Some(code) = exit_code {
            if code != 0 {
                return DetectionResult::ExitedWithError { exit_code: code };
            }
        }

        DetectionResult::Incomplete
    }
}

/// Result of extended completion detection
#[derive(Debug, Clone, PartialEq)]
pub enum DetectionResult {
    /// No completion signal, agent should continue
    Incomplete,
    /// Completion signal detected
    Complete { signal: String },
    /// Agent exited with non-zero code
    ExitedWithError { exit_code: i32 },
    /// Recoverable error detected (can retry)
    RecoverableError { pattern: String, message: String },
    /// Fatal error detected (should stop loop)
    FatalError { pattern: String, message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_completion_detection() {
        let detector = CompletionDetector::new("<promise>COMPLETE</promise>");

        // Should detect in output
        let output = "Working on task...\nDone!\n<promise>COMPLETE</promise>\n";
        assert!(detector.check(output));

        // Should not detect if not present
        let output = "Working on task...\nDone!\n";
        assert!(!detector.check(output));
    }

    #[test]
    fn test_completion_only_in_recent_lines() {
        let detector = CompletionDetector::new("<promise>COMPLETE</promise>").with_max_lines(5);

        // Promise in recent lines - should detect
        let mut output = String::new();
        for i in 0..10 {
            output.push_str(&format!("Line {}\n", i));
        }
        output.push_str("<promise>COMPLETE</promise>\n");
        assert!(detector.check(&output));

        // Promise too far back - should NOT detect (security feature)
        let mut output = String::new();
        output.push_str("<promise>COMPLETE</promise>\n"); // Line 1
        for i in 0..10 {
            output.push_str(&format!("Line {}\n", i));
        }
        assert!(!detector.check(&output));
    }

    #[test]
    fn test_check_with_location() {
        let detector = CompletionDetector::new("[[DONE]]");

        let output = "Line 1\nLine 2\nResult: [[DONE]] success\nLine 4\n";
        let result = detector.check_with_location(output);

        assert!(result.is_some());
        let match_info = result.unwrap();
        assert_eq!(match_info.line, 3);
        assert!(match_info.context.contains("[[DONE]]"));
    }

    #[test]
    fn test_validate_promise() {
        // Valid promises
        assert!(CompletionDetector::validate_promise("<promise>DONE</promise>").is_ok());
        assert!(CompletionDetector::validate_promise("[[COMPLETE]]").is_ok());

        // Invalid promises
        assert!(CompletionDetector::validate_promise("").is_err());
        assert!(CompletionDetector::validate_promise("ab").is_err());
        assert!(CompletionDetector::validate_promise("$(cmd)").is_err());
        assert!(CompletionDetector::validate_promise("foo;bar").is_err());
    }

    #[test]
    fn test_extended_detector() {
        let mut detector = ExtendedCompletionDetector::new("<promise>COMPLETE</promise>");
        detector.add_alternative_signal("[[ALL_DONE]]");

        // Primary signal
        let result = detector.check("<promise>COMPLETE</promise>", Some(0));
        assert!(matches!(result, DetectionResult::Complete { .. }));

        // Alternative signal
        let result = detector.check("[[ALL_DONE]]", Some(0));
        assert!(matches!(result, DetectionResult::Complete { .. }));

        // No signal, exit 0
        let result = detector.check("Just output", Some(0));
        assert!(matches!(result, DetectionResult::Incomplete));

        // No signal, exit error
        let result = detector.check("Error occurred", Some(1));
        assert!(matches!(
            result,
            DetectionResult::ExitedWithError { exit_code: 1 }
        ));
    }

    #[test]
    fn test_failure_pattern_detection() {
        let detector = ExtendedCompletionDetector::new("<promise>COMPLETE</promise>");

        // Rate limit (recoverable)
        let result = detector.check("Error: rate limit exceeded, please wait", None);
        assert!(matches!(result, DetectionResult::RecoverableError { .. }));

        // Fatal error
        let result = detector.check("FATAL ERROR: cannot continue", None);
        assert!(matches!(result, DetectionResult::FatalError { .. }));
    }
}
