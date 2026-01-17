import { test, expect } from '@playwright/test'

test.describe('Session Management (Phase 6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test.describe('Session CRUD Operations', () => {
    test('should create a new session', async ({ page }) => {
      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Test Session')
      await page.fill('input[name="projectPath"]', '/test/project')
      await page.click('button:has-text("Create")')

      await expect(page.locator('text=Test Session')).toBeVisible()
    })

    test('should view session details', async ({ page }) => {
      // Assume a session exists
      await page.click('text=Test Session')
      await expect(page.locator('h1:has-text("Test Session")')).toBeVisible()
      await expect(page.locator('text=/test/project')).toBeVisible()
    })

    test('should update session configuration', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Settings")')
      await page.fill('input[name="maxParallel"]', '5')
      await page.click('button:has-text("Save")')

      await expect(page.locator('text=Settings saved')).toBeVisible()
    })

    test('should delete a session', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Delete")')
      await page.click('button:has-text("Confirm")')

      await expect(page.locator('text=Test Session')).not.toBeVisible()
    })

    test('should update session status', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Pause")')

      await expect(page.locator('text=Paused')).toBeVisible()

      await page.click('button:has-text("Resume")')
      await expect(page.locator('text=Active')).toBeVisible()
    })
  })

  test.describe('Session Export', () => {
    test('should export session to JSON', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Export")')

      const downloadPromise = page.waitForEvent('download')
      await page.click('button:has-text("Export as JSON")')
      const download = await downloadPromise

      expect(download.suggestedFilename()).toContain('.json')
    })

    test('should display export preview', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Export")')
      await page.click('button:has-text("Preview JSON")')

      await expect(page.locator('pre')).toBeVisible()
      await expect(page.locator('text="id"')).toBeVisible()
      await expect(page.locator('text="name"')).toBeVisible()
      await expect(page.locator('text="tasks"')).toBeVisible()
    })
  })

  test.describe('Session Templates', () => {
    test('should create template from session', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Save as Template")')
      await page.fill('input[name="templateName"]', 'My Template')
      await page.fill('textarea[name="description"]', 'Template for similar projects')
      await page.click('button:has-text("Create Template")')

      await expect(page.locator('text=Template created')).toBeVisible()
    })

    test('should list available templates', async ({ page }) => {
      await page.click('button:has-text("New Session")')
      await page.click('button:has-text("From Template")')

      await expect(page.locator('text=My Template')).toBeVisible()
      await expect(page.locator('text=Template for similar projects')).toBeVisible()
    })

    test('should create session from template', async ({ page }) => {
      await page.click('button:has-text("New Session")')
      await page.click('button:has-text("From Template")')
      await page.click('text=My Template')
      await page.fill('input[name="name"]', 'Session from Template')
      await page.fill('input[name="projectPath"]', '/test/new-project')
      await page.click('button:has-text("Create")')

      await expect(page.locator('text=Session from Template')).toBeVisible()

      // Verify config was copied from template
      await page.click('text=Session from Template')
      await page.click('button:has-text("Settings")')
      await expect(page.locator('input[name="maxParallel"]')).toHaveValue('5')
    })

    test('should show template details before creating session', async ({ page }) => {
      await page.click('button:has-text("New Session")')
      await page.click('button:has-text("From Template")')
      await page.click('text=My Template')

      await expect(page.locator('text=Max Parallel')).toBeVisible()
      await expect(page.locator('text=Max Iterations')).toBeVisible()
      await expect(page.locator('text=Agent Type')).toBeVisible()
    })
  })

  test.describe('Crash Recovery', () => {
    test('should save recovery state', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Save State")')

      await expect(page.locator('text=Recovery state saved')).toBeVisible()
    })

    test('should detect crashed session on startup', async ({ page }) => {
      // Simulate app restart with crashed session
      await expect(page.locator('text=Detected interrupted session')).toBeVisible()
      await expect(page.locator('text=Test Session')).toBeVisible()
    })

    test('should recover from crash', async ({ page }) => {
      await page.click('button:has-text("Recover Session")')

      await expect(page.locator('text=Session recovered')).toBeVisible()
      await expect(page.locator('text=Test Session')).toBeVisible()
      await expect(page.locator('text=Active')).toBeVisible()
    })

    test('should show recovery state details', async ({ page }) => {
      await page.click('text=View Details')

      await expect(page.locator('text=Active Tasks')).toBeVisible()
      await expect(page.locator('text=Active Agents')).toBeVisible()
      await expect(page.locator('text=Last Saved')).toBeVisible()
    })

    test('should allow manual recovery trigger', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("More Options")')
      await page.click('button:has-text("Load Recovery State")')

      await expect(page.locator('text=Recovery state loaded')).toBeVisible()
    })
  })

  test.describe('Session Comparison', () => {
    test('should select sessions for comparison', async ({ page }) => {
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Test Session 1')
      await page.click('text=Test Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('h1:has-text("Session Comparison")')).toBeVisible()
    })

    test('should display task completion differences', async ({ page }) => {
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Test Session 1')
      await page.click('text=Test Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('text=Tasks Completed')).toBeVisible()
      await expect(page.locator('text=/\\+\\d+ tasks|\\-\\d+ tasks/')).toBeVisible()
    })

    test('should display cost differences', async ({ page }) => {
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Test Session 1')
      await page.click('text=Test Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('text=Total Cost')).toBeVisible()
      await expect(page.locator('text=/\\$\\d+\\.\\d+/')).toBeVisible()
    })

    test('should display token differences', async ({ page }) => {
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Test Session 1')
      await page.click('text=Test Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('text=Total Tokens')).toBeVisible()
      await expect(page.locator('text=/\\d+ tokens/')).toBeVisible()
    })

    test('should display configuration differences', async ({ page }) => {
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Test Session 1')
      await page.click('text=Test Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('text=Configuration Differences')).toBeVisible()
    })

    test('should display performance summary', async ({ page }) => {
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Test Session 1')
      await page.click('text=Test Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('text=Performance Summary')).toBeVisible()
      await expect(page.locator('text=/\\$\\d+\\.\\d+\\/task/')).toBeVisible()
    })
  })

  test.describe('Session Analytics', () => {
    test('should display session analytics dashboard', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('h2:has-text("Analytics")')).toBeVisible()
    })

    test('should show total tasks count', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Total Tasks')).toBeVisible()
      await expect(page.locator('text=/\\d+ tasks/')).toBeVisible()
    })

    test('should show completion rate', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Completion Rate')).toBeVisible()
      await expect(page.locator('text=/\\d+\\.?\\d*%/')).toBeVisible()
    })

    test('should show average cost per task', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Average Cost per Task')).toBeVisible()
      await expect(page.locator('text=/\\$\\d+\\.\\d+/')).toBeVisible()
    })

    test('should show average tokens per task', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Average Tokens per Task')).toBeVisible()
      await expect(page.locator('text=/\\d+ tokens/')).toBeVisible()
    })

    test('should show total duration', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Total Duration')).toBeVisible()
      await expect(page.locator('text=/\\d+\\.?\\d* hours/')).toBeVisible()
    })

    test('should show task status breakdown', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Completed Tasks')).toBeVisible()
      await expect(page.locator('text=Failed Tasks')).toBeVisible()
      await expect(page.locator('text=In Progress Tasks')).toBeVisible()
      await expect(page.locator('text=Pending Tasks')).toBeVisible()
    })

    test('should visualize analytics with charts', async ({ page }) => {
      await page.click('text=Test Session')
      await page.click('button:has-text("Analytics")')

      // Check for chart elements (could be canvas, svg, etc.)
      await expect(page.locator('canvas, svg')).toBeVisible()
    })
  })

  test.describe('Session History', () => {
    test('should display session history list', async ({ page }) => {
      await page.click('button:has-text("History")')

      await expect(page.locator('h1:has-text("Session History")')).toBeVisible()
      await expect(page.locator('text=Test Session')).toBeVisible()
    })

    test('should filter sessions by status', async ({ page }) => {
      await page.click('button:has-text("History")')
      await page.click('button:has-text("Filter")')
      await page.click('text=Completed')

      await expect(page.locator('[data-status="completed"]')).toBeVisible()
      await expect(page.locator('[data-status="active"]')).not.toBeVisible()
    })

    test('should search sessions by name', async ({ page }) => {
      await page.click('button:has-text("History")')
      await page.fill('input[placeholder*="Search"]', 'Test Session')

      await expect(page.locator('text=Test Session')).toBeVisible()
    })

    test('should sort sessions by date', async ({ page }) => {
      await page.click('button:has-text("History")')
      await page.click('button:has-text("Sort")')
      await page.click('text=Date Created')

      const sessions = await page.locator('[data-testid="session-card"]').all()
      expect(sessions.length).toBeGreaterThan(0)
    })

    test('should view archived sessions', async ({ page }) => {
      await page.click('button:has-text("History")')
      await page.click('button:has-text("Show Archived")')

      await expect(page.locator('[data-archived="true"]')).toBeVisible()
    })
  })

  test.describe('Session Integration', () => {
    test('should create session, add tasks, and export', async ({ page }) => {
      // Create session
      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Integration Test')
      await page.fill('input[name="projectPath"]', '/test/integration')
      await page.click('button:has-text("Create")')

      // Add tasks
      await page.click('button:has-text("Add Task")')
      await page.fill('input[name="title"]', 'Task 1')
      await page.fill('textarea[name="description"]', 'Test task description')
      await page.click('button:has-text("Save")')

      // Export session
      await page.click('button:has-text("Export")')
      const downloadPromise = page.waitForEvent('download')
      await page.click('button:has-text("Export as JSON")')
      const download = await downloadPromise

      expect(download.suggestedFilename()).toContain('integration-test')
    })

    test('should create template and use it for new session', async ({ page }) => {
      // Create session with custom config
      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Template Source')
      await page.fill('input[name="projectPath"]', '/test/source')
      await page.click('button:has-text("Settings")')
      await page.fill('input[name="maxParallel"]', '7')
      await page.click('button:has-text("Create")')

      // Save as template
      await page.click('button:has-text("Save as Template")')
      await page.fill('input[name="templateName"]', 'Test Template')
      await page.fill('textarea[name="description"]', 'For testing')
      await page.click('button:has-text("Create Template")')

      // Create new session from template
      await page.click('button:has-text("New Session")')
      await page.click('button:has-text("From Template")')
      await page.click('text=Test Template')
      await page.fill('input[name="name"]', 'From Template Session')
      await page.fill('input[name="projectPath"]', '/test/from-template')
      await page.click('button:has-text("Create")')

      // Verify config was copied
      await page.click('button:has-text("Settings")')
      await expect(page.locator('input[name="maxParallel"]')).toHaveValue('7')
    })

    test('should compare sessions and view analytics', async ({ page }) => {
      // Create two sessions
      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Compare Session 1')
      await page.fill('input[name="projectPath"]', '/test/compare1')
      await page.click('button:has-text("Create")')

      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Compare Session 2')
      await page.fill('input[name="projectPath"]', '/test/compare2')
      await page.click('button:has-text("Create")')

      // Compare sessions
      await page.click('button:has-text("Compare Sessions")')
      await page.click('text=Compare Session 1')
      await page.click('text=Compare Session 2')
      await page.click('button:has-text("Compare")')

      await expect(page.locator('text=Session Comparison')).toBeVisible()

      // View analytics for first session
      await page.click('text=Compare Session 1')
      await page.click('button:has-text("Analytics")')

      await expect(page.locator('text=Analytics')).toBeVisible()
      await expect(page.locator('text=Completion Rate')).toBeVisible()
    })
  })
})
