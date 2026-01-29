# AI-Powered Idea Generation Workflow

## Test: Blank Page Flow

**Given** a new GSD session
**When** I navigate to the Deep Questioning phase
**And** I click the "AI Idea Generation" button
**Then** I should see the Idea Generation Modal

**Given** the Idea Generation Modal is open
**When** I select the "Generate" tab
**And** I select 2-3 interest categories (e.g., "AI/Machine Learning", "Developer Tools")
**And** I click "Generate 5 Ideas"
**Then** I should see:
- A loading state while generating
- 5 idea cards displayed in a grid
- Each card has a title, summary, and features
- Each card has a "Use This Idea" button

**Given** 5 ideas have been generated
**When** I click "Use This Idea" on any idea
**Then** I should be navigated to the "Validate" tab
**And** the selected idea should be highlighted
**And** feasibility and market analysis should begin automatically

## Test: Vague Notion Variations

**Given** the Idea Generation Modal is open
**When** I select the "Generate" tab
**And** I select the "Variations" sub-tab
**And** I enter a vague concept: "Something like Trello but for remote teams"
**And** I select 2 dimensions to vary: "Target User" and "Business Model"
**And** I click "Generate Variations"
**Then** I should see:
- 3 variation ideas generated
- Each variation has a different angle on the concept
- A badge showing which dimensions were varied

**Given** 3 variations have been generated
**When** I click "Compare Ideas"
**Then** I should see:
- Side-by-side comparison of the 3 ideas
- Feature comparison table
- Tech stack comparison
- Mix-and-match feature selection

## Test: Market Analysis

**Given** I'm in the "Validate" tab with a selected idea
**When** the market analysis completes
**Then** I should see:
- TAM (Total Addressable Market) estimate
- SAM (Serviceable Addressable Market) estimate
- Target user count
- Competition level badge (Low/Medium/High)
- Monetization potential badge (Low/Medium/High)
- List of 3-5 key competitors with strengths/weaknesses
- Market gaps/opportunities section

## Test: Feasibility Validation

**Given** I'm in the "Validate" tab with a selected idea
**When** the feasibility analysis completes
**Then** I should see:
- Feasibility score (0-100) with color coding
  - 70+ = green (Highly Feasible)
  - 40-70 = yellow (Moderately Feasible)
  - <40 = red (Challenging)
- Complexity level badge (Low/Medium/High)
- Time estimates for MVP, V1, V2 (in weeks)
- Required skills list
- Risk factors with mitigation strategies

**Given** the feasibility score is below 70
**When** I view the feasibility panel
**Then** I should see:
- A "Simplified MVP Available" section
- The simplified idea title and summary
- A "Use Simplified" button

**When** I click "Use Simplified"
**Then** the idea should be replaced with the simplified version
**And** the feasibility score should be 70+

## Test: Domain Exploration

**Given** the Idea Generation Modal is open
**When** I select the "Explore" tab
**And** I enter a domain: "Developer Tools"
**And** I add 2 specific interests: "Testing", "Documentation"
**And** I click "Generate 5 Ideas"
**Then** I should see:
- 5 ideas related to developer tools
- Ideas focused on testing and documentation
- Each idea has a unique angle within the domain

## Test: Context Auto-Population

**Given** I've selected an idea in the Idea Generation Modal
**When** I click "Use This Idea" in the Validate tab
**Then** the modal should close
**And** the Deep Questioning context should be auto-populated with:
- "What" field filled with the idea's description
- "Why" field filled with the motivation
- "Who" field filled with target users
- "Done" field filled with success criteria
**And** a success message should appear in the chat

## Test: Mobile Responsive

**Given** I'm on a mobile viewport (320px - 768px)
**When** I open the Idea Generation Modal
**Then** the modal should be full-screen
**And** tabs should be stacked vertically
**And** idea cards should be in a single column
**And** all buttons should be tappable (minimum 44px height)

## Test: Error Handling

**Given** the Idea Generation Modal is open
**When** I try to generate ideas without selecting interests
**Then** the "Generate" button should be disabled

**Given** idea generation is in progress
**When** the backend returns an error
**Then** I should see an error message displayed
**And** I should be able to retry

## Test: Keyboard Navigation

**Given** the Idea Generation Modal is open with generated ideas
**When** I press Tab
**Then** focus should move to the next interactive element

**When** I press Enter on a focused "Use This Idea" button
**Then** the idea should be selected

**When** I press Escape
**Then** the modal should close

## Test: Compare View

**Given** I have 2-3 ideas generated
**When** I click "Compare Ideas"
**Then** I should see:
- All ideas displayed side-by-side in cards
- Feature comparison showing which ideas have which features
- Tech stack comparison
- Badge indicating "Best Match" on the first idea
- "Select This Idea" button on each card
- Mix-and-match section at the bottom

**Given** I'm in the Compare view
**When** I click on features in the mix-and-match section
**Then** selected features should be highlighted
**And** a "Create Custom Idea" button should appear with the count

## Test: State Persistence

**Given** I've generated ideas in the modal
**When** I close and reopen the modal
**Then** the state should be reset (no previous ideas shown)

**Given** I've selected an idea and navigated to Validate tab
**When** I go back to Generate tab
**Then** the selected idea should still be indicated
