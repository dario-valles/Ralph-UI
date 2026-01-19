// PRD Plan File Watcher - watches .ralph-ui/prds/*.md files for changes

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

/// Update event emitted when a watched PRD plan file changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdFileUpdate {
    pub session_id: String,
    pub content: String,
    pub path: String,
}

/// Result of starting a file watch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchResult {
    pub success: bool,
    pub path: String,
    pub initial_content: Option<String>,
    pub error: Option<String>,
}

/// Internal state for a single watched file
struct WatchedFile {
    path: PathBuf,
    #[allow(dead_code)] // Kept for debugging/logging purposes
    session_id: String,
    last_event: Instant,
}

/// Manager for all PRD file watchers
pub struct PrdFileWatcherManager {
    /// Maps session_id to watched file state
    watched_files: Arc<Mutex<HashMap<String, WatchedFile>>>,
    /// The file system watcher instance
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    /// Channel for sending updates to Tauri events
    update_sender: mpsc::UnboundedSender<PrdFileUpdate>,
}

impl PrdFileWatcherManager {
    /// Create a new watcher manager
    pub fn new(update_sender: mpsc::UnboundedSender<PrdFileUpdate>) -> Self {
        Self {
            watched_files: Arc::new(Mutex::new(HashMap::new())),
            watcher: Arc::new(Mutex::new(None)),
            update_sender,
        }
    }

    /// Start watching a PRD plan file
    pub fn watch_file(&self, session_id: &str, file_path: &Path) -> WatchResult {
        // Read initial content if file exists
        let initial_content = if file_path.exists() {
            std::fs::read_to_string(file_path).ok()
        } else {
            None
        };

        // Get or create the watcher
        let mut watcher_guard = match self.watcher.lock() {
            Ok(g) => g,
            Err(e) => {
                return WatchResult {
                    success: false,
                    path: file_path.to_string_lossy().to_string(),
                    initial_content: None,
                    error: Some(format!("Failed to acquire watcher lock: {}", e)),
                };
            }
        };

        // Initialize watcher if not already done
        if watcher_guard.is_none() {
            let watched_files = self.watched_files.clone();
            let sender = self.update_sender.clone();

            let watcher_result = RecommendedWatcher::new(
                move |res: Result<Event, notify::Error>| {
                    if let Ok(event) = res {
                        handle_file_event(event, &watched_files, &sender);
                    }
                },
                Config::default().with_poll_interval(Duration::from_millis(200)),
            );

            match watcher_result {
                Ok(w) => {
                    *watcher_guard = Some(w);
                }
                Err(e) => {
                    return WatchResult {
                        success: false,
                        path: file_path.to_string_lossy().to_string(),
                        initial_content: None,
                        error: Some(format!("Failed to create watcher: {}", e)),
                    };
                }
            }
        }

        // Add the file to watch list
        let parent_dir = match file_path.parent() {
            Some(p) => p,
            None => {
                return WatchResult {
                    success: false,
                    path: file_path.to_string_lossy().to_string(),
                    initial_content: None,
                    error: Some("Invalid file path: no parent directory".to_string()),
                };
            }
        };

        // Ensure parent directory exists
        if !parent_dir.exists() {
            if let Err(e) = std::fs::create_dir_all(parent_dir) {
                return WatchResult {
                    success: false,
                    path: file_path.to_string_lossy().to_string(),
                    initial_content: None,
                    error: Some(format!("Failed to create directory: {}", e)),
                };
            }
        }

        // Start watching the parent directory (to catch file creation)
        if let Some(ref mut watcher) = *watcher_guard {
            if let Err(e) = watcher.watch(parent_dir, RecursiveMode::NonRecursive) {
                return WatchResult {
                    success: false,
                    path: file_path.to_string_lossy().to_string(),
                    initial_content: None,
                    error: Some(format!("Failed to watch directory: {}", e)),
                };
            }
        }

        // Add to tracked files
        if let Ok(mut files) = self.watched_files.lock() {
            files.insert(
                session_id.to_string(),
                WatchedFile {
                    path: file_path.to_path_buf(),
                    session_id: session_id.to_string(),
                    last_event: Instant::now(),
                },
            );
        }

        WatchResult {
            success: true,
            path: file_path.to_string_lossy().to_string(),
            initial_content,
            error: None,
        }
    }

    /// Stop watching a PRD plan file
    pub fn unwatch_file(&self, session_id: &str) -> bool {
        if let Ok(mut files) = self.watched_files.lock() {
            files.remove(session_id).is_some()
        } else {
            false
        }
    }

    /// Check if a session is currently being watched
    pub fn is_watching(&self, session_id: &str) -> bool {
        if let Ok(files) = self.watched_files.lock() {
            files.contains_key(session_id)
        } else {
            false
        }
    }

    /// Get the current content of a watched file
    pub fn read_file_content(&self, session_id: &str) -> Option<String> {
        let path = {
            let files = self.watched_files.lock().ok()?;
            files.get(session_id)?.path.clone()
        };

        std::fs::read_to_string(&path).ok()
    }
}

/// Handle a file system event
fn handle_file_event(
    event: Event,
    watched_files: &Arc<Mutex<HashMap<String, WatchedFile>>>,
    sender: &mpsc::UnboundedSender<PrdFileUpdate>,
) {
    // Only handle modify/create events
    let is_relevant = matches!(
        event.kind,
        EventKind::Modify(_) | EventKind::Create(_)
    );

    if !is_relevant {
        return;
    }

    let files = match watched_files.lock() {
        Ok(f) => f,
        Err(_) => return,
    };

    for path in &event.paths {
        // Find which session this file belongs to
        for (session_id, watched_file) in files.iter() {
            if path == &watched_file.path {
                // Debounce: skip if we just processed this file
                if watched_file.last_event.elapsed() < Duration::from_millis(100) {
                    continue;
                }

                // Read the new content
                if let Ok(content) = std::fs::read_to_string(path) {
                    let update = PrdFileUpdate {
                        session_id: session_id.clone(),
                        content,
                        path: path.to_string_lossy().to_string(),
                    };

                    // Send update (ignore errors - receiver may have been dropped)
                    let _ = sender.send(update);
                }
            }
        }
    }

    // Update last_event time (requires a mutable borrow, so we do this separately)
    drop(files);
    if let Ok(mut files) = watched_files.lock() {
        for path in &event.paths {
            for watched_file in files.values_mut() {
                if path == &watched_file.path {
                    watched_file.last_event = Instant::now();
                }
            }
        }
    }
}

/// Generate the plan file path for a session
pub fn get_prd_plan_file_path(project_path: &str, session_id: &str, title: Option<&str>) -> PathBuf {
    let prd_name = title
        .map(|t| sanitize_filename(t))
        .unwrap_or_else(|| format!("prd-{}", session_id));

    Path::new(project_path)
        .join(".ralph-ui")
        .join("prds")
        .join(format!("{}.md", prd_name))
}

/// Sanitize a string for use as a filename
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .to_lowercase()
        .chars()
        .take(50) // Limit length
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("My PRD Document"), "my-prd-document");
        assert_eq!(sanitize_filename("Test/Invalid:Chars"), "test_invalid_chars");
        assert_eq!(sanitize_filename("Simple"), "simple");
    }

    #[test]
    fn test_get_prd_plan_file_path() {
        let path = get_prd_plan_file_path("/projects/myapp", "session-123", Some("My Feature PRD"));
        assert!(path.to_string_lossy().contains(".ralph-ui/prds/my-feature-prd.md"));

        let path_no_title = get_prd_plan_file_path("/projects/myapp", "session-123", None);
        assert!(path_no_title.to_string_lossy().contains("prd-session-123.md"));
    }
}
