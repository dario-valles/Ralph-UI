# Test Suite: Session Management

## Overview
Tests for session creation, viewing, editing, deletion, templates, and export functionality.

## Preconditions
- Application running at http://localhost:1420
- A test project directory exists

---

## Test: Create Session - Basic

### Description
Verify basic session creation workflow.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Click** "Create Session" or "New Session" button
   - Expected: Session creation dialog/form appears

3. **Fill** session name field with "Test Session E2E"
   - Selector: Input for session name
   - Expected: Value is entered

4. **Fill** description field with "Created by E2E test"
   - Selector: Input/textarea for description
   - Expected: Value is entered

5. **Click** submit/create button
   - Expected: Session is created

6. **Verify** success feedback
   - Expected: Toast notification or redirect to session

7. **Verify** session appears in list
   - Expected: "Test Session E2E" visible in sessions list

### Expected Outcome
- New session is created and visible in the sessions list

---

## Test: Create Session - With Template

### Description
Verify session creation using a template.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Click** "Create Session" button
   - Expected: Creation dialog appears

3. **Select** template option (if available)
   - Expected: Template selector is shown

4. **Select** a template from the list
   - Expected: Form is pre-filled with template values

5. **Modify** session name to "Template Session E2E"
   - Expected: Name is updated

6. **Click** submit/create button
   - Expected: Session is created with template configuration

### Expected Outcome
- Session created with template-based configuration

---

## Test: View Session Details

### Description
Verify session detail view displays all information.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Click** on an existing session card
   - Expected: Session detail view opens

3. **Verify** session name is displayed
   - Expected: Session name visible in header/title

4. **Verify** session status is shown
   - Expected: Status badge or indicator visible

5. **Verify** tasks section exists
   - Expected: Tasks tab or section is present

6. **Verify** agents section exists
   - Expected: Agents tab or section is present

### Expected Outcome
- Session detail view shows all relevant information

---

## Test: Update Session

### Description
Verify session can be edited and updated.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** edit button or settings icon
   - Expected: Edit mode or dialog opens

3. **Modify** session description
   - Expected: Field is editable

4. **Click** save/update button
   - Expected: Changes are saved

5. **Verify** success feedback
   - Expected: Toast or visual confirmation

6. **Verify** changes persisted
   - Expected: Updated description visible

### Expected Outcome
- Session is successfully updated with new values

---

## Test: Delete Session

### Description
Verify session deletion with confirmation.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Click** delete button on a session (or access via menu)
   - Expected: Confirmation dialog appears

3. **Verify** confirmation dialog content
   - Expected: Warning message about deletion

4. **Click** confirm delete button
   - Expected: Session is deleted

5. **Verify** session removed from list
   - Expected: Session no longer appears in list

### Expected Outcome
- Session is deleted after confirmation

---

## Test: Session Status Transitions

### Description
Verify session status can be changed.

### Steps
1. **Navigate** to session detail page
   - Expected: Session loads with current status

2. **Verify** initial status is shown
   - Expected: Status badge visible (e.g., "Active", "Paused")

3. **Click** status control (pause/resume button)
   - Expected: Status changes

4. **Verify** new status displayed
   - Expected: Status badge updated

### Expected Outcome
- Session status transitions correctly

---

## Test: Export Session - JSON

### Description
Verify session can be exported as JSON.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** export button or menu
   - Expected: Export options appear

3. **Select** JSON export option
   - Expected: Export initiates

4. **Verify** export feedback
   - Expected: Download starts or success message

### Expected Outcome
- Session exported as JSON file

---

## Test: Export Session - Preview

### Description
Verify session export preview functionality.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** export button or menu
   - Expected: Export options appear

3. **Select** preview option (if available)
   - Expected: Preview dialog/panel opens

4. **Verify** preview content
   - Expected: Session data displayed in preview

5. **Click** close/cancel to dismiss preview
   - Expected: Preview closes

### Expected Outcome
- Export preview displays session data correctly

---

## Test: Create Session Template

### Description
Verify template creation from existing session.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** "Save as Template" option
   - Expected: Template dialog opens

3. **Fill** template name field
   - Expected: Name is entered

4. **Click** save template button
   - Expected: Template is saved

5. **Verify** success feedback
   - Expected: Toast or confirmation

### Expected Outcome
- Template created from session configuration

---

## Test: List Templates

### Description
Verify templates list is accessible.

### Steps
1. **Navigate** to templates page or settings
   - Expected: Templates list loads

2. **Verify** templates are displayed
   - Expected: At least one template visible (or empty state)

3. **Verify** template details shown
   - Expected: Template name and description visible

### Expected Outcome
- Templates list displays available templates

---

## Test: Use Template for New Session

### Description
Verify template can be applied to new session.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Click** "Create from Template" or access template selection
   - Expected: Template selection available

3. **Select** a template
   - Expected: Template configuration loaded

4. **Fill** any required additional fields
   - Expected: Form accepts input

5. **Click** create button
   - Expected: Session created with template config

### Expected Outcome
- New session created with template configuration applied

---

## Test: Session Crash Recovery

### Description
Verify session state persists across page reloads.

### Steps
1. **Navigate** to session detail page
   - Expected: Session loads

2. **Note** current session state (tasks, agents)
   - Expected: State is visible

3. **Refresh** the page (F5 or reload)
   - Expected: Page reloads

4. **Verify** session state preserved
   - Expected: Same session with same state

### Expected Outcome
- Session state persists across page reloads

---

## Test: Session Comparison

### Description
Verify ability to compare multiple sessions.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Select** first session for comparison (if feature exists)
   - Expected: Session marked for comparison

3. **Select** second session for comparison
   - Expected: Comparison view opens

4. **Verify** comparison data
   - Expected: Side-by-side session details

### Expected Outcome
- Sessions can be compared side-by-side

---

## Test: Session Analytics

### Description
Verify session analytics/metrics display.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** analytics tab or section
   - Expected: Analytics view opens

3. **Verify** metrics displayed
   - Expected: Task counts, agent stats, duration visible

### Expected Outcome
- Session analytics show relevant metrics

---

## Test: Session History

### Description
Verify session history/activity log.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** history or activity tab
   - Expected: History view opens

3. **Verify** history entries
   - Expected: Timeline of session events

### Expected Outcome
- Session history displays activity log

---

## Test: Filter Sessions by Status

### Description
Verify sessions can be filtered by status.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Click** status filter dropdown
   - Expected: Filter options appear

3. **Select** a status filter (e.g., "Active")
   - Expected: Filter applied

4. **Verify** filtered results
   - Expected: Only sessions with selected status shown

### Expected Outcome
- Session list filters by status correctly

---

## Test: Search Sessions

### Description
Verify session search functionality.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Fill** search input with session name
   - Selector: Search input field
   - Expected: Search query entered

3. **Verify** search results
   - Expected: Matching sessions displayed

4. **Clear** search input
   - Expected: Full list restored

### Expected Outcome
- Session search returns matching results

---

## Test: Sort Sessions

### Description
Verify sessions can be sorted.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Click** sort control (name, date, status)
   - Expected: Sort applied

3. **Verify** sort order
   - Expected: Sessions ordered correctly

4. **Click** sort control again
   - Expected: Sort order reversed

### Expected Outcome
- Sessions sort correctly by selected criteria

---

## Test: Session Pagination

### Description
Verify pagination for large session lists.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Verify** pagination controls (if many sessions)
   - Expected: Page numbers or infinite scroll

3. **Navigate** to next page
   - Expected: Additional sessions load

### Expected Outcome
- Session pagination works correctly

---

## Test: Empty Sessions State

### Description
Verify empty state when no sessions exist.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Verify** empty state display (if no sessions)
   - Expected: Helpful message and create button

### Expected Outcome
- Empty state provides guidance for creating first session

---

## Test: Session Quick Actions

### Description
Verify quick action buttons on session cards.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Hover** over a session card
   - Expected: Quick action buttons appear

3. **Verify** available actions
   - Expected: View, Edit, Delete actions available

### Expected Outcome
- Quick actions are accessible on session cards

---

## Test: Session Keyboard Navigation

### Description
Verify keyboard navigation in sessions list.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Press** Tab to navigate to session list
   - Expected: Focus enters session list

3. **Press** Arrow keys to navigate between sessions
   - Expected: Focus moves between session cards

4. **Press** Enter to select session
   - Expected: Session opens

### Expected Outcome
- Session list is fully keyboard navigable

---

## Test: Session Bulk Actions

### Description
Verify bulk operations on multiple sessions.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Select** multiple sessions (if feature exists)
   - Expected: Sessions marked as selected

3. **Click** bulk action button
   - Expected: Bulk action menu appears

4. **Verify** available bulk actions
   - Expected: Delete, Export options available

### Expected Outcome
- Bulk actions work on multiple selected sessions

---

## Test: Session Duplicate

### Description
Verify session duplication.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** duplicate or "Save as New" option
   - Expected: Duplicate dialog opens

3. **Modify** name for duplicate
   - Expected: Name is editable

4. **Click** create duplicate button
   - Expected: New session created

5. **Verify** duplicate in sessions list
   - Expected: Both original and duplicate visible

### Expected Outcome
- Session can be duplicated successfully

---

## Test: Session Archive

### Description
Verify session archiving functionality.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** archive option
   - Expected: Archive confirmation appears

3. **Confirm** archive action
   - Expected: Session archived

4. **Verify** session moved to archive
   - Expected: Session not in active list

5. **Navigate** to archived sessions
   - Expected: Archived session visible

### Expected Outcome
- Sessions can be archived and viewed in archive

---

## Test: Restore Archived Session

### Description
Verify archived session can be restored.

### Steps
1. **Navigate** to archived sessions
   - Expected: Archive list loads

2. **Click** restore on archived session
   - Expected: Restore confirmation appears

3. **Confirm** restore action
   - Expected: Session restored

4. **Verify** session in active list
   - Expected: Session appears in active sessions

### Expected Outcome
- Archived sessions can be restored to active

---

## Test: Session Tags

### Description
Verify session tagging functionality.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** add tag option
   - Expected: Tag input appears

3. **Fill** tag name
   - Expected: Tag is entered

4. **Submit** tag
   - Expected: Tag added to session

5. **Verify** tag displayed
   - Expected: Tag visible on session

### Expected Outcome
- Sessions can be tagged for organization

---

## Test: Filter Sessions by Tag

### Description
Verify sessions can be filtered by tag.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions list loads

2. **Click** tag filter
   - Expected: Tag filter options appear

3. **Select** a tag
   - Expected: Filter applied

4. **Verify** filtered results
   - Expected: Only tagged sessions shown

### Expected Outcome
- Session list filters by tag correctly

---

## Test: Session Notes

### Description
Verify session notes functionality.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** notes tab or section
   - Expected: Notes view opens

3. **Fill** note content
   - Expected: Text is entered

4. **Save** note
   - Expected: Note is saved

5. **Verify** note persisted
   - Expected: Note visible after refresh

### Expected Outcome
- Session notes can be added and saved

---

## Test: Session Collaborators

### Description
Verify session sharing/collaborator features.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** share or collaborators option
   - Expected: Share dialog opens

3. **Verify** share options
   - Expected: Share link or invite options

### Expected Outcome
- Session sharing options are available

---

## Test: Session Auto-save

### Description
Verify session changes auto-save.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Modify** session content
   - Expected: Changes made

3. **Wait** for auto-save indicator
   - Expected: "Saved" or similar indicator appears

4. **Refresh** page without manual save
   - Expected: Changes persisted

### Expected Outcome
- Session changes auto-save without manual action

---

## Test: Session Import

### Description
Verify session import from file.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Click** import button
   - Expected: Import dialog opens

3. **Select** session file to import
   - Expected: File selected

4. **Click** import button
   - Expected: Session imported

5. **Verify** imported session in list
   - Expected: Session appears with imported data

### Expected Outcome
- Sessions can be imported from external files

---

## Test: Session Statistics Dashboard

### Description
Verify session statistics overview.

### Steps
1. **Navigate** to http://localhost:1420/sessions
   - Expected: Sessions page loads

2. **Verify** statistics cards/summary
   - Expected: Total sessions, active count, etc. displayed

### Expected Outcome
- Session statistics provide overview of all sessions

---

## Test: Recent Sessions

### Description
Verify recent sessions quick access.

### Steps
1. **Navigate** to http://localhost:1420 (dashboard)
   - Expected: Dashboard loads

2. **Verify** recent sessions section
   - Expected: Recently accessed sessions listed

3. **Click** a recent session
   - Expected: Session opens quickly

### Expected Outcome
- Recent sessions are accessible from dashboard

---

## Test: Session Favorites

### Description
Verify session favoriting functionality.

### Steps
1. **Navigate** to session detail page
   - Expected: Session detail loads

2. **Click** favorite/star button
   - Expected: Session marked as favorite

3. **Navigate** to favorites or filter by favorites
   - Expected: Favorited session appears

### Expected Outcome
- Sessions can be favorited for quick access

---

## Test: Session Notifications

### Description
Verify session-related notifications.

### Steps
1. **Navigate** to session with active agents
   - Expected: Session detail loads

2. **Verify** notification indicators
   - Expected: Notification badges or alerts visible

3. **Click** notification
   - Expected: Notification details shown

### Expected Outcome
- Session notifications are visible and interactive
