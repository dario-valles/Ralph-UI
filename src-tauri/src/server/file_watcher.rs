//! Polling-based file watcher for server mode
//!
//! Since browser mode doesn't have access to native file system events,
//! this module provides a polling-based alternative that checks for file
//! changes at regular intervals and broadcasts updates via WebSocket.

use super::events::EventBroadcaster;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tokio::sync::mpsc;

/// Update event emitted when a watched file changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileUpdate {
    pub session_id: String,
    pub content: String,
    pub path: String,
}

/// Result of starting a file watch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFileResponse {
    pub success: bool,
    pub path: String,
    pub initial_content: Option<String>,
    pub error: Option<String>,
}

/// Internal state for a watched file
#[derive(Debug, Clone)]
struct WatchedFile {
    path: PathBuf,
    last_modified: Option<SystemTime>,
    last_content_hash: u64,
}

/// Server-side file watcher manager using polling
pub struct ServerFileWatcher {
    /// Maps session_id to watched file state
    watched_files: Arc<Mutex<HashMap<String, WatchedFile>>>,
    /// Shutdown signal sender
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl ServerFileWatcher {
    /// Create a new file watcher and start the polling task
    pub fn new(broadcaster: Arc<EventBroadcaster>) -> Self {
        let watched_files = Arc::new(Mutex::new(HashMap::new()));
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        // Spawn the polling task
        let files_clone = watched_files.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(2));

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        check_for_changes(&files_clone, &broadcaster);
                    }
                    _ = shutdown_rx.recv() => {
                        log::debug!("File watcher shutting down");
                        break;
                    }
                }
            }
        });

        Self {
            watched_files,
            shutdown_tx: Some(shutdown_tx),
        }
    }

    /// Start watching a file for changes
    pub fn watch_file(&self, session_id: &str, file_path: PathBuf) -> WatchFileResponse {
        // Read initial content and metadata
        let (initial_content, last_modified) = if file_path.exists() {
            let content = std::fs::read_to_string(&file_path).ok();
            let mtime = std::fs::metadata(&file_path)
                .ok()
                .and_then(|m| m.modified().ok());
            (content, mtime)
        } else {
            (None, None)
        };

        let content_hash = initial_content
            .as_ref()
            .map(|c| hash_content(c))
            .unwrap_or(0);

        // Ensure parent directory exists
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return WatchFileResponse {
                        success: false,
                        path: file_path.to_string_lossy().to_string(),
                        initial_content: None,
                        error: Some(format!("Failed to create directory: {}", e)),
                    };
                }
            }
        }

        // Add to watched files
        if let Ok(mut files) = self.watched_files.lock() {
            files.insert(
                session_id.to_string(),
                WatchedFile {
                    path: file_path.clone(),
                    last_modified,
                    last_content_hash: content_hash,
                },
            );
        }

        WatchFileResponse {
            success: true,
            path: file_path.to_string_lossy().to_string(),
            initial_content,
            error: None,
        }
    }

    /// Stop watching a file
    pub fn unwatch_file(&self, session_id: &str) -> bool {
        if let Ok(mut files) = self.watched_files.lock() {
            files.remove(session_id).is_some()
        } else {
            false
        }
    }

    /// Check if a session is being watched
    pub fn is_watching(&self, session_id: &str) -> bool {
        if let Ok(files) = self.watched_files.lock() {
            files.contains_key(session_id)
        } else {
            false
        }
    }
}

impl Drop for ServerFileWatcher {
    fn drop(&mut self) {
        // Signal shutdown to the polling task
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.try_send(());
        }
    }
}

/// Simple hash function for content comparison
fn hash_content(content: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

/// Check all watched files for changes
fn check_for_changes(
    watched_files: &Arc<Mutex<HashMap<String, WatchedFile>>>,
    broadcaster: &EventBroadcaster,
) {
    let mut updates = Vec::new();

    // First pass: identify changed files
    if let Ok(files) = watched_files.lock() {
        for (session_id, watched) in files.iter() {
            if !watched.path.exists() {
                continue;
            }

            // Check modification time first (cheap check)
            let current_mtime = std::fs::metadata(&watched.path)
                .ok()
                .and_then(|m| m.modified().ok());

            let mtime_changed = match (current_mtime, watched.last_modified) {
                (Some(current), Some(last)) => current != last,
                (Some(_), None) => true, // File now exists
                _ => false,
            };

            if mtime_changed {
                // Read and hash content to confirm actual change
                if let Ok(content) = std::fs::read_to_string(&watched.path) {
                    let new_hash = hash_content(&content);
                    if new_hash != watched.last_content_hash {
                        updates.push((
                            session_id.clone(),
                            watched.path.clone(),
                            content,
                            current_mtime,
                            new_hash,
                        ));
                    }
                }
            }
        }
    }

    // Second pass: update state and broadcast
    if !updates.is_empty() {
        if let Ok(mut files) = watched_files.lock() {
            for (session_id, path, content, mtime, hash) in updates {
                // Update tracking state
                if let Some(watched) = files.get_mut(&session_id) {
                    watched.last_modified = mtime;
                    watched.last_content_hash = hash;
                }

                // Broadcast the update via WebSocket
                // Use same event name as Tauri for consistency
                broadcaster.broadcast(
                    "prd:file_updated",
                    FileUpdate {
                        session_id: session_id.clone(),
                        content,
                        path: path.to_string_lossy().to_string(),
                    },
                );

                log::debug!("File change detected for session {}", session_id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_content() {
        let hash1 = hash_content("hello world");
        let hash2 = hash_content("hello world");
        let hash3 = hash_content("different content");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_watch_file_response_serialization() {
        let response = WatchFileResponse {
            success: true,
            path: "/path/to/file.md".to_string(),
            initial_content: Some("# Hello".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"initialContent\""));
    }
}
