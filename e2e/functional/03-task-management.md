# Test Suite: Task Management

## Overview
Tests for task creation, viewing, editing, filtering, and management within sessions.

## Preconditions
- Application running at http://localhost:1420
- An active session exists

---

## Test: Empty Task State

### Description
Verify empty state when no tasks exist in a session.

### Steps
1. **Navigate** to a session with no tasks
   - Expected: Session detail page loads

2. **Click** tasks tab or section
   - Expected: Tasks view opens

3. **Verify** empty state message
   - Expected: Helpful message about creating tasks or importing PRD

4. **Verify** create task button is visible
   - Expected: Button to add task is present

### Expected Outcome
- Empty state provides guidance for adding tasks

---

## Test: Create Task Manually

### Description
Verify manual task creation.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks section loads

2. **Click** "Add Task" or "Create Task" button
   - Expected: Task creation form/dialog opens

3. **Fill** task title with "Test Task E2E"
   - Expected: Title is entered

4. **Fill** task description
   - Expected: Description is entered

5. **Select** task priority (if available)
   - Expected: Priority is set

6. **Click** create/submit button
   - Expected: Task is created

7. **Verify** task appears in list
   - Expected: "Test Task E2E" visible in task list

### Expected Outcome
- New task is created and visible

---

## Test: Import Tasks from PRD

### Description
Verify task import from PRD document.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks section loads

2. **Click** "Import from PRD" button
   - Expected: PRD selection dialog opens

3. **Select** a PRD document
   - Expected: PRD is selected

4. **Click** import button
   - Expected: Tasks are imported

5. **Verify** imported tasks in list
   - Expected: Tasks from PRD appear in list

### Expected Outcome
- Tasks successfully imported from PRD

---

## Test: Filter Tasks by Status

### Description
Verify task filtering by status.

### Steps
1. **Navigate** to session tasks view with multiple tasks
   - Expected: Tasks list loads

2. **Click** status filter
   - Expected: Filter options appear (Todo, In Progress, Done)

3. **Select** "In Progress" filter
   - Expected: Filter applied

4. **Verify** filtered results
   - Expected: Only in-progress tasks shown

5. **Clear** filter
   - Expected: All tasks visible again

### Expected Outcome
- Task list filters by status correctly

---

## Test: Search Tasks

### Description
Verify task search functionality.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks list loads

2. **Fill** search input with task title
   - Expected: Search query entered

3. **Verify** search results
   - Expected: Matching tasks displayed

4. **Clear** search
   - Expected: Full list restored

### Expected Outcome
- Task search returns matching results

---

## Test: View Task Detail

### Description
Verify task detail view displays all information.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks list loads

2. **Click** on a task
   - Expected: Task detail view opens

3. **Verify** task title displayed
   - Expected: Title visible

4. **Verify** task description displayed
   - Expected: Description visible

5. **Verify** task status displayed
   - Expected: Status indicator visible

6. **Verify** task metadata
   - Expected: Priority, created date, etc. visible

### Expected Outcome
- Task detail shows all relevant information

---

## Test: Edit Task

### Description
Verify task editing functionality.

### Steps
1. **Navigate** to task detail view
   - Expected: Task detail loads

2. **Click** edit button
   - Expected: Edit mode activates

3. **Modify** task title
   - Expected: Title is editable

4. **Modify** task description
   - Expected: Description is editable

5. **Click** save button
   - Expected: Changes saved

6. **Verify** updated content
   - Expected: New title and description displayed

### Expected Outcome
- Task is successfully updated

---

## Test: Delete Task

### Description
Verify task deletion with confirmation.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks list loads

2. **Click** delete on a task
   - Expected: Confirmation dialog appears

3. **Confirm** deletion
   - Expected: Task is deleted

4. **Verify** task removed from list
   - Expected: Task no longer visible

### Expected Outcome
- Task is deleted after confirmation

---

## Test: Update Task Status

### Description
Verify task status can be changed.

### Steps
1. **Navigate** to task detail view
   - Expected: Task detail loads

2. **Click** status dropdown or toggle
   - Expected: Status options appear

3. **Select** new status (e.g., "In Progress")
   - Expected: Status updated

4. **Verify** status change
   - Expected: New status displayed

### Expected Outcome
- Task status updates correctly

---

## Test: Task Dependency Graph

### Description
Verify task dependency visualization.

### Steps
1. **Navigate** to session with task dependencies
   - Expected: Session loads

2. **Click** dependency graph view (if available)
   - Expected: Graph visualization loads

3. **Verify** tasks displayed as nodes
   - Expected: Tasks visible in graph

4. **Verify** dependencies shown as edges
   - Expected: Connections between dependent tasks

### Expected Outcome
- Task dependency graph visualizes relationships

---

## Test: Task Statistics

### Description
Verify task statistics display.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks section loads

2. **Verify** statistics summary
   - Expected: Task counts by status displayed

3. **Verify** progress indicator
   - Expected: Completion percentage or progress bar

### Expected Outcome
- Task statistics provide overview of progress

---

## Test: Sort Tasks

### Description
Verify task sorting functionality.

### Steps
1. **Navigate** to session tasks view
   - Expected: Tasks list loads

2. **Click** sort control (priority, status, date)
   - Expected: Sort applied

3. **Verify** sort order
   - Expected: Tasks ordered correctly

4. **Click** to reverse sort
   - Expected: Order reversed

### Expected Outcome
- Tasks sort correctly by selected criteria
