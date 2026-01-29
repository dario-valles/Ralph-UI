# Test Suite: Tablet Layout

## Overview
Responsive design tests for tablet viewport (768x1024 - iPad standard).

## Preconditions
- Application running at http://localhost:1420
- Browser viewport set to 768x1024

---

## Test: Tablet Viewport Navigation

### Description
Verify navigation on tablet viewport.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout activates

2. **Navigate** to http://localhost:1420
   - Expected: Page loads

3. **Verify** sidebar visibility
   - Expected: Sidebar may be collapsed or visible

4. **Verify** navigation links accessible
   - Expected: All navigation reachable

5. **Click** navigation item
   - Expected: Navigation works

### Expected Outcome
- Navigation works on tablet viewport

---

## Test: Tablet Sidebar Behavior

### Description
Verify sidebar on tablet viewport.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout

2. **Navigate** to any page
   - Expected: Page loads

3. **Verify** sidebar state
   - Expected: May be collapsed or rail mode

4. **Toggle** sidebar expand/collapse
   - Expected: Sidebar transitions smoothly

5. **Verify** content adjusts
   - Expected: Main content reflows

### Expected Outcome
- Sidebar behaves appropriately on tablet

---

## Test: Tablet Grid Layout

### Description
Verify grid layouts on tablet.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout

2. **Navigate** to sessions list
   - Expected: Sessions display

3. **Verify** grid columns
   - Expected: 2-3 column grid (not single)

4. **Verify** cards properly sized
   - Expected: Cards fit grid

5. **Verify** no overflow
   - Expected: Content contained

### Expected Outcome
- Grid layouts adapt to tablet width

---

## Test: Tablet Form Layout

### Description
Verify forms on tablet viewport.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout

2. **Navigate** to form (create session)
   - Expected: Form displays

3. **Verify** form width
   - Expected: Form uses appropriate width

4. **Verify** multi-column fields (if any)
   - Expected: Fields may be side-by-side

5. **Fill** form and submit
   - Expected: Form works correctly

### Expected Outcome
- Forms display well on tablet

---

## Test: Tablet Modal Size

### Description
Verify modal sizing on tablet.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout

2. **Trigger** modal dialog
   - Expected: Modal opens

3. **Verify** modal size appropriate
   - Expected: Not full screen, reasonable width

4. **Verify** backdrop visible
   - Expected: Background dimmed

5. **Close** modal
   - Expected: Modal dismisses

### Expected Outcome
- Modals sized appropriately for tablet

---

## Test: Tablet PRD Chat

### Description
Verify PRD Chat layout on tablet.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout

2. **Navigate** to PRD Chat
   - Expected: Chat loads

3. **Verify** session sidebar visible
   - Expected: Sessions list on left

4. **Verify** chat area properly sized
   - Expected: Chat fills remaining width

5. **Verify** guidance panel layout
   - Expected: Guidance displays appropriately

### Expected Outcome
- PRD Chat fully usable on tablet

---

## Test: Tablet Split View

### Description
Verify split/dual pane views on tablet.

### Steps
1. **Set** viewport to 768x1024
   - Expected: Tablet layout

2. **Navigate** to view with split panes
   - Expected: Content loads

3. **Verify** both panes visible
   - Expected: Split layout works

4. **Verify** pane sizing
   - Expected: Appropriate proportions

5. **Resize** panes (if draggable)
   - Expected: Resize works

### Expected Outcome
- Split views work on tablet viewport
