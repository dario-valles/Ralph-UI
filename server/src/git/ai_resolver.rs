//! AI-powered conflict resolution using CLI agents
//!
//! Uses Claude Code or other CLI agents to resolve git merge conflicts
//! by providing 3-way diff context and generating resolved file content.

use crate::agents::providers::get_provider;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::git::ConflictInfo;
use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Result of resolving a single conflict with AI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictResolutionResult {
    /// Path of the resolved file
    pub path: String,
    /// Whether resolution was successful
    pub success: bool,
    /// The resolved file content (if successful)
    pub resolved_content: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
    /// Time taken in seconds
    pub duration_secs: f64,
}

/// Result of resolving all conflicts in a merge
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResolutionResult {
    /// All conflict resolutions
    pub resolutions: Vec<ConflictResolutionResult>,
    /// Number of successfully resolved conflicts
    pub resolved_count: usize,
    /// Number of failed resolutions
    pub failed_count: usize,
    /// Total time taken in seconds
    pub total_duration_secs: f64,
}

/// Configuration for AI conflict resolution
#[derive(Debug, Clone)]
pub struct ConflictResolverConfig {
    /// Agent type to use (defaults to Claude)
    pub agent_type: AgentType,
    /// Model to use (optional)
    pub model: Option<String>,
    /// Timeout per conflict in seconds
    pub timeout_secs: u64,
    /// Project path for agent working directory
    pub project_path: String,
}

impl Default for ConflictResolverConfig {
    fn default() -> Self {
        Self {
            agent_type: AgentType::Claude,
            model: None,
            timeout_secs: 120,
            project_path: ".".to_string(),
        }
    }
}

/// AI-powered conflict resolver
pub struct ConflictResolver {
    config: ConflictResolverConfig,
}

impl ConflictResolver {
    /// Create a new conflict resolver with the given configuration
    pub fn new(config: ConflictResolverConfig) -> Self {
        Self { config }
    }

    /// Build a prompt for resolving a single conflict
    fn build_resolution_prompt(&self, conflict: &ConflictInfo) -> String {
        format!(
            r#"You are resolving a git merge conflict. Analyze the three versions and produce the final resolved file content.

## File: {}

### Ancestor Version (Common Base)
```
{}
```

### Our Version (Target Branch)
```
{}
```

### Their Version (Source Branch)
```
{}
```

### Current File with Conflict Markers
```
{}
```

## Instructions

1. Analyze the changes made in both branches relative to the ancestor
2. Understand the intent of each change
3. Merge the changes intelligently, preserving both sets of changes where possible
4. If changes conflict directly, make a reasonable decision based on the code context
5. Ensure the result is syntactically valid code

## Output Format

Output ONLY the final resolved file content, with no conflict markers, no explanations, and no markdown code fences. The output should be ready to write directly to the file.
"#,
            conflict.path,
            conflict.ancestor_content,
            conflict.our_content,
            conflict.their_content,
            conflict.conflict_markers
        )
    }

    /// Resolve a single conflict using the AI agent
    pub async fn resolve_single(&self, conflict: &ConflictInfo) -> ConflictResolutionResult {
        let start = std::time::Instant::now();
        let prompt = self.build_resolution_prompt(conflict);

        match self.run_agent(&prompt).await {
            Ok(content) => {
                // Clean up the response - remove any markdown fences if present
                let cleaned = clean_ai_response(&content);
                ConflictResolutionResult {
                    path: conflict.path.clone(),
                    success: true,
                    resolved_content: Some(cleaned),
                    error: None,
                    duration_secs: start.elapsed().as_secs_f64(),
                }
            }
            Err(e) => ConflictResolutionResult {
                path: conflict.path.clone(),
                success: false,
                resolved_content: None,
                error: Some(e),
                duration_secs: start.elapsed().as_secs_f64(),
            },
        }
    }

    /// Resolve all conflicts using the AI agent
    pub async fn resolve_all(&self, conflicts: &[ConflictInfo]) -> MergeResolutionResult {
        let start = std::time::Instant::now();
        let mut resolutions = Vec::with_capacity(conflicts.len());
        let timeout_duration = Duration::from_secs(self.config.timeout_secs);

        for conflict in conflicts {
            log::info!(
                "[ConflictResolver] Resolving conflict for: {}",
                conflict.path
            );

            let result = match timeout(timeout_duration, self.resolve_single(conflict)).await {
                Ok(result) => result,
                Err(_) => ConflictResolutionResult {
                    path: conflict.path.clone(),
                    success: false,
                    resolved_content: None,
                    error: Some(format!(
                        "Timeout after {} seconds",
                        self.config.timeout_secs
                    )),
                    duration_secs: self.config.timeout_secs as f64,
                },
            };

            resolutions.push(result);
        }

        let resolved_count = resolutions.iter().filter(|r| r.success).count();
        let failed_count = resolutions.len() - resolved_count;

        MergeResolutionResult {
            resolutions,
            resolved_count,
            failed_count,
            total_duration_secs: start.elapsed().as_secs_f64(),
        }
    }

    /// Run the AI agent with the given prompt
    async fn run_agent(&self, prompt: &str) -> Result<String, String> {
        let provider = get_provider(&self.config.agent_type);

        // Check if the agent is available
        if !provider.is_available() {
            return Err(format!(
                "{:?} CLI not found. Please ensure it is installed and in PATH.",
                self.config.agent_type
            ));
        }

        log::info!(
            "[ConflictResolver] Running {:?} agent for conflict resolution",
            self.config.agent_type
        );

        // Build the agent spawn config
        let spawn_config = AgentSpawnConfig {
            agent_type: self.config.agent_type,
            task_id: format!("conflict-resolution-{}", uuid::Uuid::new_v4()),
            worktree_path: self.config.project_path.clone(),
            branch: "HEAD".to_string(),
            max_iterations: 0, // No limit
            prompt: Some(prompt.to_string()),
            model: self.config.model.clone(),
            spawn_mode: AgentSpawnMode::Piped,
            plugin_config: None,
        };

        // Build the command using the provider
        let std_cmd = provider
            .build_command(&spawn_config)
            .map_err(|e| format!("Failed to build command: {}", e))?;

        // Convert to tokio command
        let mut cmd = Command::from(std_cmd);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn and wait for completion
        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to spawn {:?}: {}", self.config.agent_type, e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if stdout.trim().is_empty() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if !stderr.trim().is_empty() {
                    log::warn!(
                        "[ConflictResolver] {:?} stderr: {}",
                        self.config.agent_type,
                        stderr
                    );
                }
                Err(format!(
                    "{:?} returned empty output",
                    self.config.agent_type
                ))
            } else {
                Ok(stdout)
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!(
                "{:?} failed with exit code {:?}: {}",
                self.config.agent_type,
                output.status.code(),
                stderr
            ))
        }
    }
}

/// Clean up AI response by removing markdown fences and extra whitespace
fn clean_ai_response(response: &str) -> String {
    let trimmed = response.trim();

    // Remove markdown code fences if present
    if trimmed.starts_with("```") {
        // Find the end of the opening fence (might have language specifier)
        if let Some(first_newline) = trimmed.find('\n') {
            let after_opening = &trimmed[first_newline + 1..];
            // Find the closing fence
            if let Some(closing_pos) = after_opening.rfind("```") {
                return after_opening[..closing_pos].trim().to_string();
            }
            return after_opening.trim().to_string();
        }
    }

    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_ai_response_no_fences() {
        let input = "const x = 1;\nconst y = 2;";
        assert_eq!(clean_ai_response(input), input);
    }

    #[test]
    fn test_clean_ai_response_with_fences() {
        let input = "```javascript\nconst x = 1;\nconst y = 2;\n```";
        assert_eq!(clean_ai_response(input), "const x = 1;\nconst y = 2;");
    }

    #[test]
    fn test_clean_ai_response_with_plain_fences() {
        let input = "```\nconst x = 1;\n```";
        assert_eq!(clean_ai_response(input), "const x = 1;");
    }

    #[test]
    fn test_build_resolution_prompt() {
        let config = ConflictResolverConfig::default();
        let resolver = ConflictResolver::new(config);

        let conflict = ConflictInfo {
            path: "test.js".to_string(),
            ancestor_content: "const x = 1;".to_string(),
            our_content: "const x = 2;".to_string(),
            their_content: "const x = 3;".to_string(),
            conflict_markers: "<<<<<<< HEAD\nconst x = 2;\n=======\nconst x = 3;\n>>>>>>> feature"
                .to_string(),
        };

        let prompt = resolver.build_resolution_prompt(&conflict);
        assert!(prompt.contains("test.js"));
        assert!(prompt.contains("const x = 1;"));
        assert!(prompt.contains("const x = 2;"));
        assert!(prompt.contains("const x = 3;"));
    }

    #[test]
    fn test_default_config() {
        let config = ConflictResolverConfig::default();
        assert!(matches!(config.agent_type, AgentType::Claude));
        assert!(config.model.is_none());
        assert_eq!(config.timeout_secs, 120);
    }
}
