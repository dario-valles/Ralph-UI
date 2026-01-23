# E2E Test Format Guide

This document describes the markdown format used for E2E tests in Ralph UI.

## File Structure

```
e2e/
├── README.md                    # Setup and overview
├── functional/                  # Core feature tests
│   ├── 01-app-basics.md
│   ├── 02-session-management.md
│   ├── 03-task-management.md
│   ├── 04-agent-workflows.md
│   └── 05-git-operations.md
├── workflow/                    # End-to-end workflow tests
│   ├── 01-gsd-workflow.md
│   ├── 02-session-lifecycle.md
│   ├── 03-ralph-loop-workflow.md
│   └── 04-prd-creation-workflow.md
└── responsive/                  # Viewport-specific tests
    ├── 01-mobile-layout.md
    ├── 02-tablet-layout.md
    └── 03-desktop-layout.md
```

## Test File Template

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
   - Selector: `button:has-text("Text")`
   - Expected: [result]

3. **Fill** [input] with "[value]"
   - Selector: `input[name="field"]`
   - Expected: [feedback]

4. **Verify** [element/state]
   - Expected: [specific state]

### Expected Outcome
- Final success criteria
```

## Step Types

| Type | Description | Example |
|------|-------------|---------|
| **Navigate** | Go to URL | `Navigate to http://localhost:1420/sessions` |
| **Click** | Click element | `Click on "Create Session" button` |
| **Fill** | Enter text | `Fill session name with "Test"` |
| **Select** | Choose option | `Select "Claude Code" from dropdown` |
| **Verify** | Assert state | `Verify success toast visible` |
| **Wait** | Pause for async | `Wait for list to load` |
| **Set** | Configure state | `Set viewport to 375x667` |
| **Hover** | Mouse over | `Hover over session card` |
| **Press** | Keyboard input | `Press Enter key` |
| **Drag** | Drag and drop | `Drag card to V1 column` |

## Selector Formats

### Text-based (Recommended)
```
button with text "Submit"
link containing "Dashboard"
heading "Session Details"
```

### CSS Selectors
```
.session-card
#main-content
[data-testid="create-btn"]
input[name="sessionName"]
```

### Role-based
```
button role with name "Close"
navigation role
main content area
```

### Contextual
```
first session card
second item in list
delete button on "Test Session" card
```

## Expected Outcomes

Be specific about what should happen:

```markdown
# Good - Specific
- Expected: Toast notification appears with text "Session created"
- Expected: URL changes to /sessions/[id]
- Expected: Session card shows "Active" badge

# Bad - Vague
- Expected: It works
- Expected: Success
- Expected: Page loads
```

## Responsive Tests

For responsive tests, always set viewport first:

```markdown
### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout activates

2. **Navigate** to http://localhost:1420
   - Expected: Page loads in mobile layout
```

Standard viewports:
- Mobile: 375x667
- Tablet: 768x1024
- Desktop: 1920x1080

## Test Independence

Each test should be independent:
- Start from a known state
- Clean up after if needed
- Don't depend on other tests' side effects

## Writing Good Tests

1. **One concept per test** - Test one thing thoroughly
2. **Clear steps** - Anyone should understand what to do
3. **Specific expectations** - Know exactly what success looks like
4. **Handle async** - Include wait steps for loading states
5. **Provide context** - Explain why the test matters

## Example: Complete Test

```markdown
## Test: Create Session with Custom Name

### Description
Verify users can create a new session with a custom name and see it in the sessions list.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads with list or empty state

2. **Click** "Create Session" button
   - Selector: `button:has-text("Create Session")`
   - Expected: Session creation dialog opens

3. **Fill** session name input with "My Test Session"
   - Selector: `input[name="name"]` or `input[placeholder*="name"]`
   - Expected: Text appears in input field

4. **Fill** description with "Created for E2E testing"
   - Selector: `textarea[name="description"]`
   - Expected: Text appears in textarea

5. **Click** "Create" submit button
   - Selector: `button[type="submit"]` or `button:has-text("Create")`
   - Expected: Dialog closes, success feedback shown

6. **Wait** for sessions list to update
   - Expected: List refreshes

7. **Verify** "My Test Session" appears in sessions list
   - Expected: Session card visible with name "My Test Session"

### Expected Outcome
- New session created and visible in sessions list
- Session has correct name and description
- No errors during creation
```
