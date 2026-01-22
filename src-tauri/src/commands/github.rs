use crate::github::{
    issue_converter::{filter_issues, issue_to_story, IssueImportOptions, IssueImportResult},
    CreatePRRequest, GitHubClient, Issue, PullRequest,
};
use crate::ralph_loop::RalphPrd;
use std::fs;
use std::path::{Path, PathBuf};

/// Create a pull request
#[tauri::command]
pub async fn github_create_pull_request(
    token: String,
    owner: String,
    repo: String,
    title: String,
    body: String,
    head: String,
    base: String,
    draft: bool,
) -> Result<PullRequest, String> {
    let client = GitHubClient::new(token, owner, repo);
    let request = CreatePRRequest {
        title,
        body,
        head,
        base,
        draft,
    };

    client.create_pull_request(request).await
}

/// Get a pull request by number
#[tauri::command]
pub async fn github_get_pull_request(
    token: String,
    owner: String,
    repo: String,
    number: u32,
) -> Result<PullRequest, String> {
    let client = GitHubClient::new(token, owner, repo);
    client.get_pull_request(number).await
}

/// List pull requests
#[tauri::command]
pub async fn github_list_pull_requests(
    token: String,
    owner: String,
    repo: String,
    state: Option<String>,
) -> Result<Vec<PullRequest>, String> {
    let client = GitHubClient::new(token, owner, repo);
    client.list_pull_requests(state).await
}

/// Get an issue by number
#[tauri::command]
pub async fn github_get_issue(
    token: String,
    owner: String,
    repo: String,
    number: u32,
) -> Result<Issue, String> {
    let client = GitHubClient::new(token, owner, repo);
    client.get_issue(number).await
}

/// List issues
#[tauri::command]
pub async fn github_list_issues(
    token: String,
    owner: String,
    repo: String,
    state: Option<String>,
) -> Result<Vec<Issue>, String> {
    let client = GitHubClient::new(token, owner, repo);
    client.list_issues(state).await
}

/// Get the PRD file path for a given project and PRD name
fn get_prd_path(project_path: &Path, prd_name: &str) -> PathBuf {
    project_path.join(".ralph-ui").join("prds").join(format!("{}.json", prd_name))
}

/// Load a PRD from the file system
fn load_prd_file(project_path: &Path, prd_name: &str) -> Result<RalphPrd, String> {
    let prd_path = get_prd_path(project_path, prd_name);
    let content = fs::read_to_string(&prd_path)
        .map_err(|e| format!("Failed to read PRD file: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse PRD file: {}", e))
}

/// Save a PRD to the file system
fn save_prd_file(project_path: &Path, prd_name: &str, prd: &RalphPrd) -> Result<(), String> {
    let prd_path = get_prd_path(project_path, prd_name);

    // Ensure directory exists
    if let Some(parent) = prd_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create PRD directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(prd)
        .map_err(|e| format!("Failed to serialize PRD: {}", e))?;
    fs::write(&prd_path, content)
        .map_err(|e| format!("Failed to write PRD file: {}", e))
}

/// Import GitHub issues into a Ralph PRD as stories
///
/// Fetches issues from a GitHub repository and converts them into Ralph stories,
/// then adds them to an existing or new PRD.
#[tauri::command]
pub async fn github_import_issues_to_prd(
    token: String,
    owner: String,
    repo: String,
    project_path: String,
    prd_name: String,
    labels: Option<Vec<String>>,
    include_body: Option<bool>,
    use_labels_as_tags: Option<bool>,
) -> Result<IssueImportResult, String> {
    log::info!(
        "[GitHub] Importing issues from {}/{} to PRD: {}",
        owner,
        repo,
        prd_name
    );

    // Fetch issues from GitHub
    let client = GitHubClient::new(token, owner.clone(), repo.clone());
    let all_issues = client.list_issues(Some("open".to_string())).await?;

    log::info!(
        "[GitHub] Found {} open issues in {}/{}",
        all_issues.len(),
        owner,
        repo
    );

    // Set up import options
    let options = IssueImportOptions {
        labels,
        milestone: None,
        id_prefix: "gh".to_string(),
        include_body: include_body.unwrap_or(true),
        use_labels_as_tags: use_labels_as_tags.unwrap_or(true),
    };

    // Filter issues based on labels
    let filtered_issues = filter_issues(&all_issues, &options);
    log::info!(
        "[GitHub] {} issues match filter criteria",
        filtered_issues.len()
    );

    // Load existing PRD or create a new one
    let project_dir = Path::new(&project_path);
    let mut prd = match load_prd_file(project_dir, &prd_name) {
        Ok(prd) => prd,
        Err(_) => {
            // Create a new PRD
            log::info!("[GitHub] Creating new PRD: {}", prd_name);
            RalphPrd {
                title: format!("Issues from {}/{}", owner, repo),
                description: Some(format!(
                    "Imported from GitHub repository {}/{}",
                    owner, repo
                )),
                branch: format!("ralph-{}", prd_name),
                stories: Vec::new(),
                metadata: None,
                executions: Vec::new(),
            }
        }
    };

    // Get existing story IDs to avoid duplicates
    let existing_ids: std::collections::HashSet<_> =
        prd.stories.iter().map(|s| s.id.clone()).collect();

    let mut imported_story_ids = Vec::new();
    let mut skipped_count = 0;
    let mut warnings = Vec::new();

    // Convert issues to stories
    for issue in filtered_issues {
        let story = issue_to_story(issue, &options);

        if existing_ids.contains(&story.id) {
            skipped_count += 1;
            warnings.push(format!(
                "Issue #{} already exists in PRD as story {}",
                issue.number, story.id
            ));
            continue;
        }

        log::info!(
            "[GitHub] Adding story {} from issue #{}",
            story.id,
            issue.number
        );
        imported_story_ids.push(story.id.clone());
        prd.stories.push(story);
    }

    // Save the updated PRD
    if !imported_story_ids.is_empty() {
        save_prd_file(project_dir, &prd_name, &prd)
            .map_err(|e| format!("Failed to save PRD: {}", e))?;
        log::info!(
            "[GitHub] Saved PRD with {} new stories",
            imported_story_ids.len()
        );
    }

    Ok(IssueImportResult {
        imported_count: imported_story_ids.len(),
        skipped_count,
        imported_story_ids,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_github_commands_compile() {
        // Just ensure the commands compile correctly
        // Actual testing would require mocking the GitHub API
        assert!(true);
    }
}
