# Test Suite: PRD Workflow

## Overview
Tests for the PRD creation workflow, covering session creation, type-specific guidance, chat interaction, and slash commands.

## Preconditions
- Application running at http://localhost:1420
- A project directory configured

---

## Test: Start PRD Session with Type Selection

### Description
Verify starting a new PRD session with type selection.

### Steps
1. **Navigate** to http://localhost:1420
   - Expected: Dashboard loads

2. **Click** "New Session" or navigate to PRD Chat
   - Expected: PRD type selector appears

3. **Verify** PRD type options displayed
   - Expected: Six types visible:
     - Bug Fix, Refactoring, API Integration (Quick PRD)
     - New Feature, Full New App (Full Project Plan)
     - General (Other)

4. **Select** "Bug Fix" type
   - Expected: Type highlighted

5. **Click** "Continue" or create session
   - Expected: Session created

6. **Verify** type-specific guidance appears
   - Expected: Bug fix guidance panel with:
     - Title: "Let's squash that bug"
     - 4 workflow steps
     - Sample prompts
     - Quick commands

### Expected Outcome
- PRD session created with type-specific guidance

---

## Test: Type-Specific Guidance - Bug Fix

### Description
Verify bug fix type shows appropriate guidance.

### Steps
1. **Create** new session with "Bug Fix" type
   - Expected: Session created

2. **Verify** guidance panel displays
   - Expected: Panel visible with bug fix content

3. **Verify** workflow steps
   - Expected: 4 steps including:
     - Describe the bug
     - Document behavior
     - Validate completeness (/critique)
     - Generate tasks (/task)

4. **Verify** sample prompts
   - Expected: Bug-related prompts like:
     - "The login button doesn't respond on mobile Safari"
     - "API returns 500 error when submitting empty form"

5. **Verify** quick commands
   - Expected: /critique, /task, /story visible

### Expected Outcome
- Bug fix guidance is relevant and actionable

---

## Test: Type-Specific Guidance - New Feature

### Description
Verify new feature type shows appropriate guidance.

### Steps
1. **Create** new session with "New Feature" type
   - Expected: Session created

2. **Verify** guidance panel displays
   - Expected: Title: "Let's build something great"

3. **Verify** workflow steps
   - Expected: 4 steps including:
     - Describe the feature
     - Structure the work (/epic)
     - Define stories (/story)
     - Validate scope (/critique)

4. **Verify** sample prompts
   - Expected: Feature-related prompts like:
     - "Add dark mode support to the app"
     - "Implement real-time notifications"

5. **Verify** quick commands
   - Expected: /epic, /story, /criteria visible

### Expected Outcome
- New feature guidance is relevant and actionable

---

## Test: Click Sample Prompt

### Description
Verify clicking sample prompt inserts it into input.

### Steps
1. **Create** new session with any type
   - Expected: Guidance panel visible

2. **Click** on a sample prompt
   - Expected: Prompt text inserted into chat input

3. **Verify** input contains prompt text
   - Expected: Text appears in input field

4. **Verify** input is focused
   - Expected: Cursor in input field

### Expected Outcome
- Sample prompts can be inserted by clicking

---

## Test: Click Quick Command

### Description
Verify clicking quick command inserts it into input.

### Steps
1. **Create** new session with any type
   - Expected: Guidance panel visible

2. **Click** on a quick command (e.g., /epic)
   - Expected: Command inserted into input

3. **Verify** input contains command
   - Expected: "/epic" appears in input

4. **Verify** slash command menu may appear
   - Expected: Command menu or template insertion

### Expected Outcome
- Quick commands can be inserted by clicking

---

## Test: Guidance Dismisses After First Message

### Description
Verify guidance panel disappears after sending first message.

### Steps
1. **Create** new session with any type
   - Expected: Guidance panel visible

2. **Type** a message in chat input
   - Expected: Text entered

3. **Send** the message
   - Expected: Message sent

4. **Wait** for response
   - Expected: Assistant responds

5. **Verify** guidance panel is gone
   - Expected: Panel no longer visible
   - Expected: Chat messages displayed instead

### Expected Outcome
- Guidance dismisses after conversation starts

---

## Test: Slash Command - Epic Template

### Description
Verify /epic slash command inserts template.

### Steps
1. **Create** new PRD session
   - Expected: Session created

2. **Type** "/" in chat input
   - Expected: Slash command menu appears

3. **Type** "epic" to filter
   - Expected: /epic command visible

4. **Select** /epic command
   - Expected: Epic template inserted

5. **Verify** template content
   - Expected: Template with epic structure

### Expected Outcome
- /epic command inserts epic template

---

## Test: Slash Command - Story Template

### Description
Verify /story slash command inserts template.

### Steps
1. **Create** new PRD session
   - Expected: Session created

2. **Type** "/story" in chat input
   - Expected: Slash command menu shows /story

3. **Press** Enter or click to select
   - Expected: Story template inserted

4. **Verify** template content
   - Expected: User story format template

### Expected Outcome
- /story command inserts story template

---

## Test: Slash Command - Critique

### Description
Verify /critique command requests AI review.

### Steps
1. **Create** new PRD session
   - Expected: Session created

2. **Send** some requirements text
   - Expected: Message sent

3. **Type** "/critique" in input
   - Expected: Command recognized

4. **Send** the command
   - Expected: AI critique requested

5. **Verify** AI provides critique
   - Expected: Critique response received

### Expected Outcome
- /critique triggers AI review of requirements

---

## Test: Session Persistence

### Description
Verify PRD session state persists across refreshes.

### Steps
1. **Create** new PRD session
   - Expected: Session created

2. **Send** a message
   - Expected: Message in chat

3. **Note** session ID and content
   - Expected: State visible

4. **Refresh** the page
   - Expected: Page reloads

5. **Verify** session restored
   - Expected: Same session selected
   - Expected: Messages preserved

### Expected Outcome
- PRD session persists across browser refreshes

---

## Test: Multiple Sessions

### Description
Verify managing multiple PRD sessions.

### Steps
1. **Create** first session (Bug Fix)
   - Expected: Session created

2. **Send** a message in first session
   - Expected: Message sent

3. **Create** second session (New Feature)
   - Expected: Second session created

4. **Verify** session switcher
   - Expected: Both sessions in sidebar

5. **Switch** to first session
   - Expected: First session loads
   - Expected: Previous messages visible

6. **Switch** back to second session
   - Expected: Second session loads

### Expected Outcome
- Can manage multiple PRD sessions

---

## Test: Execution Mode Toggle

### Description
Verify switching between sequential and parallel execution modes.

### Steps
1. **Create** new PRD session
   - Expected: Session created

2. **Verify** execution mode toggle visible
   - Expected: Sequential/Parallel toggle in input area

3. **Click** "Parallel" mode
   - Expected: Mode switches to parallel

4. **Click** "Sequential" mode
   - Expected: Mode switches to sequential

### Expected Outcome
- Execution mode can be toggled

---

## Test: Mobile Responsive Layout

### Description
Verify PRD workflow works on mobile viewport.

### Steps
1. **Set** viewport to 375x667 (mobile)
   - Expected: Mobile layout applies

2. **Navigate** to PRD Chat
   - Expected: Mobile layout visible

3. **Create** new session
   - Expected: Type selector fits mobile

4. **Verify** guidance panel
   - Expected: Panel stacks vertically
   - Expected: Content scrollable

5. **Verify** chat input
   - Expected: Input accessible
   - Expected: Send button visible

### Expected Outcome
- PRD workflow is mobile-friendly
