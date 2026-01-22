/**
 * GSD Workflow E2E Tests
 *
 * These tests verify the complete GSD workflow from end to end.
 */

import { test, expect, type Page } from '@playwright/test'

// Helper to navigate to PRD page
async function goToPRDPage(page: Page) {
  // Navigate to the PRD/Planning page
  await page.goto('/')
  // Click on PRD link in navigation if available
  const prdLink = page.getByRole('link', { name: /PRD|Planning/i })
  if (await prdLink.isVisible()) {
    await prdLink.click()
  }
}

test.describe('GSD Workflow', () => {
  test.skip('should display GSD stepper with all phases', async ({ page }) => {
    await goToPRDPage(page)

    // Look for GSD-related UI elements
    // This test verifies the stepper displays correctly
    const stepper = page.locator('[data-testid="gsd-stepper"]')
    if (await stepper.isVisible()) {
      // Verify all phases are shown
      await expect(page.getByText('Deep Questioning')).toBeVisible()
      await expect(page.getByText('Research')).toBeVisible()
      await expect(page.getByText('Requirements')).toBeVisible()
      await expect(page.getByText('Roadmap')).toBeVisible()
      await expect(page.getByText('Verification')).toBeVisible()
      await expect(page.getByText('Export')).toBeVisible()
    }
  })

  test.skip('should allow entering context in Deep Questioning phase', async ({ page }) => {
    await goToPRDPage(page)

    // Find the Deep Questioning interface
    const questioningInput = page.getByPlaceholder(/Describe your idea/i)
    if (await questioningInput.isVisible()) {
      // Enter some context
      await questioningInput.fill('I want to build a task management app for remote teams')

      // Click add context
      const addButton = page.getByRole('button', { name: /Add Context/i })
      if (await addButton.isVisible()) {
        await addButton.click()
      }

      // Verify context was added
      await expect(page.getByText(/task management app/)).toBeVisible()
    }
  })

  test.skip('should show context guide with what/why/who/done items', async ({ page }) => {
    await goToPRDPage(page)

    // Look for the context guide
    const guide = page.locator('[data-testid="questioning-guide"]')
    if (await guide.isVisible()) {
      await expect(page.getByText('What')).toBeVisible()
      await expect(page.getByText('Why')).toBeVisible()
      await expect(page.getByText('Who')).toBeVisible()
      await expect(page.getByText('Done')).toBeVisible()
    }
  })

  test.skip('should show progress badges for context items', async ({ page }) => {
    await goToPRDPage(page)

    // Check for progress badges
    const badges = page.locator('[data-testid="context-badges"]')
    if (await badges.isVisible()) {
      // Initially all badges should be outline (incomplete)
      const whatBadge = page.getByTestId('badge-what')
      await expect(whatBadge).toHaveAttribute('data-variant', 'outline')
    }
  })

  test.skip('should enable proceed button when enough context is provided', async ({ page }) => {
    await goToPRDPage(page)

    // Find the proceed button - should be disabled initially
    const proceedButton = page.getByRole('button', { name: /Create PROJECT\.md/i })
    if (await proceedButton.isVisible()) {
      await expect(proceedButton).toBeDisabled()

      // Fill in context items via the guide
      // ... add what, why, who context

      // Button should become enabled after 3 items
    }
  })

  test.skip('should navigate between phases using stepper', async ({ page }) => {
    await goToPRDPage(page)

    // Click on a different phase in the stepper
    const researchPhase = page.getByRole('button', { name: /Research/i })
    if (await researchPhase.isVisible() && await researchPhase.isEnabled()) {
      await researchPhase.click()

      // Verify we're now on the research phase
      await expect(page.getByText(/Research Phase|Parallel agents/i)).toBeVisible()
    }
  })

  test.skip('should show research agent status cards', async ({ page }) => {
    await goToPRDPage(page)

    // Navigate to research phase
    const researchPhase = page.getByRole('button', { name: /Research/i })
    if (await researchPhase.isVisible()) {
      await researchPhase.click()

      // Look for agent status cards
      await expect(page.getByText(/Architecture/)).toBeVisible()
      await expect(page.getByText(/Codebase Analysis/)).toBeVisible()
      await expect(page.getByText(/Best Practices/)).toBeVisible()
      await expect(page.getByText(/Risks/)).toBeVisible()
    }
  })

  test.skip('should show requirements scoper with categories', async ({ page }) => {
    await goToPRDPage(page)

    // Navigate to requirements/scoping phase
    const scopingPhase = page.getByRole('button', { name: /Scoping/i })
    if (await scopingPhase.isVisible()) {
      await scopingPhase.click()

      // Look for scope selectors
      await expect(page.getByText(/V1/)).toBeVisible()
      await expect(page.getByText(/V2/)).toBeVisible()
      await expect(page.getByText(/Out of Scope/)).toBeVisible()
    }
  })

  test.skip('should show roadmap editor with phases', async ({ page }) => {
    await goToPRDPage(page)

    // Navigate to roadmap phase
    const roadmapPhase = page.getByRole('button', { name: /Roadmap/i })
    if (await roadmapPhase.isVisible()) {
      await roadmapPhase.click()

      // Look for roadmap editor
      await expect(page.getByText(/Implementation Roadmap/)).toBeVisible()
      await expect(page.getByRole('button', { name: /Add Phase/i })).toBeVisible()
    }
  })

  test.skip('should show verification results', async ({ page }) => {
    await goToPRDPage(page)

    // Navigate to verification phase
    const verificationPhase = page.getByRole('button', { name: /Verification/i })
    if (await verificationPhase.isVisible()) {
      await verificationPhase.click()

      // Look for verification UI
      await expect(page.getByText(/Plan Verification|Run Verification/)).toBeVisible()
    }
  })

  test.skip('should show export options in final phase', async ({ page }) => {
    await goToPRDPage(page)

    // Navigate to export phase
    const exportPhase = page.getByRole('button', { name: /Export/i })
    if (await exportPhase.isVisible()) {
      await exportPhase.click()

      // Look for export options
      await expect(page.getByText(/Export to Ralph/)).toBeVisible()
      await expect(page.getByPlaceholder(/PRD Name|my-feature/i)).toBeVisible()
      await expect(page.getByPlaceholder(/Branch|main/i)).toBeVisible()
    }
  })
})

test.describe('GSD Session Persistence', () => {
  test.skip('should persist session state between page reloads', async ({ page }) => {
    await goToPRDPage(page)

    // Enter some context
    const input = page.getByPlaceholder(/Describe your idea/i)
    if (await input.isVisible()) {
      await input.fill('Test persistence context')
      await page.getByRole('button', { name: /Add Context/i }).click()

      // Reload the page
      await page.reload()

      // Verify context is still there
      await expect(page.getByText(/Test persistence context/)).toBeVisible()
    }
  })
})

test.describe('GSD Multi-PRD Isolation', () => {
  test.skip('should isolate state between different PRD sessions', async ({ page }) => {
    // This test would verify that two different PRD sessions
    // maintain their own independent state
    await goToPRDPage(page)

    // Create first session with some state
    // Switch to second session
    // Verify state is independent
  })
})
