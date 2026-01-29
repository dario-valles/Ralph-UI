# Test Suite: Simplified PRD Creation Flow

## Overview

Tests for the simplified PRD creation flow with first-time user onboarding.

## Preconditions

- Application running
- No active session (or create a new one)

## Test: First-Time User Flow

### Description

Verify first-time users see the simplified GSD intro screen before creating a PRD.

### Steps

1. **Clear** onboarding state
   - Execute: `localStorage.removeItem('ralph-onboarding')`
   - Execute: `localStorage.removeItem('ralph-gsd-onboarding')`

2. **Navigate** to Home/Dashboard
   - Expected: Dashboard loads

3. **Click** "New Session" or "Start" button
   - Expected: Workflow Selector appears
   - Expected: Three options visible:
     - "Full Project Plan" (badge: Recommended)
     - "Import from GitHub"
   - Expected: Project Context section at bottom

4. **Select** "Full Project Plan"
   - Expected: SimpleGSDIntro screen appears
   - Expected: Title: "Let's plan your project together"
   - Expected: Description about GSD workflow
   - Expected: 4 preview cards:
     - "Deep Questioning" - Clarify your idea
     - "Research" - Parallel AI agents
     - "Requirements" - Auto-generated
     - "Roadmap" - Visual planning
   - Expected: "Skip" and "Get Started" buttons visible

5. **Click** "Get Started"
   - Expected: PRD Type Selection screen appears
   - Expected: Three sections:
     - "Quick PRD" (Bug Fix, Refactoring, API Integration)
     - "Full Project Plan" (New Feature, Full New App)
     - "Other" (General)
   - Expected: "Back" and "Continue" buttons visible

6. **Select** "Full New App" (Rocket icon)
   - Expected: Selection highlighted with ring
   - Expected: "Continue" button enabled

7. **Click** "Continue"
   - Expected: "Name Your Session" dialog appears
   - Expected: Default name: "Full New App PRD"

8. **Enter** session name "Test App Plan"
   - Expected: Name entered

9. **Click** "Create Session"
   - Expected: Dialog closes
   - Expected: Navigates to chat interface
   - Expected: "Deep Questioning" component visible (look for "Project Discovery Chat" title or "Context Checklist")
   - Expected: "What", "Why", "Who", "Done" badges visible

10. **Verify** onboarding marked as seen
    - Execute: `localStorage.getItem('ralph-gsd-onboarding')`
    - Expected: Returns `"true"`

### Expected Outcome

- First-time users see simplified intro (not 4-step tour)
- Intro shows 4-step preview in a single screen
- PRD types grouped into 3 categories
- Deep Questioning appears for Full New App

---

## Test: Returning User Flow

### Description

Verify returning users skip the intro and go directly to PRD type selection.

### Steps

1. **Set** onboarding state
   - Execute: `localStorage.setItem('ralph-gsd-onboarding', 'true')`

2. **Navigate** to PRD Chat
   - Expected: PRD Chat page loads

3. **Click** "New session"
   - Expected: Workflow Selector appears

4. **Select** "Full Project Plan"
   - Expected: Goes directly to PRD Type Selection (no intro screen)
   - Expected: Three sections visible (Quick PRD, Full Project Plan, Other)

5. **Select** "Full New App"
   - Expected: Selection highlighted

6. **Click** "Continue"
   - Expected: "Name Your Session" dialog appears

7. **Enter** name "My App" and click "Create Session"
   - Expected: Session created
   - Expected: Deep Questioning chat appears

### Expected Outcome

- Returning users skip intro screen
- Direct path to type selection and creation

---

## Test: Quick PRD Flow

### Description

Verify Quick PRD types bypass Deep Questioning.

### Steps

1. **Navigate** to PRD Chat → "New session"
   - Expected: Workflow Selector appears

2. **Select** "Full Project Plan"
   - Expected: PRD Type Selection appears

3. **Scroll** to "Quick PRD" section
   - Expected: Three options visible:
     - Bug Fix (red)
     - Refactoring (purple)
     - API Integration (green)

4. **Select** "Bug Fix"
   - Expected: "Name Your Session" dialog appears immediately
   - Expected: Default name: "Bug Fix PRD"

5. **Enter** name "Fix Login Bug"
6. **Click** "Create Session"
   - Expected: Session created
   - Expected: Standard chat appears (NO Deep Questioning component)
   - Expected: Can chat normally without context checklist

### Expected Outcome

- Quick PRD types create sessions directly
- No Deep Questioning for simple tasks
- Faster workflow for fixes and refactoring

---

## Test: GitHub Import Flow

### Description

Verify GitHub import option works correctly.

### Steps

1. **Navigate** to PRD Chat → "New session"
   - Expected: Workflow Selector appears

2. **Select** "Import from GitHub"
   - Expected: GitHub Import Dialog appears
   - Expected: Repository input field visible
   - Expected: Filters for labels/milestones visible

3. **Enter** repo URL (optional: actually import)
   - Expected: Can configure import settings

4. **Cancel** or complete import
   - Expected: Returns to workflow or creates PRD

### Expected Outcome

- GitHub import option accessible from workflow selector
- Import flow works independently of onboarding
