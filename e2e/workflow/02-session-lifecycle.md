# Test Suite: Session Lifecycle

## Overview
End-to-end tests for complete session lifecycle from creation through completion.

## Preconditions
- Application running at http://localhost:1420
- A project directory configured
- Agent executables available

---

## Test: Full Session Workflow

### Description
Complete session from creation to task completion.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Click** "Create Session" button
   - Expected: Creation dialog opens

3. **Fill** session name "E2E Lifecycle Test"
   - Expected: Name entered

4. **Fill** description "Testing full lifecycle"
   - Expected: Description entered

5. **Click** create button
   - Expected: Session created

6. **Verify** redirected to session detail
   - Expected: New session page loads

7. **Click** "Add Task" button
   - Expected: Task creation form

8. **Fill** task title "Implement feature X"
   - Expected: Title entered

9. **Click** create task
   - Expected: Task created

10. **Click** "Spawn Agent" on task
    - Expected: Agent configuration appears

11. **Select** agent type (Claude Code)
    - Expected: Agent selected

12. **Click** start agent
    - Expected: Agent spawns

13. **Verify** agent running status
    - Expected: Running indicator

14. **Wait** for agent progress
    - Expected: Agent working on task

15. **Verify** task updates with progress
    - Expected: Progress visible

16. **Wait** for agent completion (or stop manually)
    - Expected: Agent finishes

17. **Verify** task status updated
    - Expected: Task shows completion

18. **Update** session status to complete
    - Expected: Session marked complete

### Expected Outcome
- Full session lifecycle completes successfully

---

## Test: Session Interruption and Recovery

### Description
Verify session recovery after unexpected interruption.

### Steps
1. **Navigate** to active session with running agent
   - Expected: Session and agent active

2. **Note** current state (task progress, agent status)
   - Expected: State recorded

3. **Simulate** interruption (refresh page)
   - Expected: Page reloads

4. **Verify** session state recovered
   - Expected: Same session visible

5. **Verify** agent state
   - Expected: Agent status reflects actual state

6. **Verify** task progress preserved
   - Expected: Progress maintained

7. **Continue** or restart as needed
   - Expected: Workflow can continue

### Expected Outcome
- Session recovers from interruption with state intact

---

## Test: Multi-Task Session

### Description
Verify session with multiple tasks and agents.

### Steps
1. **Create** new session
   - Expected: Session created

2. **Add** first task "Task A"
   - Expected: Task A created

3. **Add** second task "Task B"
   - Expected: Task B created

4. **Add** third task "Task C"
   - Expected: Task C created

5. **Spawn** agent for Task A
   - Expected: Agent A running

6. **Spawn** agent for Task B
   - Expected: Agent B running

7. **Verify** both agents active
   - Expected: Two agents in list

8. **Verify** tasks assigned correctly
   - Expected: Each agent on correct task

9. **Monitor** parallel progress
   - Expected: Both tasks progressing

10. **Wait** for completions
    - Expected: Tasks complete

11. **Spawn** agent for Task C
    - Expected: Agent C running

12. **Complete** all tasks
    - Expected: Session fully done

### Expected Outcome
- Multiple tasks managed successfully in session

---

## Test: Session from Template

### Description
Verify creating session from saved template.

### Steps
1. **Navigate** to templates or session create
   - Expected: Template option available

2. **Select** "Create from Template"
   - Expected: Template list shown

3. **Choose** a template
   - Expected: Template selected

4. **Verify** pre-filled values
   - Expected: Template config loaded

5. **Modify** name to unique value
   - Expected: Name changed

6. **Create** session
   - Expected: Session created with template

7. **Verify** tasks pre-created (if in template)
   - Expected: Template tasks present

8. **Verify** settings from template
   - Expected: Configuration matches template

### Expected Outcome
- Session created with template configuration

---

## Test: Session Export and Archive

### Description
Verify exporting and archiving completed session.

### Steps
1. **Navigate** to completed session
   - Expected: Session detail loads

2. **Click** export option
   - Expected: Export dialog opens

3. **Select** JSON format
   - Expected: Format selected

4. **Export** session
   - Expected: Export completes

5. **Verify** export file contains session data
   - Expected: Valid JSON with session info

6. **Click** archive option
   - Expected: Archive confirmation

7. **Confirm** archive
   - Expected: Session archived

8. **Verify** session in archive list
   - Expected: Found in archived sessions

9. **Restore** from archive
   - Expected: Session restored

10. **Verify** session active again
    - Expected: Back in active sessions

### Expected Outcome
- Session can be exported and archived/restored
