//! Git-related command routing
//!
//! Handles: git_list_branches, git_get_current_branch, git_get_status,
//! git_get_commit_history, git_get_diff, git_is_repository, git_init_repository, git_create_branch,
//! git_checkout_branch, git_delete_branch, git_list_worktrees, git_create_branch_from_commit,
//! git_create_worktree, git_remove_worktree, git_get_commit, git_create_commit,
//! git_stage_files, git_stage_all, git_get_working_diff, git_merge_branch,
//! git_merge_abort, git_check_merge_conflicts, git_get_conflict_details,
//! git_resolve_conflict, git_complete_merge, git_push_branch, git_resolve_conflicts_with_ai
//!
//! Also handles GitHub commands: github_create_pull_request, github_get_pull_request,
//! github_list_pull_requests, github_get_issue, github_list_issues, github_import_issues_to_prd

use crate::commands;
use serde_json::Value;
use std::path::Path;

use super::{get_arg, get_opt_arg, route_async, route_sync, route_unit, ServerAppState};

/// Route git-related commands
pub async fn route_git_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "git_list_branches" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.list_branches()))
        }

        "git_get_current_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_current_branch()))
        }

        "git_get_status" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_status()))
        }

        "git_get_commit_history" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let limit: Option<usize> = get_opt_arg(&args, "limit")?;
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .get_commit_history(limit.unwrap_or(50))))
        }

        "git_get_diff" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let from_commit: Option<String> = get_opt_arg(&args, "fromCommit")?;
            let to_commit: Option<String> = get_opt_arg(&args, "toCommit")?;
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .get_diff(from_commit.as_deref(), to_commit.as_deref())))
        }

        "git_is_repository" => {
            let path: String = get_arg(&args, "path")?;
            let is_repo = Path::new(&path).join(".git").exists();
            serde_json::to_value(is_repo).map_err(|e| e.to_string())
        }

        "git_init_repository" => {
            let path: String = get_arg(&args, "path")?;
            route_unit!(commands::git::git_init_repository(path))
        }

        "git_create_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            let force: bool = get_opt_arg(&args, "force")?.unwrap_or(false);
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.create_branch(&branch_name, force)))
        }

        "git_checkout_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.checkout_branch(&branch_name)))
        }

        "git_delete_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.delete_branch(&branch_name)))
        }

        "git_list_worktrees" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.list_worktrees()))
        }

        "git_create_branch_from_commit" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let name: String = get_arg(&args, "name")?;
            let commit_id: String = get_arg(&args, "commitId")?;
            let force: bool = get_opt_arg(&args, "force")?.unwrap_or(false);
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .create_branch_from_commit(&name, &commit_id, force)))
        }

        "git_create_worktree" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch: String = get_arg(&args, "branch")?;
            let path: String = get_arg(&args, "path")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.create_worktree(&branch, &path)))
        }

        "git_remove_worktree" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let name: String = get_arg(&args, "name")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.remove_worktree(&name)))
        }

        "git_get_commit" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let commit_id: String = get_arg(&args, "commitId")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_commit(&commit_id)))
        }

        "git_create_commit" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let message: String = get_arg(&args, "message")?;
            let author_name: String = get_arg(&args, "authorName")?;
            let author_email: String = get_arg(&args, "authorEmail")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.create_commit(
                    &message,
                    &author_name,
                    &author_email
                )))
        }

        "git_stage_files" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let paths: Vec<String> = get_arg(&args, "paths")?;
            route_unit!(state.git_state.with_manager(&repo_path, |mgr| {
                let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
                mgr.stage_files(&path_refs)
            }))
        }

        "git_stage_all" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.stage_all()))
        }

        "git_get_working_diff" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_working_diff()))
        }

        "git_merge_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let source_branch: String = get_arg(&args, "sourceBranch")?;
            let target_branch: String = get_arg(&args, "targetBranch")?;
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .merge_branch(&source_branch, &target_branch)))
        }

        "git_merge_abort" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.merge_abort()))
        }

        "git_check_merge_conflicts" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let source_branch: String = get_arg(&args, "sourceBranch")?;
            let target_branch: String = get_arg(&args, "targetBranch")?;
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .check_merge_conflicts(&source_branch, &target_branch)))
        }

        "git_get_conflict_details" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_conflict_details()))
        }

        "git_resolve_conflict" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let path: String = get_arg(&args, "path")?;
            let resolved_content: String = get_arg(&args, "resolvedContent")?;
            route_unit!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .resolve_conflict(&path, &resolved_content)))
        }

        "git_complete_merge" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let message: String = get_arg(&args, "message")?;
            let author_name: String = get_arg(&args, "authorName")?;
            let author_email: String = get_arg(&args, "authorEmail")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.complete_merge(
                    &message,
                    &author_name,
                    &author_email
                )))
        }

        "git_push_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            let force: bool = get_opt_arg(&args, "force")?.unwrap_or(false);
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.push_branch(&branch_name, force)))
        }

        "git_resolve_conflicts_with_ai" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let agent_type: Option<String> = get_opt_arg(&args, "agentType")?;
            let model: Option<String> = get_opt_arg(&args, "model")?;
            let timeout_secs: Option<u64> = get_opt_arg(&args, "timeoutSecs")?;
            let env_vars = commands::providers::get_provider_env_vars(&state.config_state).ok();
            route_async!(
                cmd,
                commands::git::git_resolve_conflicts_with_ai(
                    repo_path,
                    agent_type,
                    model,
                    timeout_secs,
                    env_vars,
                    &state.git_state
                )
            )
        }

        // GitHub Commands
        "github_create_pull_request" => {
            let token: String = get_arg(&args, "token")?;
            let owner: String = get_arg(&args, "owner")?;
            let repo: String = get_arg(&args, "repo")?;
            let title: String = get_arg(&args, "title")?;
            let body: String = get_arg(&args, "body")?;
            let head: String = get_arg(&args, "head")?;
            let base: String = get_arg(&args, "base")?;
            let draft: bool = get_opt_arg(&args, "draft")?.unwrap_or(false);
            route_async!(
                cmd,
                commands::github::github_create_pull_request(
                    token, owner, repo, title, body, head, base, draft
                )
            )
        }

        "github_get_pull_request" => {
            let token: String = get_arg(&args, "token")?;
            let owner: String = get_arg(&args, "owner")?;
            let repo: String = get_arg(&args, "repo")?;
            let number: u32 = get_arg(&args, "number")?;
            route_async!(
                cmd,
                commands::github::github_get_pull_request(token, owner, repo, number)
            )
        }

        "github_list_pull_requests" => {
            let token: String = get_arg(&args, "token")?;
            let owner: String = get_arg(&args, "owner")?;
            let repo: String = get_arg(&args, "repo")?;
            let pr_state: Option<String> = get_opt_arg(&args, "state")?;
            route_async!(
                cmd,
                commands::github::github_list_pull_requests(token, owner, repo, pr_state)
            )
        }

        "github_get_issue" => {
            let token: String = get_arg(&args, "token")?;
            let owner: String = get_arg(&args, "owner")?;
            let repo: String = get_arg(&args, "repo")?;
            let number: u32 = get_arg(&args, "number")?;
            route_async!(
                cmd,
                commands::github::github_get_issue(token, owner, repo, number)
            )
        }

        "github_list_issues" => {
            let token: String = get_arg(&args, "token")?;
            let owner: String = get_arg(&args, "owner")?;
            let repo: String = get_arg(&args, "repo")?;
            let issue_state: Option<String> = get_opt_arg(&args, "state")?;
            route_async!(
                cmd,
                commands::github::github_list_issues(token, owner, repo, issue_state)
            )
        }

        "github_import_issues_to_prd" => {
            let token: String = get_arg(&args, "token")?;
            let owner: String = get_arg(&args, "owner")?;
            let repo: String = get_arg(&args, "repo")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let labels: Option<Vec<String>> = get_opt_arg(&args, "labels")?;
            let include_body: Option<bool> = get_opt_arg(&args, "includeBody")?;
            let use_labels_as_tags: Option<bool> = get_opt_arg(&args, "useLabelsAsTags")?;
            route_async!(
                cmd,
                commands::github::github_import_issues_to_prd(
                    token,
                    owner,
                    repo,
                    project_path,
                    prd_name,
                    labels,
                    include_body,
                    use_labels_as_tags
                )
            )
        }

        _ => Err(format!("Unknown git command: {}", cmd)),
    }
}

/// Check if a command is a git command
pub fn is_git_command(cmd: &str) -> bool {
    cmd.starts_with("git_") || cmd.starts_with("github_")
}
