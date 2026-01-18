import { test, expect } from '@playwright/test'
import { writeFileSync } from 'fs'
import { join } from 'path'

test.describe('Task Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await page.waitForLoadState('networkidle')
  })

  test('should display empty state when no session selected', async ({ page }) => {
    // Navigate to tasks page
    await page.click('text=Tasks')

    // Should show "No Session Selected" message
    await expect(page.locator('text=No Session Selected')).toBeVisible()
  })

  test('should create session and import PRD', async ({ page }) => {
    // Create a session first
    await page.click('text=Sessions')
    await page.click('text=New Session')

    await page.fill('[placeholder*="Session name"]', 'Test Session')
    await page.fill('[placeholder*="Project path"]', '/test/path')
    await page.click('button:has-text("Create")')

    // Navigate to tasks
    await page.click('text=Tasks')

    // Should now show tasks page with session name
    await expect(page.locator('text=Manage tasks for session: Test Session')).toBeVisible()

    // Should show "Import PRD" button
    await expect(page.locator('button:has-text("Import PRD")')).toBeVisible()
  })

  test('should import PRD and display tasks', async ({ page }) => {
    // Setup: Create session
    await page.click('text=Sessions')
    await page.click('text=New Session')
    await page.fill('[placeholder*="Session name"]', 'PRD Test Session')
    await page.fill('[placeholder*="Project path"]', '/test/path')
    await page.click('button:has-text("Create")')

    // Navigate to tasks
    await page.click('text=Tasks')

    // Click Import PRD button
    await page.click('button:has-text("Import PRD")')

    // Should show import dialog
    await expect(page.locator('text=Import PRD')).toBeVisible()

    // Create a test PRD file
    const prdContent = JSON.stringify({
      title: 'Test Project',
      description: 'A test project',
      tasks: [
        {
          title: 'Task 1',
          description: 'First task',
          priority: 1,
          dependencies: [],
          tags: ['feature'],
          estimated_tokens: 1000,
        },
        {
          title: 'Task 2',
          description: 'Second task',
          priority: 2,
          dependencies: ['task-1'],
          tags: ['bugfix'],
          estimated_tokens: 500,
        },
      ],
    })

    // Upload file (mock file upload)
    const fileInput = await page.locator('input[type="file"]')

    // Create a temporary file for testing
    const testFilePath = join(process.cwd(), 'test-prd.json')
    writeFileSync(testFilePath, prdContent)

    await fileInput.setInputFiles(testFilePath)

    // Click Import Tasks button
    await page.click('button:has-text("Import Tasks")')

    // Wait for import to complete
    await page.waitForTimeout(1000)

    // Should show tasks in the list
    await expect(page.locator('text=Task 1')).toBeVisible()
    await expect(page.locator('text=Task 2')).toBeVisible()
  })

  test('should filter tasks by status', async ({ page }) => {
    // Assuming we have tasks already loaded
    await page.click('text=Tasks')

    // Select status filter
    const statusFilter = page.locator('select').first()
    await statusFilter.selectOption('Completed')

    // Should only show completed tasks
    // Verify that pending tasks are not visible
    await expect(page.locator('text=Pending')).not.toBeVisible()
  })

  test('should search tasks', async ({ page }) => {
    await page.click('text=Tasks')

    // Type in search box
    await page.fill('[placeholder="Search tasks..."]', 'Task 1')

    // Should filter tasks based on search
    await expect(page.locator('text=Task 1')).toBeVisible()
    await expect(page.locator('text=Task 2')).not.toBeVisible()
  })

  test('should open task detail view', async ({ page }) => {
    await page.click('text=Tasks')

    // Click on a task
    await page.click('text=Task 1')

    // Should open task detail dialog
    await expect(page.locator('text=Task Details and Management')).toBeVisible()
    await expect(page.locator('text=First task')).toBeVisible()
  })

  test('should edit task details', async ({ page }) => {
    await page.click('text=Tasks')

    // Open task detail
    await page.click('text=Task 1')

    // Click Edit button
    await page.click('button:has-text("Edit Task")')

    // Should show edit form
    await expect(page.locator('button:has-text("Save Changes")')).toBeVisible()

    // Edit title
    const titleInput = page.locator('input[value="Task 1"]')
    await titleInput.fill('Updated Task 1')

    // Save changes
    await page.click('button:has-text("Save Changes")')

    // Should see success
    await page.waitForTimeout(500)
    await expect(page.locator('text=Updated Task 1')).toBeVisible()
  })

  test('should show dependency graph', async ({ page }) => {
    await page.click('text=Tasks')

    // Click Show Graph button
    await page.click('button:has-text("Show Graph")')

    // Should display dependency graph
    await expect(page.locator('text=Dependency Graph')).toBeVisible()
    await expect(page.locator('text=Visual representation of task dependencies')).toBeVisible()

    // Hide graph
    await page.click('button:has-text("Hide Graph")')
    await expect(page.locator('text=Dependency Graph')).not.toBeVisible()
  })

  test('should display task statistics', async ({ page }) => {
    await page.click('text=Tasks')

    // Should show statistics cards
    await expect(page.locator('text=Total Tasks')).toBeVisible()
    await expect(page.locator('text=Pending')).toBeVisible()
    await expect(page.locator('text=In Progress')).toBeVisible()
    await expect(page.locator('text=Completed')).toBeVisible()
  })

  test('should sort tasks by priority', async ({ page }) => {
    await page.click('text=Tasks')

    // Select sort option
    const sortSelect = page.locator('select').nth(1) // Second select is sort by
    await sortSelect.selectOption('priority')

    // Select sort order
    const orderSelect = page.locator('select').nth(2)
    await orderSelect.selectOption('desc')

    // Tasks should be reordered (verify by checking order of P1, P2, etc.)
    const tasks = await page.locator('[class*="badge"]').allTextContents()
    expect(tasks).toContain('P1')
    expect(tasks).toContain('P2')
  })

  test('should handle PRD import error', async ({ page }) => {
    await page.click('text=Tasks')
    await page.click('button:has-text("Import PRD")')

    // Upload invalid file
    const invalidContent = 'invalid json content'
    const testFilePath = join(process.cwd(), 'invalid-prd.json')
    writeFileSync(testFilePath, invalidContent)

    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles(testFilePath)

    await page.click('button:has-text("Import Tasks")')

    // Should show error message
    await expect(page.locator('text=Failed to parse')).toBeVisible({ timeout: 5000 })
  })

  test('should update task status', async ({ page }) => {
    await page.click('text=Tasks')

    // Open task detail
    await page.click('text=Task 1')

    // Edit task
    await page.click('button:has-text("Edit Task")')

    // Change status
    const statusSelect = page.locator('select[value="Pending"]')
    await statusSelect.selectOption('InProgress')

    // Should update status (handled by separate status update API)
    await page.waitForTimeout(500)
  })
})
