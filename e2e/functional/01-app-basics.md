# Test Suite: App Basics

## Overview
Basic application tests verifying core functionality, page structure, and accessibility features.

## Preconditions
- Application running at http://localhost:1420

---

## Test: Page Title

### Description
Verify the application has the correct page title.

### Steps
1. **Navigate** to http://localhost:1420
   - Expected: Page loads successfully

2. **Verify** page title
   - Expected: Title contains "Ralph UI"

### Expected Outcome
- Page title includes "Ralph UI"

---

## Test: Main Content Area Visible

### Description
Verify the main content area is visible and properly rendered.

### Steps
1. **Navigate** to http://localhost:1420
   - Expected: Page loads successfully

2. **Verify** main content area exists
   - Selector: `main` or `[role="main"]`
   - Expected: Element is visible

3. **Verify** content is not empty
   - Expected: Main area contains child elements

### Expected Outcome
- Main content area is visible and contains content

---

## Test: Sidebar Navigation Exists

### Description
Verify the sidebar navigation is present with expected links.

### Steps
1. **Navigate** to http://localhost:1420
   - Expected: Page loads successfully

2. **Verify** sidebar exists
   - Selector: `nav` or `[role="navigation"]` in sidebar area
   - Expected: Navigation element is visible

3. **Verify** navigation contains links
   - Expected: At least one navigation link is present

4. **Verify** Dashboard link exists
   - Expected: Link to dashboard/home is present

### Expected Outcome
- Sidebar navigation is visible with functional links

---

## Test: Skip Link Functionality

### Description
Verify the skip link works for keyboard accessibility.

### Steps
1. **Navigate** to http://localhost:1420
   - Expected: Page loads successfully

2. **Press** Tab key to focus first element
   - Expected: Skip link becomes visible or receives focus

3. **Verify** skip link target
   - Expected: Skip link points to main content area

4. **Activate** skip link (if visible)
   - Expected: Focus moves to main content

### Expected Outcome
- Skip link is accessible and functional for keyboard navigation
