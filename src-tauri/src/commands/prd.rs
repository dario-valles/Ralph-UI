// PRD Tauri commands
// NOTE: PRD content is always markdown. JSON format support was removed as the app is not yet released.

use crate::database::{Database, prd::*};
use crate::utils::{lock_db, ResultExt};
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePRDRequest {
    pub title: String,
    pub description: Option<String>,
    pub template_id: Option<String>,
    pub project_path: Option<String>,
    pub prd_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePRDRequest {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
}

/// Create a new PRD document
#[tauri::command]
pub async fn create_prd(
    request: CreatePRDRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = lock_db(&db)?;

    let now = chrono::Utc::now().to_rfc3339();
    let prd_id = Uuid::new_v4().to_string();

    // Load template if provided, otherwise use empty markdown
    let content = if let Some(template_id) = &request.template_id {
        let template = db.get_template(template_id)
            .with_context("Failed to load template")?;
        template.template_structure
    } else {
        // Default empty markdown PRD structure
        "## Overview\n\n## Requirements\n\n## Tasks\n\n".to_string()
    };

    let prd = PRDDocument {
        id: prd_id,
        title: request.title,
        description: request.description,
        template_id: request.template_id,
        content,
        quality_score_completeness: None,
        quality_score_clarity: None,
        quality_score_actionability: None,
        quality_score_overall: None,
        created_at: now.clone(),
        updated_at: now,
        version: 1,
        project_path: request.project_path,
        source_chat_session_id: None,
        prd_type: request.prd_type,
        extracted_structure: None,
    };

    db.create_prd(&prd)
        .with_context("Failed to create PRD")?;

    Ok(prd)
}

/// Get a PRD document by ID
#[tauri::command]
pub async fn get_prd(
    id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = lock_db(&db)?;

    db.get_prd(&id)
        .with_context("PRD not found")
}

/// Update a PRD document
#[tauri::command]
pub async fn update_prd(
    request: UpdatePRDRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = lock_db(&db)?;

    let mut prd = db.get_prd(&request.id)
        .with_context("PRD not found")?;

    if let Some(title) = request.title {
        prd.title = title;
    }
    if let Some(description) = request.description {
        prd.description = Some(description);
    }
    if let Some(content) = request.content {
        prd.content = content;
    }

    prd.updated_at = chrono::Utc::now().to_rfc3339();
    prd.version += 1;

    db.update_prd(&prd)
        .with_context("Failed to update PRD")?;

    Ok(prd)
}

/// Delete a PRD document
#[tauri::command]
pub async fn delete_prd(
    id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = lock_db(&db)?;

    db.delete_prd(&id)
        .with_context("Failed to delete PRD")
}

/// List all PRD documents
#[tauri::command]
pub async fn list_prds(
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<PRDDocument>, String> {
    let db = lock_db(&db)?;

    db.list_prds()
        .with_context("Failed to list PRDs")
}

/// Get all PRD templates
#[tauri::command]
pub async fn list_prd_templates(
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<PRDTemplate>, String> {
    let db = lock_db(&db)?;

    db.list_templates()
        .with_context("Failed to list templates")
}

/// Export PRD to different formats (content is always markdown)
#[tauri::command]
pub async fn export_prd(
    prd_id: String,
    format: String,
    db: State<'_, Mutex<Database>>,
) -> Result<String, String> {
    let db = lock_db(&db)?;

    let prd = db.get_prd(&prd_id)
        .with_context("PRD not found")?;

    match format.as_str() {
        "markdown" => Ok(format_prd_markdown(&prd)),
        "yaml" => {
            let data = serde_json::json!({
                "title": prd.title,
                "description": prd.description,
                "content": prd.content
            });
            serde_yaml::to_string(&data)
                .with_context("Failed to convert to YAML")
        }
        "json" => {
            let data = serde_json::json!({
                "title": prd.title,
                "description": prd.description,
                "content": prd.content
            });
            Ok(serde_json::to_string_pretty(&data).unwrap_or_default())
        }
        _ => Err(format!("Unsupported format: {}", format))
    }
}

/// Analyze PRD quality (markdown content)
#[tauri::command]
pub async fn analyze_prd_quality(
    prd_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = lock_db(&db)?;

    let mut prd = db.get_prd(&prd_id)
        .with_context("PRD not found")?;

    // Calculate quality scores for markdown content
    let completeness = calculate_completeness(&prd.content);
    let clarity = calculate_clarity(&prd.content);
    let actionability = calculate_actionability(&prd.content);
    let overall = (completeness + clarity + actionability) / 3;

    prd.quality_score_completeness = Some(completeness);
    prd.quality_score_clarity = Some(clarity);
    prd.quality_score_actionability = Some(actionability);
    prd.quality_score_overall = Some(overall);
    prd.updated_at = chrono::Utc::now().to_rfc3339();

    db.update_prd(&prd)
        .with_context("Failed to update PRD")?;

    Ok(prd)
}

// Helper functions

/// Format PRD as markdown with title
fn format_prd_markdown(prd: &PRDDocument) -> String {
    let mut markdown = format!("# {}\n\n", prd.title);
    if let Some(desc) = &prd.description {
        if !desc.is_empty() {
            markdown.push_str(&format!("{}\n\n", desc));
        }
    }
    markdown.push_str(&prd.content);
    markdown
}

// Quality scoring constants
mod quality_scoring {
    /// Points awarded per key section found
    pub const POINTS_PER_SECTION: i32 = 15;
    /// Maximum points for key sections
    pub const MAX_SECTION_POINTS: i32 = 60;

    /// Content length thresholds
    pub const CONTENT_LENGTH_HIGH: usize = 2000;
    pub const CONTENT_LENGTH_MEDIUM: usize = 1000;
    pub const CONTENT_LENGTH_LOW: usize = 500;

    /// Points for content length
    pub const POINTS_CONTENT_HIGH: i32 = 30;
    pub const POINTS_CONTENT_MEDIUM: i32 = 20;
    pub const POINTS_CONTENT_LOW: i32 = 10;

    /// Heading count thresholds
    pub const HEADINGS_HIGH: usize = 5;
    pub const HEADINGS_MEDIUM: usize = 3;

    /// Points for heading structure
    pub const POINTS_HEADINGS_HIGH: i32 = 10;
    pub const POINTS_HEADINGS_MEDIUM: i32 = 5;

    /// Clarity scoring
    pub const CLARITY_BASE_SCORE: i32 = 80;
    pub const PENALTY_PER_VAGUE_TERM: i32 = 3;
    pub const MAX_VAGUE_PENALTY: i32 = 15;
    pub const POINTS_HAS_LISTS: i32 = 10;
    pub const POINTS_HAS_CODE_BLOCKS: i32 = 5;
    pub const PENALTY_SHORT_CONTENT: i32 = 20;
    pub const SHORT_CONTENT_THRESHOLD: usize = 200;

    /// Actionability scoring
    pub const POINTS_HAS_TASK_SECTION: i32 = 30;
    pub const POINTS_PER_LIST_ITEM: i32 = 3;
    pub const MAX_LIST_ITEM_POINTS: i32 = 30;
    pub const POINTS_PER_TASK_HEADING: i32 = 5;
    pub const MAX_TASK_HEADING_POINTS: i32 = 30;
    pub const POINTS_PER_ACTION_VERB: i32 = 2;
    pub const MAX_ACTION_VERB_POINTS: i32 = 20;
}

use quality_scoring::*;

/// Calculate completeness score for markdown PRD
fn calculate_completeness(content: &str) -> i32 {
    let mut score = 0;
    let content_lower = content.to_lowercase();

    // Check for key sections (indicated by headings)
    let key_sections = ["overview", "requirements", "tasks", "goals", "scope", "background"];
    let found_sections = key_sections.iter()
        .filter(|s| content_lower.contains(&format!("# {}", s)) || content_lower.contains(&format!("## {}", s)))
        .count();

    score += (found_sections as i32 * POINTS_PER_SECTION).min(MAX_SECTION_POINTS);

    // Check content length
    if content.len() > CONTENT_LENGTH_HIGH {
        score += POINTS_CONTENT_HIGH;
    } else if content.len() > CONTENT_LENGTH_MEDIUM {
        score += POINTS_CONTENT_MEDIUM;
    } else if content.len() > CONTENT_LENGTH_LOW {
        score += POINTS_CONTENT_LOW;
    }

    // Bonus for multiple headings (well-structured)
    let heading_count = content.lines()
        .filter(|line| line.starts_with('#'))
        .count();
    if heading_count >= HEADINGS_HIGH {
        score += POINTS_HEADINGS_HIGH;
    } else if heading_count >= HEADINGS_MEDIUM {
        score += POINTS_HEADINGS_MEDIUM;
    }

    score.min(100)
}

/// Calculate clarity score for markdown PRD
fn calculate_clarity(content: &str) -> i32 {
    let mut score = CLARITY_BASE_SCORE;
    let content_lower = content.to_lowercase();

    // Check for vague terms
    let vague_terms = ["simple", "easy", "fast", "good", "better", "nice", "clean", "somehow", "maybe", "probably"];
    for term in vague_terms {
        let count = content_lower.matches(term).count();
        score -= (count as i32 * PENALTY_PER_VAGUE_TERM).min(MAX_VAGUE_PENALTY);
    }

    // Check for lists (indicates structured thinking)
    if content.contains("- ") || content.contains("* ") || content.contains("1. ") {
        score += POINTS_HAS_LISTS;
    }

    // Check for code blocks
    if content.contains("```") {
        score += POINTS_HAS_CODE_BLOCKS;
    }

    // Penalize very short content
    if content.len() < SHORT_CONTENT_THRESHOLD {
        score -= PENALTY_SHORT_CONTENT;
    }

    score.max(0).min(100)
}

/// Calculate actionability score for markdown PRD
fn calculate_actionability(content: &str) -> i32 {
    let content_lower = content.to_lowercase();

    // Look for task-related sections
    let has_tasks = content_lower.contains("## task")
        || content_lower.contains("### task")
        || content_lower.contains("## implementation")
        || content_lower.contains("## epic")
        || content_lower.contains("### epic");

    // Count list items (potential tasks)
    let list_items: usize = content.lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.starts_with("- ") || trimmed.starts_with("* ") ||
            (trimmed.len() > 2 && trimmed.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) && trimmed.contains(". "))
        })
        .count();

    // Count task headings (level 3+)
    let task_headings: usize = content.lines()
        .filter(|line| line.starts_with("### ") || line.starts_with("#### "))
        .count();

    let mut score = 0;

    if has_tasks {
        score += POINTS_HAS_TASK_SECTION;
    }

    score += (list_items as i32 * POINTS_PER_LIST_ITEM).min(MAX_LIST_ITEM_POINTS);
    score += (task_headings as i32 * POINTS_PER_TASK_HEADING).min(MAX_TASK_HEADING_POINTS);

    // Bonus for action verbs
    let action_verbs = ["implement", "create", "build", "add", "update", "fix", "refactor", "design", "test", "deploy"];
    let action_count: usize = action_verbs.iter()
        .map(|v| content_lower.matches(v).count())
        .sum();
    score += (action_count as i32 * POINTS_PER_ACTION_VERB).min(MAX_ACTION_VERB_POINTS);

    score.min(100)
}

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
