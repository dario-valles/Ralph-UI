//! Prompt Builder - Generates prompts for each Ralph loop iteration
//!
//! Each fresh agent instance receives a prompt that instructs it to:
//! 1. Read the PRD file
//! 2. Read the progress file
//! 3. Pick the highest priority incomplete task
//! 4. Implement it
//! 5. Update files and commit
//!
//! Enhanced with Ralphy CLI patterns:
//! - Project context section
//! - Explicit rules and boundaries
//! - Protected files list
//!
//! File location: `.ralph-ui/prds/{prd_name}-prompt.md`

use super::RalphLoopConfig;
use std::path::{Path, PathBuf};

/// Prompt builder for Ralph loop iterations
///
/// Files are stored at `.ralph-ui/prds/{prd_name}-prompt.md`
pub struct PromptBuilder {
    /// Base project path
    project_path: PathBuf,
    /// PRD name (required)
    prd_name: String,
}

impl PromptBuilder {
    /// Create a new prompt builder
    ///
    /// # Arguments
    /// * `project_path` - Path to the project root
    /// * `prd_name` - The PRD filename (without extension), e.g., "my-feature-a1b2c3d4"
    pub fn new(project_path: &Path, prd_name: &str) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
            prd_name: prd_name.to_string(),
        }
    }

    /// Get the path to prompt.md
    pub fn prompt_path(&self) -> PathBuf {
        self.project_path
            .join(".ralph-ui")
            .join("prds")
            .join(format!("{}-prompt.md", self.prd_name))
    }

    /// Get the directory containing the prompt file
    fn prompt_dir(&self) -> PathBuf {
        self.project_path.join(".ralph-ui").join("prds")
    }

    /// Get the relative path to the PRD file (for prompt generation)
    fn prd_file_path(&self) -> String {
        format!(".ralph-ui/prds/{}.json", self.prd_name)
    }

    /// Get the relative path to the progress file (for prompt generation)
    fn progress_file_path(&self) -> String {
        format!(".ralph-ui/prds/{}-progress.txt", self.prd_name)
    }

    /// Get the relative path to the prompt file (for prompt generation)
    fn prompt_file_path(&self) -> String {
        format!(".ralph-ui/prds/{}-prompt.md", self.prd_name)
    }

    /// Generate the static prompt.md file
    ///
    /// This prompt is written to the appropriate location and can be customized by users.
    /// The agent reads this file to understand its task.
    ///
    /// Enhanced with Ralphy CLI patterns:
    /// - Project context section
    /// - Explicit rules with MUST follow emphasis
    /// - Protected files list (boundaries)
    /// - Focus directive for single story
    pub fn generate_prompt(&self, config: &RalphLoopConfig) -> Result<(), String> {
        // Ensure prompt directory exists
        let prompt_dir = self.prompt_dir();
        std::fs::create_dir_all(&prompt_dir)
            .map_err(|e| format!("Failed to create prompt directory {:?}: {}", prompt_dir, e))?;

        let completion_promise = config
            .completion_promise
            .as_deref()
            .unwrap_or("<promise>COMPLETE</promise>");

        // Extract project name from path
        let project_name = config
            .project_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Project");

        // Get the file paths (either new or legacy format)
        let prd_path = self.prd_file_path();
        let progress_path = self.progress_file_path();
        let prompt_path = self.prompt_file_path();

        let prompt = format!(
            r#"# Ralph Wiggum Loop - Task Instructions

You are working on a PRD (Product Requirements Document) using the Ralph Wiggum Loop pattern.
Your context is fresh - you have no memory of previous iterations. All context is in files.

## Project Context

- **Project**: {project_name}
- **Working Directory**: {working_dir}
- **Agent**: {agent_type}

## IMPORTANT RULES (You MUST follow these)

1. **Focus ONLY on the current story** - Do not work on other stories or unrelated tasks
2. **Make minimal, focused changes** - Avoid unnecessary refactoring or "improvements"
3. **Be honest about completion** - Only mark a story as passing if it truly meets ALL acceptance criteria
4. **ONE story per iteration** - Complete one story fully before moving to the next
5. **Follow existing patterns** - Check how similar features are implemented and be consistent
6. **Commit incrementally** - Make small, focused commits as you work

## Protected Files (NEVER modify directly)

These files are managed by the Ralph loop - do not edit them except as instructed:

- `{prd_path}` - Only update the `passes` field when a story is complete. Do NOT add new stories.
- `.ralph-ui/prds/*.md` - Original PRD documents (read-only reference)
- `package-lock.json` / `yarn.lock` / `bun.lock` - Only via package manager commands
- `.git/` directory - Never modify git internals
- `node_modules/` - Never commit or modify

## Discovered Work

If you discover additional work that needs to be done beyond the current stories:
- Document it in `{progress_path}` as a learning/note
- Do NOT add new stories to the PRD JSON - this will be handled by the human operator
- Focus on completing the existing story first

## Your Task

1. **Read the BRIEF.md file** at `.ralph-ui/briefs/{prd_name}/BRIEF.md`
   - This contains a summary of completed stories (SKIP THESE)
   - Shows the current story you should work on
   - Includes accumulated learnings from previous iterations

2. **Read the PRD file** at `{prd_path}`
   - This contains the list of stories/tasks with their pass/fail status
   - Each story has: id, title, acceptance criteria, and a `passes` boolean

3. **Read the progress file** at `{progress_path}`
   - This contains learnings from previous iterations
   - Use these learnings to avoid repeating mistakes
   - Add your own learnings for future iterations

4. **Check existing codebase patterns**
   - Look at how similar features are implemented
   - Follow existing conventions and patterns
   - Don't reinvent the wheel

5. **Work on the story identified in BRIEF.md**
   - The brief clearly identifies which story to work on
   - **Skip completed stories** - they are already done
   - **Focus ONLY on the current story**

6. **Implement the story**
   - Write clean, tested code
   - Follow the acceptance criteria exactly
   - Run tests to verify your implementation

7. **Verify your implementation**
{verification_steps}

8. **Update {progress_path} with learnings**
   - What patterns did you discover?
   - What gotchas should future iterations know about?
   - Keep it concise but useful

9. **Commit your changes**
   - Use a clear commit message referencing the story
   - Example: "feat(story-1): Add user authentication"

10. **Update the PRD JSON**
    - Set `passes: true` for the completed story
    - Be honest - only mark as passing if it truly meets acceptance criteria

11. **Signal completion**
    - If ALL stories now pass, output: `{completion_promise}`
    - This signals the Ralph loop to stop

## File Locations

- **BRIEF**: `.ralph-ui/briefs/{prd_name}/BRIEF.md` (START HERE - shows completed/current stories)
- PRD: `{prd_path}`
- Progress: `{progress_path}`
- This prompt: `{prompt_path}`

---

Now, read the PRD and progress files, then begin working on the next story.
Focus ONLY on one story. Make minimal changes. Be honest about completion.
"#,
            project_name = project_name,
            working_dir = config.project_path.display(),
            agent_type = format!("{:?}", config.agent_type),
            verification_steps = Self::build_verification_steps(config),
            completion_promise = completion_promise,
            prd_path = prd_path,
            progress_path = progress_path,
            prompt_path = prompt_path,
            prd_name = self.prd_name
        );

        std::fs::write(self.prompt_path(), prompt)
            .map_err(|e| format!("Failed to write prompt.md: {}", e))?;

        Ok(())
    }

    /// Build verification steps based on config
    fn build_verification_steps(config: &RalphLoopConfig) -> String {
        let mut steps = Vec::new();

        if config.run_tests {
            steps.push("   - **Run tests**: Ensure all tests pass before marking complete");
        }
        if config.run_lint {
            steps.push("   - **Run linter**: Ensure code passes linting");
        }
        steps.push("   - **Manual verification**: Check that the feature works as expected");

        steps.join("\n")
    }

    /// Build the iteration-specific prompt
    ///
    /// This combines the base prompt with iteration-specific context.
    pub fn build_iteration_prompt(&self, iteration: u32) -> Result<String, String> {
        // Read the base prompt
        let base_prompt = if self.prompt_path().exists() {
            std::fs::read_to_string(self.prompt_path())
                .map_err(|e| format!("Failed to read prompt.md: {}", e))?
        } else {
            // Use default prompt if file doesn't exist
            self.get_default_prompt()
        };

        // Add iteration context
        let progress_path = self.progress_file_path();
        let prompt = format!(
            "{}\n\n---\n\n## Current Iteration: {}\n\nThis is iteration {} of the Ralph loop. \
             Remember: your context is fresh. Read `{}` for learnings from previous iterations.\n",
            base_prompt, iteration, iteration, progress_path
        );

        Ok(prompt)
    }

    /// Get the default prompt (used if prompt.md doesn't exist)
    fn get_default_prompt(&self) -> String {
        let prd_path = self.prd_file_path();
        let progress_path = self.progress_file_path();

        format!(
            r#"# Ralph Wiggum Loop - Task Instructions

You are working on a PRD using the Ralph Wiggum Loop pattern.

## Your Task

1. Read `{prd}` for the task list
2. Read `{progress}` for learnings from previous iterations
3. Pick the highest priority story where `passes: false`
4. Implement ONE story only
5. Run tests to verify
6. Update progress file with learnings
7. Commit changes
8. Update PRD JSON (set passes: true for completed story)
9. If ALL stories pass, output: <promise>COMPLETE</promise>

Now begin!
"#,
            prd = prd_path,
            progress = progress_path
        )
    }

    /// Check if a custom prompt exists
    pub fn has_custom_prompt(&self) -> bool {
        self.prompt_path().exists()
    }

    /// Read the current prompt
    pub fn read_prompt(&self) -> Result<String, String> {
        if self.prompt_path().exists() {
            std::fs::read_to_string(self.prompt_path())
                .map_err(|e| format!("Failed to read prompt.md: {}", e))
        } else {
            Ok(self.get_default_prompt())
        }
    }

    /// Write a custom prompt
    pub fn write_prompt(&self, content: &str) -> Result<(), String> {
        // Ensure prompt directory exists
        let prompt_dir = self.prompt_dir();
        std::fs::create_dir_all(&prompt_dir)
            .map_err(|e| format!("Failed to create prompt directory {:?}: {}", prompt_dir, e))?;

        std::fs::write(self.prompt_path(), content)
            .map_err(|e| format!("Failed to write prompt.md: {}", e))
    }

    /// Generate a prompt snippet for a specific story
    pub fn story_prompt_snippet(story_id: &str, story_title: &str, acceptance: &str) -> String {
        format!(
            r#"## Current Story: {} - {}

### Acceptance Criteria
{}

### Instructions
1. Implement this story to meet the acceptance criteria above
2. Write tests to verify the implementation
3. Run all tests to ensure nothing is broken
4. Commit your changes with a clear message
5. Update the PRD JSON to set `passes: true` for story "{}"
6. Add any learnings to the progress file
"#,
            story_id, story_title, acceptance, story_id
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_generate_prompt() {
        let temp_dir = setup_test_dir();
        let builder = PromptBuilder::new(temp_dir.path(), "test-prd");

        let config = RalphLoopConfig {
            run_tests: true,
            run_lint: true,
            ..Default::default()
        };

        builder.generate_prompt(&config).unwrap();

        assert!(builder.has_custom_prompt());

        let content = builder.read_prompt().unwrap();
        assert!(content.contains("Ralph Wiggum Loop"));
        assert!(content.contains("prd.json"));
        assert!(content.contains("progress.txt"));
        assert!(content.contains("<promise>COMPLETE</promise>"));
        assert!(content.contains("Run tests"));
        assert!(content.contains("Run linter"));
    }

    #[test]
    fn test_build_iteration_prompt() {
        let temp_dir = setup_test_dir();
        let builder = PromptBuilder::new(temp_dir.path(), "test-prd");

        let config = RalphLoopConfig::default();
        builder.generate_prompt(&config).unwrap();

        let prompt = builder.build_iteration_prompt(5).unwrap();
        assert!(prompt.contains("Current Iteration: 5"));
        assert!(prompt.contains("iteration 5 of the Ralph loop"));
    }

    #[test]
    fn test_default_prompt_when_no_file() {
        let temp_dir = setup_test_dir();
        let builder = PromptBuilder::new(temp_dir.path(), "test-prd");

        // Don't generate prompt file
        assert!(!builder.has_custom_prompt());

        // Should still return default prompt
        let prompt = builder.read_prompt().unwrap();
        assert!(prompt.contains("Ralph Wiggum Loop"));
    }

    #[test]
    fn test_story_prompt_snippet() {
        let snippet = PromptBuilder::story_prompt_snippet(
            "story-1",
            "Add login page",
            "- User can enter email and password\n- Form validates input\n- Redirects on success",
        );

        assert!(snippet.contains("story-1"));
        assert!(snippet.contains("Add login page"));
        assert!(snippet.contains("User can enter email"));
    }

    #[test]
    fn test_custom_completion_promise() {
        let temp_dir = setup_test_dir();
        let builder = PromptBuilder::new(temp_dir.path(), "test-prd");

        let config = RalphLoopConfig {
            completion_promise: Some("[[DONE]]".to_string()),
            ..Default::default()
        };

        builder.generate_prompt(&config).unwrap();

        let content = builder.read_prompt().unwrap();
        assert!(content.contains("[[DONE]]"));
        assert!(!content.contains("<promise>COMPLETE</promise>"));
    }
}
