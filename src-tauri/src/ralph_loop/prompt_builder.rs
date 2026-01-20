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

use super::RalphLoopConfig;
use std::path::{Path, PathBuf};

/// Prompt builder for Ralph loop iterations
pub struct PromptBuilder {
    /// Path to the .ralph directory
    ralph_dir: PathBuf,
}

impl PromptBuilder {
    /// Create a new prompt builder
    pub fn new(ralph_dir: &Path) -> Self {
        Self {
            ralph_dir: ralph_dir.to_path_buf(),
        }
    }

    /// Get the path to prompt.md
    pub fn prompt_path(&self) -> PathBuf {
        self.ralph_dir.join("prompt.md")
    }

    /// Generate the static prompt.md file
    ///
    /// This prompt is written to .ralph/prompt.md and can be customized by users.
    /// The agent reads this file to understand its task.
    ///
    /// Enhanced with Ralphy CLI patterns:
    /// - Project context section
    /// - Explicit rules with MUST follow emphasis
    /// - Protected files list (boundaries)
    /// - Focus directive for single story
    pub fn generate_prompt(&self, config: &RalphLoopConfig) -> Result<(), String> {
        // Ensure .ralph directory exists
        std::fs::create_dir_all(&self.ralph_dir)
            .map_err(|e| format!("Failed to create .ralph directory: {}", e))?;

        let completion_promise = config
            .completion_promise
            .as_ref()
            .map(|s| s.as_str())
            .unwrap_or("<promise>COMPLETE</promise>");

        // Extract project name from path
        let project_name = config
            .project_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Project");

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

- `.ralph/prd.json` - Only update the `passes` field when a story is complete. Do NOT add new stories.
- `.ralph-ui/prds/*.md` - Original PRD documents (read-only reference)
- `package-lock.json` / `yarn.lock` / `bun.lock` - Only via package manager commands
- `.git/` directory - Never modify git internals
- `node_modules/` - Never commit or modify

## Discovered Work

If you discover additional work that needs to be done beyond the current stories:
- Document it in `.ralph/progress.txt` as a learning/note
- Do NOT add new stories to prd.json - this will be handled by the human operator
- Focus on completing the existing story first

## Your Task

1. **Read the PRD file** at `.ralph/prd.json`
   - This contains the list of stories/tasks with their pass/fail status
   - Each story has: id, title, acceptance criteria, and a `passes` boolean

2. **Read the progress file** at `.ralph/progress.txt`
   - This contains learnings from previous iterations
   - Use these learnings to avoid repeating mistakes
   - Add your own learnings for future iterations

3. **Check existing codebase patterns**
   - Look at how similar features are implemented
   - Follow existing conventions and patterns
   - Don't reinvent the wheel

4. **Pick the highest priority story where `passes: false`**
   - Stories are ordered by priority (lower number = higher priority)
   - Respect dependencies - don't start a story if its dependencies haven't passed
   - **Focus ONLY on this story**

5. **Implement the story**
   - Write clean, tested code
   - Follow the acceptance criteria exactly
   - Run tests to verify your implementation

6. **Verify your implementation**
{verification_steps}

7. **Update progress.txt with learnings**
   - What patterns did you discover?
   - What gotchas should future iterations know about?
   - Keep it concise but useful

8. **Commit your changes**
   - Use a clear commit message referencing the story
   - Example: "feat(story-1): Add user authentication"

9. **Update prd.json**
   - Set `passes: true` for the completed story
   - Be honest - only mark as passing if it truly meets acceptance criteria

10. **Signal completion**
    - If ALL stories now pass, output: `{completion_promise}`
    - This signals the Ralph loop to stop

## File Locations

- PRD: `.ralph/prd.json`
- Progress: `.ralph/progress.txt`
- This prompt: `.ralph/prompt.md`

---

Now, read the PRD and progress files, then begin working on the next story.
Focus ONLY on one story. Make minimal changes. Be honest about completion.
"#,
            project_name = project_name,
            working_dir = config.project_path.display(),
            agent_type = format!("{:?}", config.agent_type),
            verification_steps = Self::build_verification_steps(config),
            completion_promise = completion_promise
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
        let prompt = format!(
            "{}\n\n---\n\n## Current Iteration: {}\n\nThis is iteration {} of the Ralph loop. \
             Remember: your context is fresh. Read `.ralph/progress.txt` for learnings from previous iterations.\n",
            base_prompt, iteration, iteration
        );

        Ok(prompt)
    }

    /// Get the default prompt (used if prompt.md doesn't exist)
    fn get_default_prompt(&self) -> String {
        r#"# Ralph Wiggum Loop - Task Instructions

You are working on a PRD using the Ralph Wiggum Loop pattern.

## Your Task

1. Read `.ralph/prd.json` for the task list
2. Read `.ralph/progress.txt` for learnings from previous iterations
3. Pick the highest priority story where `passes: false`
4. Implement ONE story only
5. Run tests to verify
6. Update progress.txt with learnings
7. Commit changes
8. Update prd.json (set passes: true for completed story)
9. If ALL stories pass, output: <promise>COMPLETE</promise>

Now begin!
"#
        .to_string()
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
        // Ensure .ralph directory exists
        std::fs::create_dir_all(&self.ralph_dir)
            .map_err(|e| format!("Failed to create .ralph directory: {}", e))?;

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
5. Update `.ralph/prd.json` to set `passes: true` for story "{}"
6. Add any learnings to `.ralph/progress.txt`
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
        let ralph_dir = temp_dir.path().join(".ralph");
        let builder = PromptBuilder::new(&ralph_dir);

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
        let ralph_dir = temp_dir.path().join(".ralph");
        let builder = PromptBuilder::new(&ralph_dir);

        let config = RalphLoopConfig::default();
        builder.generate_prompt(&config).unwrap();

        let prompt = builder.build_iteration_prompt(5).unwrap();
        assert!(prompt.contains("Current Iteration: 5"));
        assert!(prompt.contains("iteration 5 of the Ralph loop"));
    }

    #[test]
    fn test_default_prompt_when_no_file() {
        let temp_dir = setup_test_dir();
        let ralph_dir = temp_dir.path().join(".ralph");
        let builder = PromptBuilder::new(&ralph_dir);

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
        let ralph_dir = temp_dir.path().join(".ralph");
        let builder = PromptBuilder::new(&ralph_dir);

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
