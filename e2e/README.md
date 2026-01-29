# E2E Tests

This directory contains end-to-end tests for Ralph UI, written in markdown format for LLM-based execution.

## Overview

Unlike traditional Playwright tests, these markdown-based tests are designed to be executed by an LLM agent using browser automation. This approach provides:

- **Human-readable test specifications** that serve as documentation
- **Flexible execution** - tests can be run via the `/e2e` skill in Claude Code
- **Natural language steps** that describe user interactions
- **Cost-effective execution** using Haiku model for test runs

## Directory Structure

```
e2e/
├── README.md                         # This file
├── functional/                       # Core feature tests
│   ├── 01-app-basics.md             # Basic app tests
│   ├── 02-session-management.md     # Session CRUD, templates, export
│   ├── 03-task-management.md        # Task operations
│   ├── 04-agent-workflows.md        # Agent lifecycle, monitoring
│   └── 05-git-operations.md         # Git workflows
├── workflow/                         # End-to-end workflow tests
│   ├── 01-prd-workflow.md           # PRD workflow tests
│   ├── 02-session-lifecycle.md      # Full session lifecycle
│   ├── 03-ralph-loop-workflow.md    # Ralph Loop execution
│   └── 04-prd-creation-workflow.md  # PRD chat workflow
└── responsive/                       # Responsive design tests
    ├── 01-mobile-layout.md          # Mobile viewport (375x667)
    ├── 02-tablet-layout.md          # Tablet viewport (768x1024)
    └── 03-desktop-layout.md         # Desktop viewport (1920x1080)
```

## Running Tests

### Prerequisites

1. Start the application:
   ```bash
   # Option 1: Tauri desktop app
   bun run tauri dev

   # Option 2: Browser mode
   bun run server:dev  # Terminal 1
   bun run dev         # Terminal 2
   ```

2. Ensure browser automation is available (webapp-testing MCP tools)

### Using the /e2e Skill

```bash
# Run all tests
/e2e

# Run a specific category
/e2e functional
/e2e workflow
/e2e responsive

# Run a specific test file
/e2e functional/01-app-basics.md
/e2e workflow/01-prd-workflow.md
```

## Test File Format

Each test file follows this structure:

```markdown
# Test Suite: [Feature Name]

## Overview
Brief description of what this test suite covers.

## Preconditions
- Application running at http://localhost:1420
- Any specific setup requirements

---

## Test: [Test Name]

### Description
What this test verifies.

### Steps
1. **Navigate** to [URL]
   - Expected: [what should be visible]

2. **Click** on [element]
   - Selector: `button:has-text("Text")` or `[data-testid="id"]`
   - Expected: [result]

3. **Fill** [input] with "[value]"
   - Selector: `input[name="field"]`
   - Expected: [feedback]

4. **Verify** [element/state]
   - Expected: [specific state]

### Expected Outcome
- Final success criteria
```

## Writing New Tests

### Step Types

| Step Type | Description | Example |
|-----------|-------------|---------|
| **Navigate** | Go to a URL | `Navigate to http://localhost:1420/sessions` |
| **Click** | Click an element | `Click on "Create Session" button` |
| **Fill** | Enter text in input | `Fill "Session Name" with "Test Session"` |
| **Select** | Choose from dropdown | `Select "Claude Code" from agent dropdown` |
| **Verify** | Check element/state | `Verify success toast is visible` |
| **Wait** | Pause for async ops | `Wait for sessions list to load` |
| **Screenshot** | Capture on failure | `Screenshot on failure` |

### Selectors

Use descriptive selectors that the LLM can interpret:
- Text-based: `button with text "Submit"`
- Test IDs: `[data-testid="session-card"]`
- Roles: `button role with name "Close"`
- CSS: `.session-list > .card:first-child`

### Best Practices

1. **Be specific** - Include exact text/values expected
2. **One assertion per step** - Keep verification steps focused
3. **Handle async** - Include wait steps where needed
4. **Provide context** - Describe why a step matters
5. **Group related tests** - Keep test files focused on one feature

## Test Categories

### Functional Tests (114 tests)
Core feature testing covering CRUD operations, UI interactions, and feature-specific behavior.

### Workflow Tests (48 tests)
End-to-end scenarios that test complete user journeys through multiple features.

### Responsive Tests (26 tests)
Layout and interaction tests at different viewport sizes (mobile, tablet, desktop).

## Troubleshooting

### Test Failures
- Check that the application is running
- Verify the correct URL (default: http://localhost:1420)
- Look for timing issues - add wait steps if needed
- Check for recent UI changes that may have changed selectors

### Browser Automation Issues
- Ensure webapp-testing MCP tools are available
- Check browser permissions (notifications, etc.)
- Verify network access for localhost
