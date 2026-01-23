//! Attachment file storage
//!
//! Stores chat attachments (images) in `.ralph-ui/attachments/{messageId}/`
//! Files are deleted when the chat session is deleted.

use super::{ensure_dir, get_ralph_ui_dir, FileResult};
use crate::models::ChatAttachment;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::fs;
use std::path::{Path, PathBuf};

/// Get the attachments directory for a project
pub fn get_attachments_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("attachments")
}

/// Get the directory for a specific message's attachments
pub fn get_message_attachments_dir(project_path: &Path, message_id: &str) -> PathBuf {
    get_attachments_dir(project_path).join(message_id)
}

/// Get the file path for a specific attachment
pub fn get_attachment_file_path(
    project_path: &Path,
    message_id: &str,
    attachment: &ChatAttachment,
) -> PathBuf {
    let extension = match attachment.mime_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    };

    let filename = attachment
        .filename
        .as_ref()
        .map(|f| {
            // Sanitize filename - remove path separators, null chars, and path traversal patterns
            let sanitized: String = f
                .chars()
                .filter(|c| !['/', '\\', '\0'].contains(c))
                .take(100)
                .collect();
            // Remove any remaining path traversal patterns (.. sequences)
            let sanitized = sanitized.replace("..", "");
            if sanitized.is_empty() {
                format!("{}.{}", attachment.id, extension)
            } else {
                sanitized
            }
        })
        .unwrap_or_else(|| format!("{}.{}", attachment.id, extension));

    get_message_attachments_dir(project_path, message_id).join(filename)
}

/// Save an attachment to disk, returning the file path
pub fn save_attachment(
    project_path: &Path,
    message_id: &str,
    attachment: &ChatAttachment,
) -> FileResult<PathBuf> {
    let message_dir = get_message_attachments_dir(project_path, message_id);
    ensure_dir(&message_dir)?;

    let file_path = get_attachment_file_path(project_path, message_id, attachment);

    // Decode base64 data
    let data = BASE64
        .decode(&attachment.data)
        .map_err(|e| format!("Failed to decode base64 attachment data: {}", e))?;

    // Write the file
    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to write attachment file {:?}: {}", file_path, e))?;

    log::debug!(
        "Saved attachment {} to {:?} ({} bytes)",
        attachment.id,
        file_path,
        data.len()
    );

    Ok(file_path)
}

/// Save all attachments for a message, returning their file paths
pub fn save_message_attachments(
    project_path: &Path,
    message_id: &str,
    attachments: &[ChatAttachment],
) -> FileResult<Vec<PathBuf>> {
    let mut paths = Vec::with_capacity(attachments.len());

    for attachment in attachments {
        let path = save_attachment(project_path, message_id, attachment)?;
        paths.push(path);
    }

    Ok(paths)
}

/// Delete all attachments for a message
pub fn delete_message_attachments(project_path: &Path, message_id: &str) -> FileResult<()> {
    let message_dir = get_message_attachments_dir(project_path, message_id);

    if message_dir.exists() {
        fs::remove_dir_all(&message_dir)
            .map_err(|e| format!("Failed to delete attachments directory {:?}: {}", message_dir, e))?;
        log::debug!("Deleted attachments directory: {:?}", message_dir);
    }

    Ok(())
}

/// Delete all attachments for a chat session
/// This iterates over all message IDs and deletes their attachment directories
pub fn delete_chat_attachments(project_path: &Path, message_ids: &[String]) -> FileResult<()> {
    for message_id in message_ids {
        // Ignore errors for individual messages - they may not have attachments
        let _ = delete_message_attachments(project_path, message_id);
    }

    // Clean up empty attachments directory if it exists
    let attachments_dir = get_attachments_dir(project_path);
    if attachments_dir.exists() {
        // Only remove if empty
        if fs::read_dir(&attachments_dir)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false)
        {
            let _ = fs::remove_dir(&attachments_dir);
        }
    }

    Ok(())
}

/// List all attachment files for a message
pub fn list_message_attachment_files(project_path: &Path, message_id: &str) -> FileResult<Vec<PathBuf>> {
    let message_dir = get_message_attachments_dir(project_path, message_id);

    if !message_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&message_dir)
        .map_err(|e| format!("Failed to read attachments directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                files.push(path);
            }
        }
    }

    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AttachmentMimeType;
    use tempfile::TempDir;

    fn create_test_attachment(id: &str) -> ChatAttachment {
        // Simple 1x1 red PNG (base64 encoded)
        let png_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

        ChatAttachment {
            id: id.to_string(),
            mime_type: AttachmentMimeType::ImagePng,
            data: png_data.to_string(),
            filename: Some(format!("test-{}.png", id)),
            size: 68,
            width: Some(1),
            height: Some(1),
        }
    }

    #[test]
    fn test_get_attachments_dir() {
        let project_path = Path::new("/home/user/project");
        let dir = get_attachments_dir(project_path);
        assert_eq!(dir, PathBuf::from("/home/user/project/.ralph-ui/attachments"));
    }

    #[test]
    fn test_get_message_attachments_dir() {
        let project_path = Path::new("/home/user/project");
        let dir = get_message_attachments_dir(project_path, "msg-123");
        assert_eq!(
            dir,
            PathBuf::from("/home/user/project/.ralph-ui/attachments/msg-123")
        );
    }

    #[test]
    fn test_get_attachment_file_path() {
        let project_path = Path::new("/home/user/project");
        let attachment = create_test_attachment("att-1");
        let path = get_attachment_file_path(project_path, "msg-123", &attachment);
        assert_eq!(
            path,
            PathBuf::from("/home/user/project/.ralph-ui/attachments/msg-123/test-att-1.png")
        );
    }

    #[test]
    fn test_get_attachment_file_path_no_filename() {
        let project_path = Path::new("/home/user/project");
        let mut attachment = create_test_attachment("att-1");
        attachment.filename = None;
        let path = get_attachment_file_path(project_path, "msg-123", &attachment);
        assert_eq!(
            path,
            PathBuf::from("/home/user/project/.ralph-ui/attachments/msg-123/att-1.png")
        );
    }

    #[test]
    fn test_save_and_list_attachments() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let attachment = create_test_attachment("att-1");
        let path = save_attachment(temp_dir.path(), "msg-123", &attachment).unwrap();

        assert!(path.exists());

        let files = list_message_attachment_files(temp_dir.path(), "msg-123").unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0], path);
    }

    #[test]
    fn test_save_multiple_attachments() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let attachments = vec![
            create_test_attachment("att-1"),
            create_test_attachment("att-2"),
        ];

        let paths = save_message_attachments(temp_dir.path(), "msg-123", &attachments).unwrap();
        assert_eq!(paths.len(), 2);

        for path in &paths {
            assert!(path.exists());
        }
    }

    #[test]
    fn test_delete_message_attachments() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let attachment = create_test_attachment("att-1");
        let path = save_attachment(temp_dir.path(), "msg-123", &attachment).unwrap();
        assert!(path.exists());

        delete_message_attachments(temp_dir.path(), "msg-123").unwrap();
        assert!(!path.exists());

        let message_dir = get_message_attachments_dir(temp_dir.path(), "msg-123");
        assert!(!message_dir.exists());
    }

    #[test]
    fn test_delete_chat_attachments() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Create attachments for multiple messages
        save_attachment(temp_dir.path(), "msg-1", &create_test_attachment("att-1")).unwrap();
        save_attachment(temp_dir.path(), "msg-2", &create_test_attachment("att-2")).unwrap();

        let msg1_dir = get_message_attachments_dir(temp_dir.path(), "msg-1");
        let msg2_dir = get_message_attachments_dir(temp_dir.path(), "msg-2");
        assert!(msg1_dir.exists());
        assert!(msg2_dir.exists());

        delete_chat_attachments(
            temp_dir.path(),
            &["msg-1".to_string(), "msg-2".to_string()],
        )
        .unwrap();

        assert!(!msg1_dir.exists());
        assert!(!msg2_dir.exists());
    }

    #[test]
    fn test_delete_nonexistent_attachments() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Should not error
        delete_message_attachments(temp_dir.path(), "nonexistent").unwrap();
        delete_chat_attachments(temp_dir.path(), &["nonexistent".to_string()]).unwrap();
    }

    #[test]
    fn test_filename_sanitization() {
        let project_path = Path::new("/home/user/project");
        let mut attachment = create_test_attachment("att-1");
        attachment.filename = Some("../../etc/passwd".to_string());

        let path = get_attachment_file_path(project_path, "msg-123", &attachment);
        // Should not contain path traversal
        assert!(!path.to_string_lossy().contains(".."));
        assert!(path.starts_with("/home/user/project/.ralph-ui/attachments/msg-123"));
    }
}
