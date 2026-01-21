//! File-based storage module for Ralph UI
//!
//! This module provides file-based storage for all Ralph UI data, enabling:
//! - Git-trackable state for team sharing
//! - Machine portability (same state on any machine with the repo)
//! - Philosophy alignment ("progress persists in files")
//!
//! ## Storage Locations
//!
//! Project-local storage (`.ralph-ui/` in project root):
//! - `sessions/` - Session data with embedded tasks
//! - `prds/` - PRD documents with stories and executions
//! - `chat/` - Chat sessions with embedded messages
//! - `agents/` - Runtime agent state (gitignored)
//! - `executions/` - Runtime execution state (gitignored)
//!
//! Global user storage (`~/.ralph-ui/`):
//! - `projects.json` - Cross-workspace project registry
//! - `templates/` - User-defined PRD templates

pub mod agents;
pub mod chat;
pub mod chat_ops;
pub mod index;
pub mod projects;

use std::fs;
use std::path::{Path, PathBuf};

/// Common file operations result type
pub type FileResult<T> = Result<T, String>;

/// Get the .ralph-ui directory for a project
pub fn get_ralph_ui_dir(project_path: &Path) -> PathBuf {
    project_path.join(".ralph-ui")
}

/// Get the global .ralph-ui directory in user home
pub fn get_global_ralph_ui_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ralph-ui")
}

/// Ensure a directory exists, creating it if necessary
pub fn ensure_dir(path: &Path) -> FileResult<()> {
    if !path.exists() {
        fs::create_dir_all(path)
            .map_err(|e| format!("Failed to create directory {:?}: {}", path, e))?;
    }
    Ok(())
}

/// Write data to a file atomically (temp file + rename)
pub fn atomic_write(path: &Path, content: &str) -> FileResult<()> {
    let temp_path = path.with_extension("tmp");

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }

    // Write to temp file
    fs::write(&temp_path, content)
        .map_err(|e| format!("Failed to write temp file {:?}: {}", temp_path, e))?;

    // Atomic rename
    fs::rename(&temp_path, path)
        .map_err(|e| format!("Failed to rename {:?} to {:?}: {}", temp_path, path, e))?;

    Ok(())
}

/// Read a JSON file and deserialize it
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> FileResult<T> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON from {:?}: {}", path, e))
}

/// Write data as pretty-printed JSON atomically
pub fn write_json<T: serde::Serialize>(path: &Path, data: &T) -> FileResult<()> {
    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize to JSON: {}", e))?;

    atomic_write(path, &content)
}

/// Initialize the .ralph-ui directory for a project with .gitignore
pub fn init_ralph_ui_dir(project_path: &Path) -> FileResult<PathBuf> {
    let ralph_ui_dir = get_ralph_ui_dir(project_path);
    ensure_dir(&ralph_ui_dir)?;

    // Create subdirectories
    ensure_dir(&ralph_ui_dir.join("sessions"))?;
    ensure_dir(&ralph_ui_dir.join("prds"))?;
    ensure_dir(&ralph_ui_dir.join("chat"))?;
    ensure_dir(&ralph_ui_dir.join("agents"))?;
    ensure_dir(&ralph_ui_dir.join("executions"))?;

    // Create .gitignore for runtime files
    let gitignore_path = ralph_ui_dir.join(".gitignore");
    if !gitignore_path.exists() {
        let gitignore_content = r#"# Runtime files (not for sharing)
*.lock
*.tmp
agents/
executions/
"#;
        fs::write(&gitignore_path, gitignore_content)
            .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
    }

    Ok(ralph_ui_dir)
}

/// Initialize the global ~/.ralph-ui directory
pub fn init_global_ralph_ui_dir() -> FileResult<PathBuf> {
    let global_dir = get_global_ralph_ui_dir();
    ensure_dir(&global_dir)?;
    ensure_dir(&global_dir.join("templates"))?;
    Ok(global_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_get_ralph_ui_dir() {
        let project_path = Path::new("/home/user/my-project");
        let ralph_ui_dir = get_ralph_ui_dir(project_path);
        assert_eq!(ralph_ui_dir, PathBuf::from("/home/user/my-project/.ralph-ui"));
    }

    #[test]
    fn test_ensure_dir() {
        let temp_dir = TempDir::new().unwrap();
        let nested_path = temp_dir.path().join("a").join("b").join("c");

        assert!(!nested_path.exists());
        ensure_dir(&nested_path).unwrap();
        assert!(nested_path.exists());
    }

    #[test]
    fn test_atomic_write() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");

        atomic_write(&file_path, "Hello, World!").unwrap();

        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_read_write_json() {
        use serde::{Deserialize, Serialize};

        #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
        struct TestData {
            name: String,
            value: i32,
        }

        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.json");

        let data = TestData {
            name: "test".to_string(),
            value: 42,
        };

        write_json(&file_path, &data).unwrap();
        let read_data: TestData = read_json(&file_path).unwrap();

        assert_eq!(data, read_data);
    }

    #[test]
    fn test_init_ralph_ui_dir() {
        let temp_dir = TempDir::new().unwrap();

        let ralph_ui_dir = init_ralph_ui_dir(temp_dir.path()).unwrap();

        assert!(ralph_ui_dir.exists());
        assert!(ralph_ui_dir.join("sessions").exists());
        assert!(ralph_ui_dir.join("prds").exists());
        assert!(ralph_ui_dir.join("chat").exists());
        assert!(ralph_ui_dir.join("agents").exists());
        assert!(ralph_ui_dir.join("executions").exists());
        assert!(ralph_ui_dir.join(".gitignore").exists());

        // Check gitignore content
        let gitignore_content = fs::read_to_string(ralph_ui_dir.join(".gitignore")).unwrap();
        assert!(gitignore_content.contains("agents/"));
        assert!(gitignore_content.contains("executions/"));
    }
}
