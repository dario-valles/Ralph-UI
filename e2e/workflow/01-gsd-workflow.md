# Test Suite: GSD Workflow

## Overview
Tests for the Get Stuff Done (GSD) workflow, covering all 8 phases from questioning through export.

## Preconditions
- Application running at http://localhost:1420
- A project directory configured

---

## Test: Start GSD Session

### Description
Verify starting a new GSD workflow session.

### Steps
1. **Navigate** to http://localhost:1420
   - Expected: Dashboard loads

2. **Click** "Start GSD" or "New Planning Session" button
   - Expected: GSD workflow starts

3. **Verify** GSD interface loads
   - Expected: First phase (Questioning) visible

4. **Verify** progress indicator shows Phase 1
   - Expected: Progress at start

### Expected Outcome
- GSD workflow session started successfully

---

## Test: Phase 1 - Questioning (Chat Interface)

### Description
Verify questioning phase chat interaction.

### Steps
1. **Navigate** to GSD session in questioning phase
   - Expected: Chat interface visible

2. **Verify** initial prompt/question displayed
   - Expected: First question about project

3. **Fill** response in chat input
   - Expected: Text entered

4. **Click** send or press Enter
   - Expected: Response submitted

5. **Verify** follow-up question appears
   - Expected: Next question displayed

6. **Answer** additional questions as prompted
   - Expected: Conversation continues

### Expected Outcome
- Questioning phase captures project context through chat

---

## Test: Phase 1 - Complete Questioning

### Description
Verify completing the questioning phase.

### Steps
1. **Navigate** to GSD questioning phase
   - Expected: Chat visible

2. **Answer** all required questions
   - Expected: Questions answered

3. **Verify** completion indicator
   - Expected: Phase 1 can be marked complete

4. **Click** "Next Phase" or complete button
   - Expected: Advances to Phase 2

### Expected Outcome
- Questioning phase completes and advances

---

## Test: Phase 2 - Research (AI Agent Research)

### Description
Verify research phase with parallel AI agents.

### Steps
1. **Navigate** to GSD session in research phase
   - Expected: Research interface visible

2. **Verify** research topics displayed
   - Expected: Topics from questioning shown

3. **Click** "Start Research" or agents auto-start
   - Expected: Research agents spawn

4. **Verify** agent progress indicators
   - Expected: Agent status visible

5. **Wait** for research completion
   - Expected: Research results generated

6. **Verify** research outputs displayed
   - Expected: Findings visible

### Expected Outcome
- Research phase runs agents and produces findings

---

## Test: Phase 2 - Review Research Results

### Description
Verify reviewing research outputs.

### Steps
1. **Navigate** to completed research phase
   - Expected: Research results visible

2. **Click** on a research topic
   - Expected: Topic details expand

3. **Verify** research content
   - Expected: Agent findings displayed

4. **Verify** sources/references (if any)
   - Expected: References shown

### Expected Outcome
- Research results are reviewable

---

## Test: Phase 3 - Requirements Generation

### Description
Verify auto-generated requirements from research.

### Steps
1. **Navigate** to GSD requirements phase
   - Expected: Requirements view loads

2. **Verify** requirements auto-generated
   - Expected: Requirements list populated

3. **Verify** requirements have details
   - Expected: Each requirement has description

4. **Click** on a requirement
   - Expected: Full details shown

5. **Verify** edit capability
   - Expected: Can modify requirement

### Expected Outcome
- Requirements generated from research findings

---

## Test: Phase 3 - Edit Requirements

### Description
Verify requirements editing.

### Steps
1. **Navigate** to requirements phase
   - Expected: Requirements visible

2. **Click** edit on a requirement
   - Expected: Edit mode activates

3. **Modify** requirement text
   - Expected: Changes entered

4. **Save** changes
   - Expected: Changes saved

5. **Verify** updated requirement
   - Expected: New text displayed

### Expected Outcome
- Requirements can be edited

---

## Test: Phase 3 - Add New Requirement

### Description
Verify adding custom requirements.

### Steps
1. **Navigate** to requirements phase
   - Expected: Requirements list visible

2. **Click** "Add Requirement" button
   - Expected: New requirement form

3. **Fill** requirement details
   - Expected: Details entered

4. **Save** new requirement
   - Expected: Requirement added

5. **Verify** new requirement in list
   - Expected: Custom requirement visible

### Expected Outcome
- Custom requirements can be added

---

## Test: Phase 4 - Scoping (Kanban)

### Description
Verify scoping phase with Kanban board.

### Steps
1. **Navigate** to GSD scoping phase
   - Expected: Kanban board visible

2. **Verify** columns exist
   - Expected: V1, V2, Out of Scope columns

3. **Verify** requirements as cards
   - Expected: Requirements shown as cards

4. **Drag** a card from one column to another
   - Expected: Card moves

5. **Drop** card in new column
   - Expected: Card placed in new column

6. **Verify** card position saved
   - Expected: Position persists on refresh

### Expected Outcome
- Kanban scoping allows drag-and-drop categorization

---

## Test: Phase 4 - Categorize All Requirements

### Description
Verify all requirements can be categorized.

### Steps
1. **Navigate** to scoping phase
   - Expected: All requirements visible

2. **Move** requirements to appropriate columns
   - Expected: Each requirement categorized

3. **Verify** all requirements categorized
   - Expected: No uncategorized items

4. **Verify** can proceed to next phase
   - Expected: Next phase enabled

### Expected Outcome
- All requirements categorized into V1/V2/Out of Scope

---

## Test: Phase 5 - Roadmap Planning

### Description
Verify roadmap visualization phase.

### Steps
1. **Navigate** to GSD roadmap phase
   - Expected: Roadmap view loads

2. **Verify** V1 features displayed
   - Expected: V1 scope visible

3. **Verify** V2 features displayed
   - Expected: V2 scope visible

4. **Verify** visual timeline (if applicable)
   - Expected: Timeline or phases shown

5. **Verify** feature grouping
   - Expected: Related features grouped

### Expected Outcome
- Roadmap visualizes planned features by version

---

## Test: Phase 5 - Adjust Roadmap

### Description
Verify roadmap can be adjusted.

### Steps
1. **Navigate** to roadmap phase
   - Expected: Roadmap visible

2. **Drag** feature to reorder
   - Expected: Order can be changed

3. **Move** feature between versions
   - Expected: Version assignment changed

4. **Verify** changes saved
   - Expected: New arrangement persists

### Expected Outcome
- Roadmap can be adjusted as needed

---

## Test: Phase 6 - Verification

### Description
Verify requirements coverage validation.

### Steps
1. **Navigate** to GSD verification phase
   - Expected: Verification view loads

2. **Verify** coverage matrix displayed
   - Expected: Requirements vs features mapped

3. **Verify** coverage indicators
   - Expected: Covered/uncovered status shown

4. **Identify** any gaps
   - Expected: Uncovered requirements highlighted

### Expected Outcome
- Verification shows requirements coverage

---

## Test: Phase 6 - Address Coverage Gaps

### Description
Verify addressing uncovered requirements.

### Steps
1. **Navigate** to verification phase
   - Expected: Coverage matrix visible

2. **Click** on uncovered requirement
   - Expected: Options appear

3. **Assign** to feature or mark intentionally excluded
   - Expected: Status updated

4. **Verify** coverage improved
   - Expected: Gap addressed

### Expected Outcome
- Coverage gaps can be addressed

---

## Test: Phase 7 - Export to PRD

### Description
Verify converting GSD to PRD format.

### Steps
1. **Navigate** to GSD export phase
   - Expected: Export view loads

2. **Verify** PRD preview
   - Expected: PRD structure shown

3. **Click** "Export as PRD" button
   - Expected: Export initiates

4. **Verify** PRD created
   - Expected: New PRD in PRD list

5. **Navigate** to PRD view
   - Expected: Exported PRD visible

### Expected Outcome
- GSD exported as Ralph PRD format

---

## Test: Phase 7 - Export Options

### Description
Verify export format options.

### Steps
1. **Navigate** to export phase
   - Expected: Export options visible

2. **Verify** format options
   - Expected: PRD, Markdown, JSON available

3. **Select** different format
   - Expected: Format selected

4. **Click** export
   - Expected: Export in chosen format

### Expected Outcome
- Multiple export formats available

---

## Test: Phase 8 - Workflow Completion

### Description
Verify completing the GSD workflow.

### Steps
1. **Navigate** to GSD completion phase
   - Expected: Completion view loads

2. **Verify** summary displayed
   - Expected: Workflow summary shown

3. **Verify** all phases completed
   - Expected: All phases marked done

4. **Click** "Complete Workflow" button
   - Expected: Workflow marked complete

5. **Verify** completion status
   - Expected: GSD session shows complete

### Expected Outcome
- GSD workflow completes successfully

---

## Test: GSD Session Persistence

### Description
Verify GSD state persists across sessions.

### Steps
1. **Navigate** to in-progress GSD session
   - Expected: Session loads

2. **Note** current phase and data
   - Expected: State visible

3. **Refresh** page or close/reopen
   - Expected: Page reloads

4. **Verify** GSD state preserved
   - Expected: Same phase and data

### Expected Outcome
- GSD progress persists across browser sessions

---

## Test: Navigate Between GSD Phases

### Description
Verify phase navigation.

### Steps
1. **Navigate** to GSD session
   - Expected: GSD view loads

2. **Click** phase indicator or nav
   - Expected: Phase navigation available

3. **Navigate** to previous phase
   - Expected: Previous phase loads

4. **Navigate** to next phase
   - Expected: Next phase loads

5. **Verify** phase data preserved
   - Expected: Data intact in each phase

### Expected Outcome
- Can navigate between GSD phases freely

---

## Test: GSD Progress Indicator

### Description
Verify progress tracking across phases.

### Steps
1. **Navigate** to GSD session
   - Expected: Session loads

2. **Verify** progress indicator visible
   - Expected: Shows current phase

3. **Complete** a phase
   - Expected: Progress updates

4. **Verify** completed phases marked
   - Expected: Visual indicator of completion

### Expected Outcome
- Progress indicator accurately tracks phases

---

## Test: Exit GSD Mid-Workflow

### Description
Verify exiting and returning to GSD.

### Steps
1. **Navigate** to GSD session in progress
   - Expected: Mid-workflow

2. **Navigate** away from GSD
   - Expected: Leave GSD view

3. **Return** to GSD session
   - Expected: GSD resumes

4. **Verify** state preserved
   - Expected: Same progress as before

### Expected Outcome
- Can exit and return to GSD without losing progress

---

## Test: GSD with Existing PRD

### Description
Verify starting GSD from existing PRD.

### Steps
1. **Navigate** to PRD list
   - Expected: PRDs visible

2. **Click** "Refine with GSD" on a PRD
   - Expected: GSD starts with PRD data

3. **Verify** requirements pre-populated
   - Expected: PRD requirements loaded

4. **Continue** GSD workflow
   - Expected: Can proceed through phases

### Expected Outcome
- GSD can refine existing PRD

---

## Test: GSD Chat Context

### Description
Verify chat maintains context through phases.

### Steps
1. **Navigate** to questioning phase
   - Expected: Chat visible

2. **Answer** questions with specific details
   - Expected: Details captured

3. **Proceed** to research phase
   - Expected: Research starts

4. **Verify** research uses chat context
   - Expected: Research topics reflect chat

### Expected Outcome
- Chat context informs subsequent phases

---

## Test: GSD Research Configuration

### Description
Verify configuring research agents.

### Steps
1. **Navigate** to research phase
   - Expected: Research view loads

2. **Verify** research configuration options
   - Expected: Agent settings available

3. **Modify** research scope/topics
   - Expected: Topics editable

4. **Start** research with custom config
   - Expected: Research runs with settings

### Expected Outcome
- Research phase can be configured

---

## Test: GSD Requirements Prioritization

### Description
Verify prioritizing requirements.

### Steps
1. **Navigate** to requirements phase
   - Expected: Requirements visible

2. **Set** priority on a requirement
   - Expected: Priority selector available

3. **Select** priority level (High/Medium/Low)
   - Expected: Priority set

4. **Verify** priority displayed
   - Expected: Priority indicator shown

5. **Sort** by priority
   - Expected: Requirements ordered

### Expected Outcome
- Requirements can be prioritized

---

## Test: GSD Session List

### Description
Verify listing all GSD sessions.

### Steps
1. **Navigate** to GSD sessions list
   - Expected: List loads

2. **Verify** sessions displayed
   - Expected: GSD sessions visible

3. **Verify** session status shown
   - Expected: In-progress/complete status

4. **Click** on a session
   - Expected: Session opens

### Expected Outcome
- GSD sessions are listed and accessible
