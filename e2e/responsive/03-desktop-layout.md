# Test Suite: Desktop Layout

## Overview
Responsive design tests for desktop viewport (1920x1080 - Full HD standard).

## Preconditions
- Application running at http://localhost:1420
- Browser viewport set to 1920x1080

---

## Test: Desktop Full Layout

### Description
Verify full desktop layout renders correctly.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout activates

2. **Navigate** to http://localhost:1420
   - Expected: Page loads

3. **Verify** sidebar fully visible
   - Expected: Full sidebar with labels

4. **Verify** main content area
   - Expected: Spacious content area

5. **Verify** no wasted space
   - Expected: Layout uses available width well

### Expected Outcome
- Desktop layout utilizes full viewport

---

## Test: Desktop Sidebar Expanded

### Description
Verify expanded sidebar on desktop.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout

2. **Navigate** to any page
   - Expected: Page loads

3. **Verify** sidebar expanded by default
   - Expected: Full sidebar visible

4. **Verify** navigation labels visible
   - Expected: Text labels shown

5. **Verify** collapse toggle available
   - Expected: Can collapse if desired

### Expected Outcome
- Sidebar fully expanded on desktop

---

## Test: Desktop Multi-Column Grid

### Description
Verify grid uses multiple columns.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout

2. **Navigate** to sessions list
   - Expected: Sessions display

3. **Verify** grid columns
   - Expected: 3-4+ column grid

4. **Verify** cards well-spaced
   - Expected: Appropriate gaps

5. **Verify** content readable
   - Expected: Cards not too small

### Expected Outcome
- Grid uses desktop space effectively

---

## Test: Desktop Agent Dashboard

### Description
Verify agent dashboard on desktop.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout

2. **Navigate** to session with agents
   - Expected: Agent view loads

3. **Verify** agent cards in grid
   - Expected: Multiple agents visible

4. **Verify** metrics displayed
   - Expected: Stats charts visible

5. **Verify** logs panel
   - Expected: Logs have adequate space

### Expected Outcome
- Agent dashboard uses desktop space well

---

## Test: Desktop Split Panes

### Description
Verify split pane views on desktop.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout

2. **Navigate** to view with panels
   - Expected: Split view loads

3. **Verify** multiple panes visible
   - Expected: 2-3 panes side-by-side

4. **Verify** pane content readable
   - Expected: Each pane has space

5. **Resize** panes if supported
   - Expected: Smooth resize

### Expected Outcome
- Split panes work well on desktop

---

## Test: Desktop PRD Workflow

### Description
Verify PRD workflow on desktop.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout

2. **Navigate** to PRD Chat
   - Expected: PRD Chat loads

3. **Verify** session sidebar visible
   - Expected: Sessions list on left side

4. **Verify** chat area spacious
   - Expected: Chat messages have room

5. **Verify** plan sidebar (if visible)
   - Expected: Plan sidebar on right side

### Expected Outcome
- PRD workflow fully usable on desktop

---

## Test: Desktop Keyboard Shortcuts

### Description
Verify keyboard shortcuts on desktop.

### Steps
1. **Set** viewport to 1920x1080
   - Expected: Desktop layout

2. **Navigate** to any page
   - Expected: Page loads

3. **Press** keyboard shortcut (if defined)
   - Expected: Shortcut activates feature

4. **Verify** shortcut help (if available)
   - Expected: Shortcut list accessible

5. **Test** navigation shortcuts
   - Expected: Can navigate via keyboard

### Expected Outcome
- Keyboard shortcuts work on desktop
