# Test Suite: PRD Creation Workflow

## Overview
Tests for PRD document creation, editing, and execution workflow.

## Preconditions
- Application running at http://localhost:1420
- A project directory configured

---

## Test: Create PRD via Chat

### Description
Verify creating PRD through chat interface.

### Steps
1. **Navigate** to PRD section
   - Expected: PRD list loads

2. **Click** "Create PRD" or "New PRD" button
   - Expected: PRD creation options

3. **Select** "Create via Chat" option
   - Expected: Chat interface opens

4. **Verify** initial prompt
   - Expected: First question about project

5. **Answer** chat questions about project
   - Expected: Conversation progresses

6. **Continue** answering until PRD generated
   - Expected: PRD content created

7. **Verify** PRD preview
   - Expected: Generated PRD visible

8. **Click** save/finalize
   - Expected: PRD saved

9. **Verify** PRD in list
   - Expected: New PRD appears

### Expected Outcome
- PRD created through chat conversation

---

## Test: Edit PRD Content

### Description
Verify PRD editing functionality.

### Steps
1. **Navigate** to PRD detail view
   - Expected: PRD content loads

2. **Click** edit button
   - Expected: Edit mode activates

3. **Modify** PRD title
   - Expected: Title editable

4. **Modify** PRD description/overview
   - Expected: Content editable

5. **Add** new requirement/story
   - Expected: Story added

6. **Edit** existing story
   - Expected: Story modified

7. **Delete** a story
   - Expected: Story removed

8. **Save** changes
   - Expected: Changes saved

9. **Verify** updates persisted
   - Expected: Changes visible after reload

### Expected Outcome
- PRD content can be fully edited

---

## Test: PRD Story Management

### Description
Verify managing user stories in PRD.

### Steps
1. **Navigate** to PRD detail
   - Expected: PRD loads

2. **Verify** stories list displayed
   - Expected: User stories visible

3. **Click** "Add Story" button
   - Expected: Story creation form

4. **Fill** story title
   - Expected: Title entered

5. **Fill** story description
   - Expected: Description entered

6. **Add** acceptance criteria
   - Expected: Criteria entered

7. **Set** story priority
   - Expected: Priority selected

8. **Save** story
   - Expected: Story added

9. **Reorder** stories via drag-drop
   - Expected: Order changed

### Expected Outcome
- Stories can be created, edited, and reordered

---

## Test: PRD to Session Conversion

### Description
Verify converting PRD to session with tasks.

### Steps
1. **Navigate** to PRD detail
   - Expected: PRD loads

2. **Click** "Create Session from PRD" button
   - Expected: Conversion dialog

3. **Configure** session settings
   - Expected: Settings available

4. **Click** create/convert button
   - Expected: Session created

5. **Verify** redirected to new session
   - Expected: Session detail loads

6. **Verify** tasks created from stories
   - Expected: Tasks match PRD stories

7. **Verify** task details from PRD
   - Expected: Descriptions from stories

### Expected Outcome
- PRD converts to session with tasks

---

## Test: PRD Progress Tracking

### Description
Verify PRD shows progress when used in session.

### Steps
1. **Create** session from PRD
   - Expected: Session with tasks

2. **Complete** some tasks in session
   - Expected: Tasks marked done

3. **Navigate** to original PRD
   - Expected: PRD detail loads

4. **Verify** progress indicator
   - Expected: Completion percentage

5. **Verify** story status reflects tasks
   - Expected: Completed stories marked

### Expected Outcome
- PRD shows progress from linked session

---

## Test: PRD Export

### Description
Verify PRD export functionality.

### Steps
1. **Navigate** to PRD detail
   - Expected: PRD loads

2. **Click** export button
   - Expected: Export options appear

3. **Select** Markdown format
   - Expected: Format selected

4. **Click** export
   - Expected: Export initiates

5. **Verify** export content
   - Expected: Valid Markdown output

6. **Try** JSON export
   - Expected: JSON format works

### Expected Outcome
- PRD can be exported in multiple formats

---

## Test: PRD Version History

### Description
Verify PRD version tracking.

### Steps
1. **Navigate** to PRD detail
   - Expected: PRD loads

2. **Make** several edits over time
   - Expected: Changes saved

3. **Click** history/versions tab
   - Expected: Version history visible

4. **Verify** versions listed
   - Expected: Edit history shown

5. **Click** on older version
   - Expected: Version content displayed

6. **Compare** versions (if available)
   - Expected: Diff shown

### Expected Outcome
- PRD maintains version history

---

## Test: Duplicate PRD

### Description
Verify PRD duplication.

### Steps
1. **Navigate** to PRD detail
   - Expected: PRD loads

2. **Click** duplicate/copy option
   - Expected: Duplicate dialog

3. **Modify** name for duplicate
   - Expected: Name changed

4. **Click** create duplicate
   - Expected: Duplicate created

5. **Verify** both PRDs exist
   - Expected: Original and copy in list

6. **Verify** duplicate content
   - Expected: Content matches original

### Expected Outcome
- PRD can be duplicated successfully
