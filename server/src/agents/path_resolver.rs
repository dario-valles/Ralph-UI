// CLI binary path resolution for agent tools

use std::path::PathBuf;
use std::process::Command;

pub struct CliPathResolver;

impl CliPathResolver {
    /// Resolve OpenCode binary path
    pub fn resolve_opencode() -> Option<PathBuf> {
        Self::resolve_cli(
            "opencode",
            &[dirs::home_dir().map(|h| h.join(".opencode/bin/opencode"))],
        )
    }

    /// Resolve Claude CLI binary path
    pub fn resolve_claude() -> Option<PathBuf> {
        Self::resolve_cli("claude", &[])
    }

    /// Resolve Cursor Agent binary path
    pub fn resolve_cursor() -> Option<PathBuf> {
        Self::resolve_cli(
            "cursor-agent",
            &[dirs::home_dir().map(|h| h.join(".cursor/bin/cursor-agent"))],
        )
    }

    /// Resolve Codex CLI binary path
    pub fn resolve_codex() -> Option<PathBuf> {
        Self::resolve_cli("codex", &[])
    }

    /// Resolve Qwen CLI binary path
    pub fn resolve_qwen() -> Option<PathBuf> {
        Self::resolve_cli("qwen", &[])
    }

    /// Resolve Droid CLI binary path
    pub fn resolve_droid() -> Option<PathBuf> {
        Self::resolve_cli("droid", &[])
    }

    /// Resolve Gemini CLI binary path
    pub fn resolve_gemini() -> Option<PathBuf> {
        Self::resolve_cli("gemini", &[])
    }

    /// Resolve a CLI binary by checking common paths then falling back to `which`
    fn resolve_cli(name: &str, extra_paths: &[Option<PathBuf>]) -> Option<PathBuf> {
        // Build common paths list: extra paths + standard locations
        let standard_paths = [
            dirs::home_dir().map(|h| h.join(format!(".npm-global/bin/{}", name))),
            Some(PathBuf::from(format!("/usr/local/bin/{}", name))),
            Some(PathBuf::from(format!("/opt/homebrew/bin/{}", name))),
        ];

        // Check extra paths first, then standard paths
        for path in extra_paths.iter().chain(standard_paths.iter()).flatten() {
            if path.exists() {
                log::info!("[CliPathResolver] Found {} at: {:?}", name, path);
                return Some(path.clone());
            }
        }

        Self::which(name)
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

    #[test]
    fn test_resolve_qwen_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        let _ = CliPathResolver::resolve_qwen();
    }

    #[test]
    fn test_resolve_droid_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        let _ = CliPathResolver::resolve_droid();
    }

    #[test]
    fn test_resolve_gemini_returns_path_or_none() {
        // This test just ensures the function doesn't panic
        let _ = CliPathResolver::resolve_gemini();
    }
}
