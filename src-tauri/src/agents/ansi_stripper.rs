// ANSI escape code stripping for log parsing
// PTY output combines stdout/stderr with ANSI codes, we need to strip them for log parsing

use regex::Regex;
use std::sync::LazyLock;

/// Regex pattern for ANSI escape sequences
/// Matches:
/// - CSI (Control Sequence Introducer) sequences: \x1b[...m, \x1b[...H, etc.
/// - OSC (Operating System Command) sequences: \x1b]...
/// - Simple escape sequences: \x1b[, \x1bD, etc.
static ANSI_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"\x1b\[[0-9;]*[a-zA-Z]",       // CSI sequences (e.g., \x1b[0m, \x1b[1;32m)
        r"|\x1b\][^\x07]*\x07",          // OSC sequences terminated by BEL
        r"|\x1b\][^\x1b]*\x1b\\",        // OSC sequences terminated by ST
        r"|\x1b[PX^_][^\x1b]*\x1b\\",    // DCS, SOS, PM, APC sequences
        r"|\x1b[@-Z\\-_]",               // Fe escape sequences
        r"|\x1b.",                       // Other escape sequences
        r"|\x0d",                        // Carriage return
        r"|\x07",                        // BEL character
    ))
    .expect("Invalid ANSI regex pattern")
});

/// Strip ANSI escape codes from input string
/// Returns a clean string suitable for log parsing and rate limit detection
pub fn strip_ansi(input: &str) -> String {
    ANSI_REGEX.replace_all(input, "").to_string()
}

/// A buffer for reconstructing complete lines from streaming output
/// PTY output may arrive in chunks that don't align with line boundaries
#[derive(Default)]
pub struct LineBuffer {
    /// Partial line from previous chunk
    pending: String,
}

impl LineBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a chunk of output and return complete lines
    /// Incomplete lines are buffered until the next chunk
    pub fn process_chunk(&mut self, chunk: &str) -> Vec<String> {
        let mut lines = Vec::new();
        let mut input = self.pending.clone() + chunk;

        // Process complete lines
        while let Some(pos) = input.find('\n') {
            let line = input[..pos].to_string();
            // Skip empty lines that are just from \r\n sequences
            if !line.is_empty() && line != "\r" {
                // Strip trailing \r if present (Windows-style line endings)
                let clean_line = line.trim_end_matches('\r').to_string();
                if !clean_line.is_empty() {
                    lines.push(clean_line);
                }
            }
            input = input[pos + 1..].to_string();
        }

        // Store any remaining partial line
        self.pending = input;

        lines
    }

    /// Get any remaining buffered content (call when stream ends)
    pub fn flush(&mut self) -> Option<String> {
        if self.pending.is_empty() || self.pending == "\r" {
            self.pending.clear();
            None
        } else {
            let line = self.pending.trim_end_matches('\r').to_string();
            self.pending.clear();
            if line.is_empty() {
                None
            } else {
                Some(line)
            }
        }
    }

    /// Check if there's pending content
    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty() && self.pending != "\r"
    }
}

/// A ring buffer for storing raw PTY output history
/// Used to replay terminal output when a user opens the terminal late
pub struct RingBuffer {
    /// Underlying buffer
    data: Vec<u8>,
    /// Maximum capacity in bytes
    capacity: usize,
    /// Current write position (wraps around)
    write_pos: usize,
    /// Total bytes written (for tracking if buffer has wrapped)
    total_written: usize,
}

impl RingBuffer {
    /// Create a new ring buffer with the specified capacity
    pub fn new(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
            capacity,
            write_pos: 0,
            total_written: 0,
        }
    }

    /// Write data to the ring buffer
    pub fn write(&mut self, data: &[u8]) {
        for &byte in data {
            if self.data.len() < self.capacity {
                self.data.push(byte);
            } else {
                self.data[self.write_pos] = byte;
            }
            self.write_pos = (self.write_pos + 1) % self.capacity;
            self.total_written += 1;
        }
    }

    /// Get all data in the buffer in order
    /// Returns bytes from oldest to newest
    pub fn get_data(&self) -> Vec<u8> {
        if self.total_written <= self.capacity {
            // Buffer hasn't wrapped yet
            self.data.clone()
        } else {
            // Buffer has wrapped, need to reconstruct in order
            let mut result = Vec::with_capacity(self.capacity);
            // Write position points to the oldest byte
            result.extend_from_slice(&self.data[self.write_pos..]);
            result.extend_from_slice(&self.data[..self.write_pos]);
            result
        }
    }

    /// Get the number of bytes currently in the buffer
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if the buffer is empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Clear the buffer
    pub fn clear(&mut self) {
        self.data.clear();
        self.write_pos = 0;
        self.total_written = 0;
    }
}

impl Default for RingBuffer {
    fn default() -> Self {
        // Default to 1MB buffer
        Self::new(1024 * 1024)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // ANSI stripping tests
    // =========================================================================

    #[test]
    fn test_strip_basic_color_codes() {
        assert_eq!(strip_ansi("\x1b[32mGreen\x1b[0m"), "Green");
        assert_eq!(strip_ansi("\x1b[1;31mBold Red\x1b[0m"), "Bold Red");
        assert_eq!(strip_ansi("\x1b[38;5;196mCustom Color\x1b[0m"), "Custom Color");
    }

    #[test]
    fn test_strip_cursor_movement() {
        assert_eq!(strip_ansi("\x1b[HHome"), "Home");
        assert_eq!(strip_ansi("\x1b[10;20HPosition"), "Position");
        assert_eq!(strip_ansi("\x1b[2JClear"), "Clear");
        assert_eq!(strip_ansi("\x1b[AUp\x1b[BDown"), "UpDown");
    }

    #[test]
    fn test_strip_osc_sequences() {
        // Window title setting
        assert_eq!(strip_ansi("\x1b]0;Title\x07Text"), "Text");
        // Alternative terminator
        assert_eq!(strip_ansi("\x1b]0;Title\x1b\\Text"), "Text");
    }

    #[test]
    fn test_strip_carriage_return() {
        assert_eq!(strip_ansi("Line1\x0dLine2"), "Line1Line2");
    }

    #[test]
    fn test_strip_complex_output() {
        let input = "\x1b[1m\x1b[32m✓ \x1b[0mTest passed in \x1b[33m0.5s\x1b[0m";
        assert_eq!(strip_ansi(input), "✓ Test passed in 0.5s");
    }

    #[test]
    fn test_strip_preserves_regular_text() {
        let input = "Normal text without escape codes";
        assert_eq!(strip_ansi(input), input);
    }

    #[test]
    fn test_strip_mixed_content() {
        let input = "Error: \x1b[31mrate limit exceeded\x1b[0m, retry after 30s";
        assert_eq!(strip_ansi(input), "Error: rate limit exceeded, retry after 30s");
    }

    // =========================================================================
    // Line buffer tests
    // =========================================================================

    #[test]
    fn test_line_buffer_complete_lines() {
        let mut buffer = LineBuffer::new();
        let lines = buffer.process_chunk("line1\nline2\nline3\n");
        assert_eq!(lines, vec!["line1", "line2", "line3"]);
        assert!(!buffer.has_pending());
    }

    #[test]
    fn test_line_buffer_partial_line() {
        let mut buffer = LineBuffer::new();

        // First chunk ends mid-line
        let lines1 = buffer.process_chunk("partial ");
        assert!(lines1.is_empty());
        assert!(buffer.has_pending());

        // Second chunk completes the line
        let lines2 = buffer.process_chunk("complete\n");
        assert_eq!(lines2, vec!["partial complete"]);
        assert!(!buffer.has_pending());
    }

    #[test]
    fn test_line_buffer_windows_line_endings() {
        let mut buffer = LineBuffer::new();
        let lines = buffer.process_chunk("line1\r\nline2\r\n");
        assert_eq!(lines, vec!["line1", "line2"]);
    }

    #[test]
    fn test_line_buffer_flush() {
        let mut buffer = LineBuffer::new();
        buffer.process_chunk("incomplete");
        let flushed = buffer.flush();
        assert_eq!(flushed, Some("incomplete".to_string()));
        assert!(buffer.flush().is_none());
    }

    #[test]
    fn test_line_buffer_empty_lines_skipped() {
        let mut buffer = LineBuffer::new();
        let lines = buffer.process_chunk("\n\nactual\n\n");
        assert_eq!(lines, vec!["actual"]);
    }

    // =========================================================================
    // Ring buffer tests
    // =========================================================================

    #[test]
    fn test_ring_buffer_basic_write() {
        let mut buffer = RingBuffer::new(10);
        buffer.write(b"hello");
        assert_eq!(buffer.get_data(), b"hello");
        assert_eq!(buffer.len(), 5);
    }

    #[test]
    fn test_ring_buffer_wrap_around() {
        let mut buffer = RingBuffer::new(5);
        buffer.write(b"12345");
        buffer.write(b"67");
        // Should contain "34567" in order
        assert_eq!(buffer.get_data(), b"34567");
    }

    #[test]
    fn test_ring_buffer_full_wrap() {
        let mut buffer = RingBuffer::new(4);
        buffer.write(b"abcd");
        buffer.write(b"efgh");
        // Should contain "efgh"
        assert_eq!(buffer.get_data(), b"efgh");
    }

    #[test]
    fn test_ring_buffer_clear() {
        let mut buffer = RingBuffer::new(10);
        buffer.write(b"test");
        buffer.clear();
        assert!(buffer.is_empty());
        assert_eq!(buffer.len(), 0);
    }

    #[test]
    fn test_ring_buffer_default_capacity() {
        let buffer = RingBuffer::default();
        assert_eq!(buffer.capacity, 1024 * 1024);
    }
}
