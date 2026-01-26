// GitHub API integration for PRs and Issues

pub mod issue_converter;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// GitHub Pull Request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u32,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub created_at: String,
    pub updated_at: String,
    pub merged: bool,
}

/// GitHub Issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub number: u32,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub labels: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// PR creation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePRRequest {
    pub title: String,
    pub body: String,
    pub head: String,
    pub base: String,
    pub draft: bool,
}

/// GitHub API client
pub struct GitHubClient {
    token: String,
    owner: String,
    repo: String,
}

impl GitHubClient {
    /// Create a new GitHub client
    pub fn new(token: String, owner: String, repo: String) -> Self {
        Self { token, owner, repo }
    }

    /// Create a pull request
    pub async fn create_pull_request(
        &self,
        request: CreatePRRequest,
    ) -> Result<PullRequest, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls",
            self.owner, self.repo
        );

        let mut body = HashMap::new();
        body.insert("title", request.title);
        body.insert("body", request.body);
        body.insert("head", request.head);
        body.insert("base", request.base);
        body.insert("draft", request.draft.to_string());

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "ralph-ui")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to create PR: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error ({}): {}", status, text));
        }

        let pr_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(PullRequest {
            number: pr_data["number"].as_u64().unwrap_or(0) as u32,
            title: pr_data["title"].as_str().unwrap_or("").to_string(),
            body: pr_data["body"].as_str().map(|s| s.to_string()),
            state: pr_data["state"].as_str().unwrap_or("").to_string(),
            html_url: pr_data["html_url"].as_str().unwrap_or("").to_string(),
            head_branch: pr_data["head"]["ref"].as_str().unwrap_or("").to_string(),
            base_branch: pr_data["base"]["ref"].as_str().unwrap_or("").to_string(),
            created_at: pr_data["created_at"].as_str().unwrap_or("").to_string(),
            updated_at: pr_data["updated_at"].as_str().unwrap_or("").to_string(),
            merged: pr_data["merged"].as_bool().unwrap_or(false),
        })
    }

    /// Get a pull request by number
    pub async fn get_pull_request(&self, number: u32) -> Result<PullRequest, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}",
            self.owner, self.repo, number
        );

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "ralph-ui")
            .send()
            .await
            .map_err(|e| format!("Failed to get PR: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error ({}): {}", status, text));
        }

        let pr_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(PullRequest {
            number: pr_data["number"].as_u64().unwrap_or(0) as u32,
            title: pr_data["title"].as_str().unwrap_or("").to_string(),
            body: pr_data["body"].as_str().map(|s| s.to_string()),
            state: pr_data["state"].as_str().unwrap_or("").to_string(),
            html_url: pr_data["html_url"].as_str().unwrap_or("").to_string(),
            head_branch: pr_data["head"]["ref"].as_str().unwrap_or("").to_string(),
            base_branch: pr_data["base"]["ref"].as_str().unwrap_or("").to_string(),
            created_at: pr_data["created_at"].as_str().unwrap_or("").to_string(),
            updated_at: pr_data["updated_at"].as_str().unwrap_or("").to_string(),
            merged: pr_data["merged"].as_bool().unwrap_or(false),
        })
    }

    /// List pull requests
    pub async fn list_pull_requests(
        &self,
        state: Option<String>,
    ) -> Result<Vec<PullRequest>, String> {
        let client = reqwest::Client::new();
        let state_param = state.unwrap_or_else(|| "open".to_string());
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls?state={}",
            self.owner, self.repo, state_param
        );

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "ralph-ui")
            .send()
            .await
            .map_err(|e| format!("Failed to list PRs: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error ({}): {}", status, text));
        }

        let prs_data: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let prs = prs_data
            .iter()
            .map(|pr_data| PullRequest {
                number: pr_data["number"].as_u64().unwrap_or(0) as u32,
                title: pr_data["title"].as_str().unwrap_or("").to_string(),
                body: pr_data["body"].as_str().map(|s| s.to_string()),
                state: pr_data["state"].as_str().unwrap_or("").to_string(),
                html_url: pr_data["html_url"].as_str().unwrap_or("").to_string(),
                head_branch: pr_data["head"]["ref"].as_str().unwrap_or("").to_string(),
                base_branch: pr_data["base"]["ref"].as_str().unwrap_or("").to_string(),
                created_at: pr_data["created_at"].as_str().unwrap_or("").to_string(),
                updated_at: pr_data["updated_at"].as_str().unwrap_or("").to_string(),
                merged: pr_data["merged"].as_bool().unwrap_or(false),
            })
            .collect();

        Ok(prs)
    }

    /// Get an issue by number
    pub async fn get_issue(&self, number: u32) -> Result<Issue, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://api.github.com/repos/{}/{}/issues/{}",
            self.owner, self.repo, number
        );

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "ralph-ui")
            .send()
            .await
            .map_err(|e| format!("Failed to get issue: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error ({}): {}", status, text));
        }

        let issue_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let labels = issue_data["labels"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| l["name"].as_str())
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();

        Ok(Issue {
            number: issue_data["number"].as_u64().unwrap_or(0) as u32,
            title: issue_data["title"].as_str().unwrap_or("").to_string(),
            body: issue_data["body"].as_str().map(|s| s.to_string()),
            state: issue_data["state"].as_str().unwrap_or("").to_string(),
            html_url: issue_data["html_url"].as_str().unwrap_or("").to_string(),
            labels,
            created_at: issue_data["created_at"].as_str().unwrap_or("").to_string(),
            updated_at: issue_data["updated_at"].as_str().unwrap_or("").to_string(),
        })
    }

    /// List issues
    pub async fn list_issues(&self, state: Option<String>) -> Result<Vec<Issue>, String> {
        let client = reqwest::Client::new();
        let state_param = state.unwrap_or_else(|| "open".to_string());
        let url = format!(
            "https://api.github.com/repos/{}/{}/issues?state={}",
            self.owner, self.repo, state_param
        );

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "ralph-ui")
            .send()
            .await
            .map_err(|e| format!("Failed to list issues: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error ({}): {}", status, text));
        }

        let issues_data: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let issues = issues_data
            .iter()
            .filter(|issue_data| issue_data.get("pull_request").is_none()) // Filter out PRs
            .map(|issue_data| {
                let labels = issue_data["labels"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|l| l["name"].as_str())
                            .map(|s| s.to_string())
                            .collect()
                    })
                    .unwrap_or_default();

                Issue {
                    number: issue_data["number"].as_u64().unwrap_or(0) as u32,
                    title: issue_data["title"].as_str().unwrap_or("").to_string(),
                    body: issue_data["body"].as_str().map(|s| s.to_string()),
                    state: issue_data["state"].as_str().unwrap_or("").to_string(),
                    html_url: issue_data["html_url"].as_str().unwrap_or("").to_string(),
                    labels,
                    created_at: issue_data["created_at"].as_str().unwrap_or("").to_string(),
                    updated_at: issue_data["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .collect();

        Ok(issues)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_github_client() {
        let client = GitHubClient::new(
            "test_token".to_string(),
            "owner".to_string(),
            "repo".to_string(),
        );

        assert_eq!(client.token, "test_token");
        assert_eq!(client.owner, "owner");
        assert_eq!(client.repo, "repo");
    }

    #[test]
    fn test_create_pr_request() {
        let request = CreatePRRequest {
            title: "Test PR".to_string(),
            body: "Test body".to_string(),
            head: "feature".to_string(),
            base: "main".to_string(),
            draft: false,
        };

        assert_eq!(request.title, "Test PR");
        assert_eq!(request.head, "feature");
        assert!(!request.draft);
    }

    // Note: Actual API tests would require a real GitHub token and repository
    // These would be integration tests, not unit tests
}
