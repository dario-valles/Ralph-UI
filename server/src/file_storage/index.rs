//! Index file management for efficient listing
//!
//! Index files provide quick access to lists of entities without reading
//! all individual files. They contain minimal metadata for listing views.

use super::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, FileResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Version of the index file format
const INDEX_VERSION: u32 = 1;

/// Generic index file wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexFile<T> {
    /// File format version
    pub version: u32,
    /// When this index was last updated
    pub updated_at: DateTime<Utc>,
    /// The indexed entries
    pub entries: Vec<T>,
}

impl<T> Default for IndexFile<T> {
    fn default() -> Self {
        Self {
            version: INDEX_VERSION,
            updated_at: Utc::now(),
            entries: Vec::new(),
        }
    }
}

/// Session index entry (minimal info for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIndexEntry {
    pub id: String,
    pub name: String,
    pub status: String,
    pub updated_at: DateTime<Utc>,
    pub task_count: u32,
    pub completed_task_count: u32,
}

/// PRD index entry (minimal info for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdIndexEntry {
    pub id: String,
    pub title: String,
    pub branch: String,
    pub updated_at: DateTime<Utc>,
    pub story_count: u32,
    pub passed_count: u32,
}

/// Chat index entry (minimal info for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatIndexEntry {
    pub id: String,
    pub title: Option<String>,
    pub prd_id: Option<String>,
    pub updated_at: DateTime<Utc>,
    pub message_count: u32,
}

/// Get the path to a specific index file
pub fn get_index_path(project_path: &Path, index_type: &str) -> std::path::PathBuf {
    get_ralph_ui_dir(project_path)
        .join(index_type)
        .join("index.json")
}

/// Read an index file, returning an empty index if it doesn't exist
pub fn read_index<T: serde::de::DeserializeOwned>(
    project_path: &Path,
    index_type: &str,
) -> FileResult<IndexFile<T>> {
    let index_path = get_index_path(project_path, index_type);

    if !index_path.exists() {
        return Ok(IndexFile {
            version: INDEX_VERSION,
            updated_at: Utc::now(),
            entries: Vec::new(),
        });
    }

    read_json(&index_path)
}

/// Write an index file
pub fn write_index<T: serde::Serialize>(
    project_path: &Path,
    index_type: &str,
    entries: Vec<T>,
) -> FileResult<()> {
    let index_path = get_index_path(project_path, index_type);

    // Ensure the directory exists
    if let Some(parent) = index_path.parent() {
        ensure_dir(parent)?;
    }

    let index = IndexFile {
        version: INDEX_VERSION,
        updated_at: Utc::now(),
        entries,
    };

    let content = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to serialize index: {}", e))?;

    atomic_write(&index_path, &content)
}

/// Update a single entry in an index file
pub fn update_index_entry<T, F>(
    project_path: &Path,
    index_type: &str,
    entry_id: &str,
    update_fn: F,
) -> FileResult<()>
where
    T: serde::de::DeserializeOwned + serde::Serialize + Clone,
    F: FnOnce(Option<T>) -> Option<T>,
    T: HasId,
{
    let mut index: IndexFile<T> = read_index(project_path, index_type)?;

    // Find existing entry
    let existing_idx = index.entries.iter().position(|e| e.get_id() == entry_id);

    // Apply update function
    let existing = existing_idx.map(|idx| index.entries[idx].clone());
    let updated = update_fn(existing);

    match (existing_idx, updated) {
        // Entry exists and should be updated
        (Some(idx), Some(entry)) => {
            index.entries[idx] = entry;
        }
        // Entry doesn't exist but should be added
        (None, Some(entry)) => {
            index.entries.push(entry);
        }
        // Entry exists but should be removed
        (Some(idx), None) => {
            index.entries.remove(idx);
        }
        // Entry doesn't exist and shouldn't be added
        (None, None) => {}
    }

    write_index(project_path, index_type, index.entries)
}

/// Remove an entry from an index file
pub fn remove_index_entry<T>(
    project_path: &Path,
    index_type: &str,
    entry_id: &str,
) -> FileResult<()>
where
    T: serde::de::DeserializeOwned + serde::Serialize + HasId,
{
    let mut index: IndexFile<T> = read_index(project_path, index_type)?;

    let initial_len = index.entries.len();
    index.entries.retain(|e| e.get_id() != entry_id);

    // Only write if something changed
    if index.entries.len() != initial_len {
        write_index(project_path, index_type, index.entries)?;
    }

    Ok(())
}

/// Rebuild an index from individual files in a directory
pub fn rebuild_index<T, F>(
    project_path: &Path,
    index_type: &str,
    file_to_entry: F,
) -> FileResult<Vec<T>>
where
    T: serde::Serialize + Clone,
    F: Fn(&Path) -> Option<T>,
{
    let dir_path = get_ralph_ui_dir(project_path).join(index_type);

    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    let entries: Vec<T> = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", dir_path, e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|ext| ext == "json")
                .unwrap_or(false)
        })
        .filter(|entry| {
            // Skip index.json itself
            entry.file_name() != "index.json"
        })
        .filter_map(|entry| file_to_entry(&entry.path()))
        .collect();

    write_index(project_path, index_type, entries.clone())?;

    Ok(entries)
}

/// Trait for types that have an ID field
pub trait HasId {
    fn get_id(&self) -> &str;
}

impl HasId for SessionIndexEntry {
    fn get_id(&self) -> &str {
        &self.id
    }
}

impl HasId for PrdIndexEntry {
    fn get_id(&self) -> &str {
        &self.id
    }
}

impl HasId for ChatIndexEntry {
    fn get_id(&self) -> &str {
        &self.id
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_session_entry(id: &str, name: &str) -> SessionIndexEntry {
        SessionIndexEntry {
            id: id.to_string(),
            name: name.to_string(),
            status: "active".to_string(),
            updated_at: Utc::now(),
            task_count: 5,
            completed_task_count: 2,
        }
    }

    #[test]
    fn test_read_empty_index() {
        let temp_dir = TempDir::new().unwrap();
        let index: IndexFile<SessionIndexEntry> = read_index(temp_dir.path(), "sessions").unwrap();

        assert_eq!(index.version, INDEX_VERSION);
        assert!(index.entries.is_empty());
    }

    #[test]
    fn test_write_and_read_index() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let entries = vec![
            create_test_session_entry("session-1", "Session 1"),
            create_test_session_entry("session-2", "Session 2"),
        ];

        write_index(temp_dir.path(), "sessions", entries.clone()).unwrap();

        let index: IndexFile<SessionIndexEntry> = read_index(temp_dir.path(), "sessions").unwrap();
        assert_eq!(index.entries.len(), 2);
        assert_eq!(index.entries[0].id, "session-1");
        assert_eq!(index.entries[1].id, "session-2");
    }

    #[test]
    fn test_update_index_entry() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Start with one entry
        write_index(
            temp_dir.path(),
            "sessions",
            vec![create_test_session_entry("session-1", "Session 1")],
        )
        .unwrap();

        // Update the entry
        update_index_entry::<SessionIndexEntry, _>(
            temp_dir.path(),
            "sessions",
            "session-1",
            |_| Some(create_test_session_entry("session-1", "Updated Session 1")),
        )
        .unwrap();

        let index: IndexFile<SessionIndexEntry> = read_index(temp_dir.path(), "sessions").unwrap();
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].name, "Updated Session 1");
    }

    #[test]
    fn test_remove_index_entry() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Start with two entries
        write_index(
            temp_dir.path(),
            "sessions",
            vec![
                create_test_session_entry("session-1", "Session 1"),
                create_test_session_entry("session-2", "Session 2"),
            ],
        )
        .unwrap();

        // Remove one entry
        remove_index_entry::<SessionIndexEntry>(temp_dir.path(), "sessions", "session-1").unwrap();

        let index: IndexFile<SessionIndexEntry> = read_index(temp_dir.path(), "sessions").unwrap();
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].id, "session-2");
    }

    #[test]
    fn test_get_index_path() {
        let project_path = Path::new("/home/user/my-project");
        let index_path = get_index_path(project_path, "sessions");
        assert_eq!(
            index_path,
            std::path::PathBuf::from("/home/user/my-project/.ralph-ui/sessions/index.json")
        );
    }
}
