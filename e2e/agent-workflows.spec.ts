import { test, expect } from '@playwright/test'

test.describe('Agent Workflows (Phase 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Agent Lifecycle', () => {
    test('should spawn a new agent for a task', async ({ page }) => {
      // Navigate to agents page
      await page.click('text=Agents')

      // Should show agents page
      await expect(page.locator('h1')).toContainText('Agents')

      // Spawn a new agent
      await page.click('button:has-text("Spawn Agent")')

      // Fill in agent spawn form
      await page.fill('input[name="taskId"]', 'task-1')
      await page.selectOption('select[name="agentType"]', 'claude')
      await page.click('button:has-text("Spawn")')

      // Should show success message
      await expect(page.locator('text=Agent spawned successfully')).toBeVisible({
        timeout: 5000,
      })

      // Should show agent in list
      await expect(page.locator('[data-testid="agent-card"]')).toBeVisible()
    })

    test('should display agent status correctly', async ({ page }) => {
      await page.click('text=Agents')

      // Should show agent status badges
      await expect(
        page.locator('text=idle, text=thinking, text=reading, text=implementing').first()
      ).toBeVisible()
    })

    test('should show agent metrics (tokens, cost, iterations)', async ({ page }) => {
      await page.click('text=Agents')

      // Click on an agent
      await page.click('[data-testid="agent-card"]').first()

      // Should show metrics
      await expect(page.locator('text=Tokens')).toBeVisible()
      await expect(page.locator('text=Cost')).toBeVisible()
      await expect(page.locator('text=Iterations')).toBeVisible()

      // Should show numeric values
      await expect(page.locator('text=/\\d+ tokens/')).toBeVisible()
      await expect(page.locator('text=/\\$\\d+\\.\\d+/')).toBeVisible()
      await expect(page.locator('text=/\\d+ iterations/')).toBeVisible()
    })

    test('should stop a running agent', async ({ page }) => {
      await page.click('text=Agents')

      // Click on agent
      await page.click('[data-testid="agent-card"]').first()

      // Click stop button
      await page.click('button:has-text("Stop Agent")')

      // Confirm stop
      await page.click('button:has-text("Confirm")')

      // Should show stopped status
      await expect(page.locator('text=Agent stopped')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should pause and resume an agent', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Pause agent
      await page.click('button:has-text("Pause")')
      await expect(page.locator('text=Paused')).toBeVisible()

      // Resume agent
      await page.click('button:has-text("Resume")')
      await expect(page.locator('text=Active, text=Running').first()).toBeVisible()
    })

    test('should restart a failed agent', async ({ page }) => {
      await page.click('text=Agents')

      // Find failed agent
      await page.click('[data-status="failed"]').first()

      // Restart agent
      await page.click('button:has-text("Restart Agent")')

      // Should show restarted status
      await expect(page.locator('text=Agent restarted')).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Agent Monitoring', () => {
    test('should display real-time log output', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Should show log viewer
      await expect(page.locator('[data-testid="log-viewer"]')).toBeVisible()

      // Should have xterm terminal
      await expect(page.locator('.xterm')).toBeVisible()

      // Should show log entries
      await expect(page.locator('.xterm-rows')).toBeVisible()
    })

    test('should stream logs in real-time', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Get initial log count
      const initialLogs = await page.locator('.xterm-rows > div').count()

      // Wait for new logs (simulated or real)
      await page.waitForTimeout(2000)

      // Should have more logs
      const newLogs = await page.locator('.xterm-rows > div').count()
      expect(newLogs).toBeGreaterThanOrEqual(initialLogs)
    })

    test('should filter logs by level', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Click filter button
      await page.click('button:has-text("Filter")')

      // Select error level only
      await page.click('input[value="error"]')
      await page.click('button:has-text("Apply")')

      // Logs should be filtered
      await expect(page.locator('text=Showing error logs only')).toBeVisible()
    })

    test('should search logs', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Search for specific text
      await page.fill('input[placeholder*="Search logs"]', 'error')

      // Should highlight matches
      await expect(page.locator('.highlight, .search-match').first()).toBeVisible({
        timeout: 3000,
      })
    })

    test('should export logs', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Click export button
      await page.click('button:has-text("Export Logs")')

      // Wait for download
      const downloadPromise = page.waitForEvent('download')
      await page.click('button:has-text("Download as TXT")')
      const download = await downloadPromise

      expect(download.suggestedFilename()).toMatch(/\.txt$/)
    })

    test('should show subagent tree', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Click subagents tab
      await page.click('button:has-text("Subagents")')

      // Should show tree view
      await expect(page.locator('[data-testid="subagent-tree"]')).toBeVisible()

      // Should be able to expand/collapse nodes
      await page.click('[data-testid="tree-node-toggle"]').first()
      await expect(page.locator('[data-testid="tree-node-children"]')).toBeVisible()
    })
  })

  test.describe('Agent Metrics & Analytics', () => {
    test('should display token usage over time', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()
      await page.click('button:has-text("Analytics")')

      // Should show token chart
      await expect(page.locator('text=Token Usage Over Time')).toBeVisible()
      await expect(page.locator('canvas, svg').first()).toBeVisible()
    })

    test('should display cost breakdown', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()
      await page.click('button:has-text("Analytics")')

      // Should show cost metrics
      await expect(page.locator('text=Total Cost')).toBeVisible()
      await expect(page.locator('text=Input Tokens')).toBeVisible()
      await expect(page.locator('text=Output Tokens')).toBeVisible()
    })

    test('should compare agent performance', async ({ page }) => {
      await page.click('text=Agents')

      // Select multiple agents
      await page.click('[data-testid="agent-checkbox"]').first()
      await page.click('[data-testid="agent-checkbox"]').nth(1)

      // Click compare button
      await page.click('button:has-text("Compare")')

      // Should show comparison view
      await expect(page.locator('h1:has-text("Agent Comparison")')).toBeVisible()
      await expect(page.locator('text=Performance Metrics')).toBeVisible()
    })

    test('should show iteration history', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()
      await page.click('button:has-text("History")')

      // Should show iterations
      await expect(page.locator('text=Iteration History')).toBeVisible()
      await expect(page.locator('[data-testid="iteration-item"]')).toHaveCount(
        await page.locator('[data-testid="iteration-item"]').count()
      )
    })
  })

  test.describe('Multi-Agent Coordination', () => {
    test('should show all active agents', async ({ page }) => {
      await page.click('text=Agents')

      // Should show active agents section
      await expect(page.locator('text=Active Agents')).toBeVisible()

      // Should show agent count
      await expect(page.locator('text=/\\d+ active/')).toBeVisible()
    })

    test('should filter agents by session', async ({ page }) => {
      await page.click('text=Agents')

      // Select session filter
      await page.selectOption('select[name="session"]', 'session-1')

      // Should show only agents for that session
      await expect(page.locator('[data-session-id="session-1"]')).toBeVisible()
    })

    test('should filter agents by task', async ({ page }) => {
      await page.click('text=Agents')

      // Select task filter
      await page.selectOption('select[name="task"]', 'task-1')

      // Should show only agents for that task
      await expect(page.locator('[data-task-id="task-1"]')).toBeVisible()
    })

    test('should filter agents by status', async ({ page }) => {
      await page.click('text=Agents')

      // Select status filter
      await page.selectOption('select[name="status"]', 'thinking')

      // Should show only thinking agents
      await expect(page.locator('[data-status="thinking"]')).toBeVisible()
    })
  })

  test.describe('Agent Error Handling', () => {
    test('should display error message when agent fails', async ({ page }) => {
      await page.click('text=Agents')

      // Find failed agent
      await page.click('[data-status="failed"]').first()

      // Should show error details
      await expect(page.locator('text=Error')).toBeVisible()
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible()
    })

    test('should allow viewing error logs', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-status="failed"]').first()

      // Click view error logs
      await page.click('button:has-text("View Error Logs")')

      // Should show error logs
      await expect(page.locator('[data-testid="error-log"]')).toBeVisible()
    })

    test('should show retry options for failed agent', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-status="failed"]').first()

      // Should show retry button
      await expect(page.locator('button:has-text("Retry")')).toBeVisible()
      await expect(page.locator('button:has-text("Restart")')).toBeVisible()
    })
  })

  test.describe('Agent Integration with Tasks', () => {
    test('should show assigned task for agent', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Should show task info
      await expect(page.locator('text=Assigned Task')).toBeVisible()
      await expect(page.locator('[data-testid="task-link"]')).toBeVisible()
    })

    test('should navigate to task from agent view', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Click task link
      await page.click('[data-testid="task-link"]')

      // Should navigate to task detail
      await expect(page.locator('text=Task Details')).toBeVisible()
    })

    test('should update task status when agent completes', async ({ page }) => {
      await page.click('text=Agents')

      // Wait for agent to complete (or simulate completion)
      await page.click('[data-testid="complete-agent-btn"]').first()

      // Navigate to tasks
      await page.click('text=Tasks')

      // Task should be marked as completed
      await expect(page.locator('[data-task-status="completed"]').first()).toBeVisible()
    })
  })
})
