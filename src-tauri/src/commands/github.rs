use crate::github::{CreatePRRequest, GitHubClient, Issue, PullRequest};

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
