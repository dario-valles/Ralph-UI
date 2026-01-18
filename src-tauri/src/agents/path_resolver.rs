// CLI binary path resolution for agent tools

use std::path::PathBuf;
use std::process::Command;

pub struct CliPathResolver;

impl CliPathResolver {
    /// Resolve OpenCode binary path
    /// Checks common installation locations before falling back to `which`
    pub fn resolve_opencode() -> Option<PathBuf> {
        // 1. Check common paths first (fastest)
        let common_paths = [
            dirs::home_dir().map(|h| h.join(".opencode/bin/opencode")),
            dirs::home_dir().map(|h| h.join(".npm-global/bin/opencode")),
            Some(PathBuf::from("/usr/local/bin/opencode")),
            Some(PathBuf::from("/opt/homebrew/bin/opencode")),
        ];

        for path in common_paths.into_iter().flatten() {
            if path.exists() {
                log::info!("[CliPathResolver] Found OpenCode at: {:?}", path);
                return Some(path);
            }
        }

        // 2. Try which command
        Self::which("opencode")
    }

    /// Resolve Claude CLI binary path
    /// Claude is typically installed via npm global or brew
    pub fn resolve_claude() -> Option<PathBuf> {
        // Check common paths first
        let common_paths = [
            dirs::home_dir().map(|h| h.join(".npm-global/bin/claude")),
            Some(PathBuf::from("/usr/local/bin/claude")),
            Some(PathBuf::from("/opt/homebrew/bin/claude")),
        ];

        for path in common_paths.into_iter().flatten() {
            if path.exists() {
                log::info!("[CliPathResolver] Found Claude at: {:?}", path);
                return Some(path);
            }
        }

        // Try which command
        Self::which("claude")
    }

    /// Resolve Cursor Agent binary path
    pub fn resolve_cursor() -> Option<PathBuf> {
        let common_paths = [
            dirs::home_dir().map(|h| h.join(".cursor/bin/cursor-agent")),
            Some(PathBuf::from("/usr/local/bin/cursor-agent")),
            Some(PathBuf::from("/opt/homebrew/bin/cursor-agent")),
        ];

        for path in common_paths.into_iter().flatten() {
            if path.exists() {
                log::info!("[CliPathResolver] Found Cursor at: {:?}", path);
                return Some(path);
            }
        }

        Self::which("cursor-agent")
    }

    /// Resolve Codex CLI binary path
    pub fn resolve_codex() -> Option<PathBuf> {
        let common_paths = [
            dirs::home_dir().map(|h| h.join(".npm-global/bin/codex")),
            Some(PathBuf::from("/usr/local/bin/codex")),
            Some(PathBuf::from("/opt/homebrew/bin/codex")),
        ];

        for path in common_paths.into_iter().flatten() {
            if path.exists() {
                log::info!("[CliPathResolver] Found Codex at: {:?}", path);
                return Some(path);
            }
        }

        Self::which("codex")
    }

    /// Use the `which` command to find a binary in PATH
    fn which(cmd: &str) -> Option<PathBuf> {
        Command::new("which")
            .arg(cmd)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| PathBuf::from(s.trim()))
            .and_then(|p| {
                if p.exists() {
                    log::info!("[CliPathResolver] Found {} via which at: {:?}", cmd, p);
                    Some(p)
                } else {
                    None
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_which_returns_valid_path() {
        // Test with a command that should exist on most systems
        let result = CliPathResolver::which("ls");
        // On most Unix systems, ls should exist
        if result.is_some() {
            let path = result.unwrap();
            assert!(path.exists());
        }
    }

    #[test]
    fn test_which_returns_none_for_nonexistent_command() {
        let result = CliPathResolver::which("this-command-definitely-does-not-exist-12345");
        assert!(result.is_none());
    }

    #[test]
    fn test_resolve_opencode_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        // It may or may not find opencode depending on the system
        let _ = CliPathResolver::resolve_opencode();
    }

    #[test]
    fn test_resolve_claude_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        let _ = CliPathResolver::resolve_claude();
    }

    #[test]
    fn test_resolve_cursor_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        let _ = CliPathResolver::resolve_cursor();
    }

    #[test]
    fn test_resolve_codex_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        let _ = CliPathResolver::resolve_codex();
    }
}
