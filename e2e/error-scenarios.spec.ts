import { test, expect } from '@playwright/test'

test.describe('Error Scenarios & Recovery (Phase 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Network Failures', () => {
    test('should handle API connection failures', async ({ page }) => {
      // Simulate network failure
      await page.route('**/api/**', (route) => route.abort())

      await page.click('text=Sessions')

      // Should show error message
      await expect(page.locator('text=Failed to connect')).toBeVisible({
        timeout: 5000,
      })

      // Should show retry button
      await expect(page.locator('button:has-text("Retry")')).toBeVisible()
    })

    test('should retry failed API requests', async ({ page }) => {
      let requestCount = 0

      // Fail first 2 requests, succeed on 3rd
      await page.route('**/api/sessions', (route) => {
        requestCount++
        if (requestCount < 3) {
          route.abort()
        } else {
          route.continue()
        }
      })

      await page.click('text=Sessions')

      // Should eventually succeed
      await expect(page.locator('[data-testid="session-list"]')).toBeVisible({
        timeout: 10000,
      })
    })

    test('should handle timeout gracefully', async ({ page }) => {
      // Simulate slow response
      await page.route('**/api/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 10000))
        route.continue()
      })

      await page.click('text=Sessions')

      // Should show timeout error
      await expect(page.locator('text=Request timeout')).toBeVisible({
        timeout: 15000,
      })
    })

    test('should work offline with cached data', async ({ page }) => {
      // Load data first
      await page.click('text=Sessions')
      await page.waitForSelector('[data-testid="session-list"]')

      // Go offline
      await page.route('**/*', (route) => route.abort())

      // Reload page
      await page.reload()

      // Should show cached data
      await expect(page.locator('[data-testid="session-list"]')).toBeVisible()
      await expect(page.locator('text=Offline Mode')).toBeVisible()
    })

    test('should queue operations when offline', async ({ page }) => {
      await page.click('text=Sessions')

      // Go offline
      await page.route('**/*', (route) => route.abort())

      // Try to create session
      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Offline Session')
      await page.fill('input[name="projectPath"]', '/test/offline')
      await page.click('button:has-text("Create")')

      // Should show queued message
      await expect(page.locator('text=Queued for sync')).toBeVisible()

      // Go back online
      await page.unroute('**/*')
      await page.click('button:has-text("Sync Now")')

      // Should sync successfully
      await expect(page.locator('text=Offline Session')).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Agent Crashes & Recovery', () => {
    test('should detect agent crash', async ({ page }) => {
      await page.click('text=Agents')

      // Simulate agent crash
      await page.evaluate(() => {
        // Trigger crash event
        window.dispatchEvent(new CustomEvent('agent-crash', { detail: { agentId: 'agent-1' } }))
      })

      // Should show crash notification
      await expect(page.locator('text=Agent crashed')).toBeVisible({
        timeout: 3000,
      })
    })

    test('should auto-restart crashed agent', async ({ page }) => {
      await page.click('text=Agents')

      // Enable auto-restart
      await page.click('button:has-text("Settings")')
      await page.click('input[name="autoRestart"]')
      await page.click('button:has-text("Save")')

      // Simulate crash
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('agent-crash', { detail: { agentId: 'agent-1' } }))
      })

      // Should show restarting message
      await expect(page.locator('text=Restarting agent')).toBeVisible({
        timeout: 3000,
      })

      // Should show running status
      await expect(page.locator('[data-status="thinking"]').first()).toBeVisible({
        timeout: 5000,
      })
    })

    test('should preserve agent state after crash', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Get current iteration count
      const iterationText = await page.locator('text=/\\d+ iterations/').textContent()
      const iterations = parseInt(iterationText?.match(/\d+/)?.[0] || '0')

      // Simulate crash and restart
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('agent-crash', { detail: { agentId: 'agent-1' } }))
      })

      await page.click('button:has-text("Restart Agent")')

      // Should preserve iteration count
      await expect(page.locator(`text=/${iterations} iterations/`)).toBeVisible()
    })

    test('should handle max restart limit', async ({ page }) => {
      await page.click('text=Agents')

      // Set max restarts to 3
      await page.click('button:has-text("Settings")')
      await page.fill('input[name="maxRestarts"]', '3')
      await page.click('button:has-text("Save")')

      // Crash agent 4 times
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent('agent-crash', { detail: { agentId: 'agent-1' } }))
        })
        await page.waitForTimeout(1000)
      }

      // Should show max restarts reached
      await expect(page.locator('text=Max restart attempts reached')).toBeVisible()
      await expect(page.locator('[data-status="failed"]').first()).toBeVisible()
    })

    test('should save crash report', async ({ page }) => {
      await page.click('text=Agents')

      // Simulate crash with error
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('agent-crash', {
            detail: {
              agentId: 'agent-1',
              error: 'Segmentation fault',
              stackTrace: 'at function1...',
            },
          })
        )
      })

      // View crash report
      await page.click('button:has-text("View Crash Report")')

      // Should show crash details
      await expect(page.locator('text=Segmentation fault')).toBeVisible()
      await expect(page.locator('text=Stack Trace')).toBeVisible()

      // Should be able to download report
      await page.click('button:has-text("Download Report")')
      const downloadPromise = page.waitForEvent('download')
      await page.click('button:has-text("Download")')
      const download = await downloadPromise

      expect(download.suggestedFilename()).toMatch(/crash-report.*\.txt/)
    })
  })

  test.describe('Session Recovery', () => {
    test('should detect interrupted session on startup', async ({ page }) => {
      // Simulate interrupted session in localStorage
      await page.evaluate(() => {
        localStorage.setItem(
          'interrupted_session',
          JSON.stringify({
            sessionId: 'session-1',
            timestamp: Date.now(),
            state: 'active',
          })
        )
      })

      // Reload page
      await page.reload()

      // Should show recovery dialog
      await expect(page.locator('text=Interrupted Session Detected')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should recover interrupted session', async ({ page }) => {
      // Set up interrupted session
      await page.evaluate(() => {
        localStorage.setItem(
          'interrupted_session',
          JSON.stringify({
            sessionId: 'session-1',
            timestamp: Date.now(),
            state: 'active',
            activeAgents: ['agent-1', 'agent-2'],
          })
        )
      })

      await page.reload()

      // Click recover
      await page.click('button:has-text("Recover Session")')

      // Should restore session
      await expect(page.locator('text=Session recovered')).toBeVisible({
        timeout: 5000,
      })

      // Should show active agents
      await page.click('text=Agents')
      await expect(page.locator('[data-testid="active-agent"]')).toHaveCount(2, {
        timeout: 5000,
      })
    })

    test('should discard interrupted session', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'interrupted_session',
          JSON.stringify({
            sessionId: 'session-1',
            timestamp: Date.now(),
            state: 'active',
          })
        )
      })

      await page.reload()

      // Click discard
      await page.click('button:has-text("Discard")')

      // Should clear recovery state
      await expect(page.locator('text=Interrupted Session')).not.toBeVisible()
    })

    test('should show recovery state details', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'interrupted_session',
          JSON.stringify({
            sessionId: 'session-1',
            timestamp: Date.now() - 3600000, // 1 hour ago
            state: 'active',
            activeTasks: 5,
            activeAgents: 3,
            lastSaved: new Date(Date.now() - 3600000).toISOString(),
          })
        )
      })

      await page.reload()

      // Should show details
      await expect(page.locator('text=1 hour ago')).toBeVisible()
      await expect(page.locator('text=5 active tasks')).toBeVisible()
      await expect(page.locator('text=3 active agents')).toBeVisible()
    })

    test('should auto-save session state periodically', async ({ page }) => {
      await page.click('text=Sessions')

      // Create a session
      await page.click('button:has-text("New Session")')
      await page.fill('input[name="name"]', 'Auto-save Test')
      await page.fill('input[name="projectPath"]', '/test/autosave')
      await page.click('button:has-text("Create")')

      // Wait for auto-save
      await page.waitForTimeout(5000)

      // Check localStorage
      const savedState = await page.evaluate(() => {
        return localStorage.getItem('session_state')
      })

      expect(savedState).toBeTruthy()
      expect(savedState).toContain('Auto-save Test')
    })
  })

  test.describe('Data Corruption & Validation', () => {
    test('should detect corrupted task data', async ({ page }) => {
      // Inject corrupted data
      await page.evaluate(() => {
        localStorage.setItem('tasks', '{invalid json}')
      })

      await page.click('text=Tasks')

      // Should show corruption error
      await expect(page.locator('text=Data corruption detected')).toBeVisible()

      // Should offer to reset
      await expect(page.locator('button:has-text("Reset Data")')).toBeVisible()
    })

    test('should validate imported PRD format', async ({ page }) => {
      await page.click('text=Tasks')
      await page.click('button:has-text("Import PRD")')

      // Upload invalid JSON
      const invalidContent = '{ invalid: "json" }'
      const testFilePath = '/tmp/invalid-prd.json'

      await page.evaluate(
        ({ path, content }) => {
          const fs = require('fs')
          fs.writeFileSync(path, content)
        },
        { path: testFilePath, content: invalidContent }
      )

      const fileInput = await page.locator('input[type="file"]')
      await fileInput.setInputFiles(testFilePath)

      await page.click('button:has-text("Import")')

      // Should show validation error
      await expect(page.locator('text=Invalid JSON format')).toBeVisible()
    })

    test('should handle database errors gracefully', async ({ page }) => {
      // Simulate database error
      await page.route('**/api/db/**', (route) =>
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Database connection failed' }),
        })
      )

      await page.click('text=Sessions')

      // Should show database error
      await expect(page.locator('text=Database error')).toBeVisible()

      // Should offer recovery options
      await expect(page.locator('button:has-text("Retry")')).toBeVisible()
      await expect(page.locator('button:has-text("Reset Database")')).toBeVisible()
    })
  })

  test.describe('Resource Exhaustion', () => {
    test('should handle out of memory gracefully', async ({ page }) => {
      // Simulate memory warning
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('memory-warning', { detail: { usage: 95 } }))
      })

      // Should show warning
      await expect(page.locator('text=High memory usage')).toBeVisible()

      // Should offer to close agents
      await expect(page.locator('button:has-text("Close Agents")')).toBeVisible()
    })

    test('should handle disk space errors', async ({ page }) => {
      // Simulate disk full error
      await page.route('**/api/files/**', (route) =>
        route.fulfill({
          status: 507,
          body: JSON.stringify({ error: 'Insufficient storage' }),
        })
      )

      await page.click('text=Sessions')
      await page.click('button:has-text("Export")')

      // Should show disk space error
      await expect(page.locator('text=Insufficient storage')).toBeVisible()
    })

    test('should warn when approaching cost limits', async ({ page }) => {
      await page.click('text=Sessions')

      // Set cost limit
      await page.click('button:has-text("Settings")')
      await page.fill('input[name="costLimit"]', '10.00')
      await page.click('button:has-text("Save")')

      // Simulate approaching limit
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('cost-warning', {
            detail: { current: 9.5, limit: 10.0, percentage: 95 },
          })
        )
      })

      // Should show warning
      await expect(page.locator('text=95% of cost limit reached')).toBeVisible()
    })
  })

  test.describe('UI Error Handling', () => {
    test('should show fallback UI on component error', async ({ page }) => {
      // Trigger a component error
      await page.evaluate(() => {
        // This will be caught by React Error Boundary
        throw new Error('Component error')
      })

      // Should show error boundary
      await expect(page.locator('text=Something went wrong')).toBeVisible()

      // Should offer to reload
      await expect(page.locator('button:has-text("Reload")')).toBeVisible()
    })

    test('should log errors to console', async ({ page }) => {
      const consoleErrors: string[] = []

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      // Trigger an error
      await page.evaluate(() => {
        console.error('Test error')
      })

      expect(consoleErrors).toContain('Test error')
    })

    test('should handle navigation errors', async ({ page }) => {
      // Try to navigate to non-existent route
      await page.goto('/#/nonexistent-route')

      // Should show 404 page
      await expect(page.locator('text=Page Not Found, text=404').first()).toBeVisible()

      // Should have back button
      await expect(page.locator('button:has-text("Go Back")')).toBeVisible()
    })
  })

  test.describe('Concurrent Operation Errors', () => {
    test('should handle concurrent updates to same resource', async ({ page }) => {
      await page.click('text=Tasks')
      await page.click('[data-testid="task-item"]').first()

      // Open same task in two windows
      const page2 = await page.context().newPage()
      await page2.goto(page.url())

      // Update from first window
      await page.fill('input[name="title"]', 'Updated Title')
      await page.click('button:has-text("Save")')

      // Update from second window
      await page2.fill('input[name="title"]', 'Different Title')
      await page2.click('button:has-text("Save")')

      // Should show conflict error
      await expect(page2.locator('text=Conflict detected')).toBeVisible()
      await expect(page2.locator('text=Resource was modified')).toBeVisible()

      await page2.close()
    })

    test('should prevent race conditions in agent spawning', async ({ page }) => {
      await page.click('text=Agents')

      // Spawn multiple agents rapidly
      for (let i = 0; i < 5; i++) {
        await page.click('button:has-text("Spawn Agent")')
        await page.fill('input[name="taskId"]', `task-${i}`)
        await page.click('button:has-text("Spawn")')
      }

      // Should handle gracefully without errors
      await expect(page.locator('text=Error').first()).not.toBeVisible({
        timeout: 3000,
      })
    })
  })

  test.describe('Error Reporting & Analytics', () => {
    test('should collect error statistics', async ({ page }) => {
      await page.click('text=Settings')
      await page.click('button:has-text("Error Logs")')

      // Should show error summary
      await expect(page.locator('text=Error Statistics')).toBeVisible()
      await expect(page.locator('text=Total Errors')).toBeVisible()
      await expect(page.locator('text=Error Rate')).toBeVisible()
    })

    test('should allow exporting error logs', async ({ page }) => {
      await page.click('text=Settings')
      await page.click('button:has-text("Error Logs")')

      // Export logs
      const downloadPromise = page.waitForEvent('download')
      await page.click('button:has-text("Export Logs")')
      const download = await downloadPromise

      expect(download.suggestedFilename()).toMatch(/error-logs.*\.(json|txt)/)
    })

    test('should group similar errors', async ({ page }) => {
      await page.click('text=Settings')
      await page.click('button:has-text("Error Logs")')

      // Should show grouped errors
      await expect(page.locator('[data-testid="error-group"]').first()).toBeVisible()
      await expect(page.locator('text=Occurrences').first()).toBeVisible()
    })
  })
})
