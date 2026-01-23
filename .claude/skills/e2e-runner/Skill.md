# E2E Test Runner

Execute end-to-end tests defined in markdown format using browser automation with the webapp-testing skill.

## Usage

```
/e2e                                    # Run all tests
/e2e functional                         # Run functional tests only
/e2e workflow                           # Run workflow tests only
/e2e responsive                         # Run responsive tests only
/e2e functional/01-app-basics.md        # Run specific test file
```

## Prerequisites

1. **Application running**: Start the app before running tests
   ```bash
   # Option 1: Tauri desktop
   bun run tauri dev

   # Option 2: Browser mode
   bun run server:dev  # Terminal 1
   bun run dev         # Terminal 2
   ```

2. **Browser automation**: The webapp-testing skill must be available

## How to Execute Tests

When the user invokes `/e2e`, follow these steps:

### Step 1: Parse Arguments

Determine which tests to run based on the argument:
- No argument → Run all tests in `e2e/functional/`, `e2e/workflow/`, `e2e/responsive/`
- `functional` → Run all `e2e/functional/*.md`
- `workflow` → Run all `e2e/workflow/*.md`
- `responsive` → Run all `e2e/responsive/*.md`
- Specific file path → Run just that file

### Step 2: Read Test Files

Use the Glob tool to find test files, then Read each file to get test content.

### Step 3: Execute Tests Using Haiku Agents

For each test file, launch a Haiku agent using the Task tool:

```
Use Task tool with:
- subagent_type: "general-purpose"
- model: "haiku"
- prompt: [See prompt template below]
```

**IMPORTANT**: Use `model: "haiku"` to keep test execution cost-effective.

Launch multiple test files in parallel when possible to maximize efficiency.

### Step 4: Prompt Template for Test Agent

For each test file, use this prompt structure:

```
You are executing E2E tests for the Ralph UI application using browser automation.

## Test File: {filename}

## Instructions
1. Use the webapp-testing skill to interact with the browser
2. Navigate to http://localhost:1420 (or as specified in test)
3. Follow each test step exactly as written
4. Report PASS or FAIL for each test with details

## Test Content
{content of the markdown test file}

## Execution Rules
- Execute each "## Test:" section as a separate test case
- For each step, perform the action and verify the expected outcome
- Take a screenshot if a test fails
- Report results in this format:

### Results
- Test: [test name] - PASS/FAIL
  - Failed step: [if failed]
  - Expected: [what was expected]
  - Actual: [what happened]

## Viewport (for responsive tests)
{If responsive test, include viewport setting}
```

### Step 5: Collect and Report Results

After all agents complete, aggregate results:

```
## E2E Test Results

### Summary
- Total tests: X
- Passed: X
- Failed: X
- Duration: Xs

### By Category
- Functional: X/Y passed
- Workflow: X/Y passed
- Responsive: X/Y passed

### Failed Tests
[List any failures with details]
```

## Test File Format

Tests are written in markdown with this structure:

```markdown
## Test: [Test Name]

### Description
What this test verifies.

### Steps
1. **Navigate** to [URL]
   - Expected: [what should happen]

2. **Click** on [element]
   - Selector: `button:has-text("Text")`
   - Expected: [result]

3. **Verify** [condition]
   - Expected: [state]

### Expected Outcome
- Final success criteria
```

## Selectors

The browser automation should interpret these selector types:
- Text-based: `button with text "Submit"`
- CSS selectors: `.class-name`, `#id`, `[data-testid="value"]`
- Role-based: `button role with name "Close"`

## Responsive Test Viewports

For responsive tests, set viewport before executing:
- Mobile: 375x667
- Tablet: 768x1024
- Desktop: 1920x1080

## Tips

- Run a single test file first to verify setup: `/e2e functional/01-app-basics.md`
- If tests fail, check that the application is running at http://localhost:1420
- Responsive tests require viewport changes - ensure browser supports this
- Use Haiku model for cost-effective test execution
