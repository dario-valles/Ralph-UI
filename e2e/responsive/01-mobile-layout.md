# Test Suite: Mobile Layout

## Overview
Responsive design tests for mobile viewport (375x667 - iPhone SE/standard mobile).

## Preconditions
- Application running at http://localhost:1420
- Browser viewport set to 375x667

---

## Test: Mobile Viewport Navigation

### Description
Verify navigation works on mobile viewport.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout activates

2. **Navigate** to http://localhost:1420
   - Expected: Page loads in mobile layout

3. **Verify** hamburger menu visible
   - Expected: Mobile nav toggle present

4. **Click** hamburger menu
   - Expected: Navigation drawer opens

5. **Verify** navigation links visible
   - Expected: All nav links in drawer

6. **Click** a navigation link
   - Expected: Navigates to page

7. **Verify** drawer closes after navigation
   - Expected: Drawer auto-closes

### Expected Outcome
- Mobile navigation works correctly

---

## Test: Mobile Sidebar Collapse

### Description
Verify sidebar behavior on mobile.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to any page
   - Expected: Page loads

3. **Verify** sidebar is collapsed/hidden
   - Expected: No visible sidebar

4. **Toggle** sidebar (if available)
   - Expected: Sidebar slides in/out

5. **Verify** content area fills width
   - Expected: Main content uses full width

### Expected Outcome
- Sidebar collapses appropriately on mobile

---

## Test: Mobile Session Cards

### Description
Verify session cards display on mobile.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to sessions list
   - Expected: Sessions page loads

3. **Verify** cards stack vertically
   - Expected: Single column layout

4. **Verify** card content readable
   - Expected: Text not truncated poorly

5. **Verify** touch targets adequate
   - Expected: Buttons large enough (44px min)

6. **Tap** on session card
   - Expected: Session opens

### Expected Outcome
- Session cards display correctly on mobile

---

## Test: Mobile Task List

### Description
Verify task list on mobile viewport.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to session tasks view
   - Expected: Tasks display

3. **Verify** task items stack vertically
   - Expected: Full width task items

4. **Verify** task actions accessible
   - Expected: Action buttons visible/usable

5. **Tap** task to expand/view details
   - Expected: Task detail accessible

### Expected Outcome
- Task list usable on mobile

---

## Test: Mobile Form Inputs

### Description
Verify form inputs on mobile.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to form (e.g., create session)
   - Expected: Form displays

3. **Verify** input fields full width
   - Expected: Inputs span container

4. **Tap** input field
   - Expected: Keyboard opens (on device)

5. **Fill** form fields
   - Expected: Input works correctly

6. **Verify** form buttons accessible
   - Expected: Submit button visible

### Expected Outcome
- Forms are usable on mobile

---

## Test: Mobile Modal Dialogs

### Description
Verify modals on mobile viewport.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Trigger** a modal dialog
   - Expected: Modal opens

3. **Verify** modal fits viewport
   - Expected: No horizontal scroll

4. **Verify** modal content scrollable
   - Expected: Content scrolls if needed

5. **Verify** close button accessible
   - Expected: Can close modal

6. **Close** modal
   - Expected: Modal dismisses

### Expected Outcome
- Modals work correctly on mobile

---

## Test: Mobile Touch Gestures

### Description
Verify touch interactions work.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to scrollable content
   - Expected: Content loads

3. **Scroll** vertically by touch
   - Expected: Smooth scrolling

4. **Verify** no horizontal scroll (unless intended)
   - Expected: Content contained

5. **Test** pull-to-refresh (if implemented)
   - Expected: Refresh triggers

### Expected Outcome
- Touch gestures work as expected

---

## Test: Mobile Agent Status

### Description
Verify agent status display on mobile.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to session with agents
   - Expected: Agents view loads

3. **Verify** agent cards readable
   - Expected: Status visible

4. **Verify** agent controls accessible
   - Expected: Stop/pause buttons usable

5. **Tap** agent for details
   - Expected: Details accessible

### Expected Outcome
- Agent status usable on mobile

---

## Test: Mobile GSD Kanban

### Description
Verify GSD Kanban on mobile viewport.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to GSD scoping phase
   - Expected: Kanban loads

3. **Verify** columns stack or scroll
   - Expected: Kanban usable layout

4. **Verify** cards visible
   - Expected: Requirement cards shown

5. **Drag** card (if supported on touch)
   - Expected: Drag works or alternative

6. **Verify** column labels visible
   - Expected: V1/V2/Out visible

### Expected Outcome
- Kanban is usable on mobile

---

## Test: Mobile Header Layout

### Description
Verify header on mobile viewport.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to any page
   - Expected: Page loads

3. **Verify** logo/title fits
   - Expected: Header not overflowing

4. **Verify** header actions accessible
   - Expected: Settings/profile reachable

5. **Verify** header stays fixed
   - Expected: Header visible on scroll

### Expected Outcome
- Header displays correctly on mobile

---

## Test: Mobile Empty States

### Description
Verify empty states on mobile.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Navigate** to empty state (no sessions)
   - Expected: Empty state displays

3. **Verify** message readable
   - Expected: Text fits viewport

4. **Verify** action button accessible
   - Expected: Create button usable

### Expected Outcome
- Empty states display correctly on mobile

---

## Test: Mobile Notifications/Toasts

### Description
Verify toast notifications on mobile.

### Steps
1. **Set** viewport to 375x667
   - Expected: Mobile layout

2. **Trigger** action that shows toast
   - Expected: Toast appears

3. **Verify** toast visible and readable
   - Expected: Toast fits viewport

4. **Verify** toast dismissible
   - Expected: Can dismiss toast

### Expected Outcome
- Toasts display correctly on mobile
