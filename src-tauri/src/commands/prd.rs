// PRD Tauri commands - File-based storage only
// NOTE: Legacy SQLite-based PRD commands have been removed.
// All PRD operations now use file-based storage in .ralph-ui/prds/

use serde::{Deserialize, Serialize};

/// A PRD file found in the .ralph-ui/prds/ directory
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PRDFile {
    /// Unique identifier derived from filename (e.g., "file:new-feature-prd-abc123")
    pub id: String,
    /// Title extracted from first # heading or derived from filename
    pub title: String,
    /// Full markdown content
    pub content: String,
    /// Path to the project
    pub project_path: String,
    /// File path relative to project
    pub file_path: String,
    /// File modification time as ISO string
    pub modified_at: String,
    /// Whether this PRD has an associated .json file (Ralph Loop initialized)
    pub has_ralph_json: bool,
    /// Whether this PRD has a progress file
    pub has_progress: bool,
}

/// Extract title from markdown content or fallback to filename
fn extract_markdown_title(content: &str, fallback_name: &str) -> String {
    content.lines()
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .unwrap_or_else(|| {
            // Convert filename to title (e.g., "new-feature-prd" -> "New Feature Prd")
            let name_part = fallback_name.rsplitn(2, '-').last().unwrap_or(fallback_name);
            name_part.split('-')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().chain(chars).collect()
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
}

/// Scan .ralph-ui/prds/ directory for PRD markdown files
#[tauri::command]
pub async fn scan_prd_files(
    project_path: String,
) -> Result<Vec<PRDFile>, String> {
    use std::fs;
    use std::path::Path;

    let prds_dir = Path::new(&project_path).join(".ralph-ui").join("prds");

    if !prds_dir.exists() {
        return Ok(vec![]);
    }

    let mut prd_files = Vec::new();

    let entries = fs::read_dir(&prds_dir)
        .map_err(|e| format!("Failed to read prds directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .md files, skip -prompt.md (Ralph Loop prompts)
        if let Some(ext) = path.extension() {
            if ext != "md" {
                continue;
            }
        } else {
            continue;
        }

        let filename = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");

        // Skip prompt files (e.g., my-prd-prompt.md)
        if filename.ends_with("-prompt") {
            continue;
        }

        // Read file content
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;

        // Extract title from first # heading or use filename
        let title = extract_markdown_title(&content, filename);

        // Get file modification time
        let metadata = fs::metadata(&path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;
        let modified_at = metadata.modified()
            .map(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                datetime.to_rfc3339()
            })
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

        // Check for associated files
        let json_path = prds_dir.join(format!("{}.json", filename));
        let progress_path = prds_dir.join(format!("{}-progress.txt", filename));

        let file_path = format!(".ralph-ui/prds/{}.md", filename);

        prd_files.push(PRDFile {
            id: format!("file:{}", filename),
            title,
            content,
            project_path: project_path.clone(),
            file_path,
            modified_at,
            has_ralph_json: json_path.exists(),
            has_progress: progress_path.exists(),
        });
    }

    // Sort by modification time (newest first)
    prd_files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(prd_files)
}

/// Get a PRD file by name from .ralph-ui/prds/
#[tauri::command]
pub async fn get_prd_file(
    project_path: String,
    prd_name: String,
) -> Result<PRDFile, String> {
    use std::fs;
    use std::path::Path;

    let prds_dir = Path::new(&project_path).join(".ralph-ui").join("prds");
    let file_path = prds_dir.join(format!("{}.md", prd_name));

    if !file_path.exists() {
        return Err(format!("PRD file not found: {}.md", prd_name));
    }

    // Read file content
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Extract title from first # heading or use filename
    let title = extract_markdown_title(&content, &prd_name);

    // Get file modification time
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let modified_at = metadata.modified()
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.to_rfc3339()
        })
        .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

    // Check for associated files
    let json_path = prds_dir.join(format!("{}.json", prd_name));
    let progress_path = prds_dir.join(format!("{}-progress.txt", prd_name));

    Ok(PRDFile {
        id: format!("file:{}", prd_name),
        title,
        content,
        project_path,
        file_path: format!(".ralph-ui/prds/{}.md", prd_name),
        modified_at,
        has_ralph_json: json_path.exists(),
        has_progress: progress_path.exists(),
    })
}

/// Update a PRD file's content
#[tauri::command]
pub async fn update_prd_file(
    project_path: String,
    prd_name: String,
    content: String,
) -> Result<PRDFile, String> {
    use std::fs;
    use std::path::Path;

    let prds_dir = Path::new(&project_path).join(".ralph-ui").join("prds");
    let file_path = prds_dir.join(format!("{}.md", prd_name));

    if !file_path.exists() {
        return Err(format!("PRD file not found: {}.md", prd_name));
    }

    // Write updated content
    fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Return updated PRDFile
    get_prd_file(project_path, prd_name).await
}

/// Result of deleting a PRD file
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePrdResult {
    /// Files that were deleted
    pub deleted_files: Vec<String>,
    /// Worktrees that were removed
    pub removed_worktrees: Vec<String>,
    /// Branches that were deleted
    pub deleted_branches: Vec<String>,
    /// Any warnings during deletion
    pub warnings: Vec<String>,
}

/// Delete a PRD file and all associated resources (JSON, progress, worktrees, branches)
#[tauri::command]
pub async fn delete_prd_file(
    project_path: String,
    prd_name: String,
) -> Result<DeletePrdResult, String> {
    use std::fs;
    use std::path::Path;

    let prds_dir = Path::new(&project_path).join(".ralph-ui").join("prds");
    let mut deleted_files = Vec::new();
    let mut removed_worktrees = Vec::new();
    let mut deleted_branches = Vec::new();
    let mut warnings = Vec::new();

    // 1. Read the PRD JSON to get metadata (worktree path, branch name)
    let json_path = prds_dir.join(format!("{}.json", prd_name));
    let mut worktree_path_from_metadata: Option<String> = None;
    let mut branch_name: Option<String> = None;

    if json_path.exists() {
        if let Ok(json_content) = fs::read_to_string(&json_path) {
            if let Ok(prd) = serde_json::from_str::<serde_json::Value>(&json_content) {
                // Extract lastWorktreePath from metadata
                if let Some(metadata) = prd.get("metadata") {
                    if let Some(wt_path) = metadata.get("lastWorktreePath").and_then(|v| v.as_str()) {
                        worktree_path_from_metadata = Some(wt_path.to_string());
                    }
                }
                // Extract branch name
                if let Some(branch) = prd.get("branch").and_then(|v| v.as_str()) {
                    branch_name = Some(branch.to_string());
                }
            }
        }
    }

    // 2. Remove worktree if it exists
    if let Some(ref wt_path) = worktree_path_from_metadata {
        let worktree_dir = Path::new(wt_path);
        if worktree_dir.exists() {
            // First, try to remove the worktree via git
            match crate::git::GitManager::new(&project_path) {
                Ok(git_mgr) => {
                    if let Err(e) = git_mgr.remove_worktree(wt_path) {
                        warnings.push(format!("Failed to remove worktree via git: {}. Will try deleting directory.", e));
                    } else {
                        removed_worktrees.push(wt_path.clone());
                    }
                }
                Err(e) => {
                    warnings.push(format!("Failed to open git repo: {}", e));
                }
            }

            // Also delete the worktree directory if it still exists
            if worktree_dir.exists() {
                if let Err(e) = fs::remove_dir_all(worktree_dir) {
                    warnings.push(format!("Failed to delete worktree directory: {}", e));
                } else if !removed_worktrees.contains(wt_path) {
                    removed_worktrees.push(wt_path.clone());
                }
            }
        }
    }

    // 3. Try to find and remove worktrees matching the PRD branch name pattern
    if let Some(ref branch) = branch_name {
        if let Ok(git_mgr) = crate::git::GitManager::new(&project_path) {
            // List all worktrees and find ones related to this PRD
            if let Ok(worktrees) = git_mgr.list_worktrees() {
                for wt in worktrees {
                    // Check if worktree branch matches or contains PRD branch
                    if let Some(ref wt_branch) = wt.branch {
                        let wt_branch_name = wt_branch.replace("refs/heads/", "");
                        if wt_branch_name == *branch || wt_branch_name.contains(branch.as_str()) {
                            // This worktree belongs to this PRD
                            if let Err(e) = git_mgr.remove_worktree(&wt.path) {
                                warnings.push(format!("Failed to remove worktree {}: {}", wt.path, e));
                            } else {
                                removed_worktrees.push(wt.path.clone());
                            }
                            // Also delete the directory
                            let wt_dir = Path::new(&wt.path);
                            if wt_dir.exists() {
                                let _ = fs::remove_dir_all(wt_dir);
                            }
                        }
                    }
                }
            }

            // 4. Delete the branch if it exists and is not currently checked out
            if let Ok(branches) = git_mgr.list_branches() {
                for b in branches {
                    if b.name == *branch || b.name.contains(branch.as_str()) {
                        if !b.is_head {
                            // Try to delete the branch
                            match git_mgr.delete_branch(&b.name) {
                                Ok(_) => {
                                    deleted_branches.push(b.name.clone());
                                }
                                Err(e) => {
                                    warnings.push(format!("Failed to delete branch {}: {}", b.name, e));
                                }
                            }
                        } else {
                            warnings.push(format!("Cannot delete branch {} - it is currently checked out", b.name));
                        }
                    }
                }
            }
        }
    }

    // 5. Delete the PRD files
    let files_to_delete = vec![
        prds_dir.join(format!("{}.md", prd_name)),
        prds_dir.join(format!("{}.json", prd_name)),
        prds_dir.join(format!("{}-progress.txt", prd_name)),
        prds_dir.join(format!("{}-prompt.md", prd_name)),
    ];

    for file_path in files_to_delete {
        if file_path.exists() {
            match fs::remove_file(&file_path) {
                Ok(_) => {
                    deleted_files.push(file_path.to_string_lossy().to_string());
                }
                Err(e) => {
                    warnings.push(format!("Failed to delete {}: {}", file_path.display(), e));
                }
            }
        }
    }

    // Check that at least the main .md file was deleted
    let md_path = prds_dir.join(format!("{}.md", prd_name));
    if md_path.exists() {
        return Err(format!("Failed to delete PRD file: {}.md still exists", prd_name));
    }

    log::info!(
        "[PRD] Deleted PRD '{}': {} files, {} worktrees, {} branches, {} warnings",
        prd_name,
        deleted_files.len(),
        removed_worktrees.len(),
        deleted_branches.len(),
        warnings.len()
    );

    Ok(DeletePrdResult {
        deleted_files,
        removed_worktrees,
        deleted_branches,
        warnings,
    })
}
