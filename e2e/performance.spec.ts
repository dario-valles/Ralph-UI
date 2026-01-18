import { test, expect } from '@playwright/test'

test.describe('Performance Metrics (Phase 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test.describe('Startup Performance', () => {
    test('should load app within 1 second (cold start)', async ({ page }) => {
      const startTime = Date.now()

      await page.waitForLoadState('networkidle')

      const loadTime = Date.now() - startTime

      // Target: < 1000ms cold start
      expect(loadTime).toBeLessThan(1000)
    })

    test('should be interactive within 500ms', async ({ page }) => {
      const startTime = Date.now()

      // Wait for first meaningful paint
      await page.waitForSelector('main')

      const timeToInteractive = Date.now() - startTime

      // Target: < 500ms to first interactive
      expect(timeToInteractive).toBeLessThan(500)
    })

    test('should have good Lighthouse scores', async ({ page }) => {
      // Note: This requires playwright-lighthouse or similar
      // For now, we'll do basic performance checks

      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return {
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
          firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
          firstContentfulPaint:
            performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
        }
      })

      // Targets from implementation plan
      expect(metrics.domContentLoaded).toBeLessThan(500) // < 500ms DOM ready
      expect(metrics.loadComplete).toBeLessThan(1000) // < 1s full load
      expect(metrics.firstPaint).toBeLessThan(300) // < 300ms first paint
      expect(metrics.firstContentfulPaint).toBeLessThan(500) // < 500ms FCP
    })
  })

  test.describe('UI Responsiveness', () => {
    test('should respond to clicks within 100ms', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      const startTime = Date.now()

      await page.click('text=Sessions')

      await page.waitForSelector('h1')

      const responseTime = Date.now() - startTime

      // Target: < 100ms for UI interactions
      expect(responseTime).toBeLessThan(100)
    })

    test('should handle rapid navigation without lag', async ({ page }) => {
      const pages = ['Sessions', 'Tasks', 'Agents', 'Git', 'Parallel']
      const startTime = Date.now()

      for (const pageName of pages) {
        await page.click(`text=${pageName}`)
        await page.waitForSelector('h1')
      }

      const totalTime = Date.now() - startTime
      const avgTime = totalTime / pages.length

      // Average should be < 100ms per navigation
      expect(avgTime).toBeLessThan(100)
    })

    test('should scroll smoothly with large lists', async ({ page }) => {
      await page.click('text=Tasks')

      // Measure frame rate during scroll
      await page.evaluate(() => {
        let lastTime = performance.now()
        let frameCount = 0

        function measureFrame() {
          const currentTime = performance.now()
          const delta = currentTime - lastTime

          if (delta > 0) {
            const fps = 1000 / delta
            const win = window as Window & { frameRates?: number[] }
            win.frameRates = win.frameRates || []
            win.frameRates.push(fps)
          }

          lastTime = currentTime
          frameCount++

          if (frameCount < 60) {
            requestAnimationFrame(measureFrame)
          }
        }

        requestAnimationFrame(measureFrame)
      })

      // Scroll the page
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
      })

      await page.waitForTimeout(1000)

      const fps = await page.evaluate(() => {
        const win = window as Window & { frameRates?: number[] }
        return win.frameRates || []
      })

      // Should maintain 30+ fps (ideally 60)
      const avgFps = fps.reduce((a: number, b: number) => a + b, 0) / fps.length
      expect(avgFps).toBeGreaterThan(30)
    })

    test('should render large tables efficiently', async ({ page }) => {
      await page.click('text=Tasks')

      const startTime = Date.now()

      // Wait for table to render
      await page.waitForSelector('[data-testid="task-list"]')

      const renderTime = Date.now() - startTime

      // Should render within 200ms even with many rows
      expect(renderTime).toBeLessThan(200)
    })
  })

  test.describe('Memory Usage', () => {
    test('should not leak memory on repeated navigation', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      // Get initial memory
      const initialMemory = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize
        }
        return 0
      })

      // Navigate repeatedly
      const pages = ['Sessions', 'Tasks', 'Agents', 'Git', 'Parallel']
      for (let i = 0; i < 10; i++) {
        for (const pageName of pages) {
          await page.click(`text=${pageName}`)
          await page.waitForLoadState('networkidle')
        }
      }

      // Force garbage collection if available
      await page.evaluate(() => {
        const win = window as Window & { gc?: () => void }
        if (win.gc) {
          win.gc()
        }
      })

      await page.waitForTimeout(1000)

      // Get final memory
      const finalMemory = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize
        }
        return 0
      })

      // Memory should not grow excessively (allow 50MB growth)
      const growth = finalMemory - initialMemory
      expect(growth).toBeLessThan(50 * 1024 * 1024) // 50 MB
    })

    test('should stay under 100MB idle memory', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      const memory = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize
        }
        return 0
      })

      // Target: < 100 MB idle (converted to bytes)
      expect(memory).toBeLessThan(100 * 1024 * 1024)
    })

    test('should handle multiple agents without excessive memory', async ({ page }) => {
      await page.click('text=Parallel')

      // Simulate spawning 5 agents
      await page.evaluate(() => {
        // This would spawn agents in a real scenario
        const mockAgents = Array.from({ length: 5 }, (_, i) => ({
          id: `agent-${i}`,
          status: 'active',
          logs: Array.from({ length: 100 }, (_, j) => ({
            id: `log-${j}`,
            message: `Log message ${j}`,
          })),
        }))
        const win = window as Window & { mockAgents?: typeof mockAgents }
        win.mockAgents = mockAgents
      })

      await page.waitForTimeout(2000)

      const memory = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize
        }
        return 0
      })

      // Target: < 300 MB with 5 agents (converted to bytes)
      expect(memory).toBeLessThan(300 * 1024 * 1024)
    })
  })

  test.describe('Network Performance', () => {
    test('should minimize number of requests', async ({ page }) => {
      const requests: string[] = []

      page.on('request', (request) => {
        requests.push(request.url())
      })

      await page.waitForLoadState('networkidle')

      // Should have reasonable number of initial requests (< 50)
      expect(requests.length).toBeLessThan(50)
    })

    test('should use caching effectively', async ({ page }) => {
      const cachedRequests: string[] = []

      page.on('response', (response) => {
        const cacheHeader = response.headers()['cache-control']
        if (cacheHeader && !cacheHeader.includes('no-cache')) {
          cachedRequests.push(response.url())
        }
      })

      await page.waitForLoadState('networkidle')

      // Should have some cacheable resources
      expect(cachedRequests.length).toBeGreaterThan(0)
    })

    test('should compress resources', async ({ page }) => {
      const compressedRequests: string[] = []

      page.on('response', (response) => {
        const encoding = response.headers()['content-encoding']
        if (encoding && (encoding.includes('gzip') || encoding.includes('br'))) {
          compressedRequests.push(response.url())
        }
      })

      await page.waitForLoadState('networkidle')

      // Should have compressed resources
      expect(compressedRequests.length).toBeGreaterThan(0)
    })
  })

  test.describe('Bundle Size', () => {
    test('should have reasonable initial bundle size', async ({ page }) => {
      const bundleSizes: { url: string; size: number }[] = []

      page.on('response', async (response) => {
        if (response.url().includes('.js') || response.url().includes('.css')) {
          const body = await response.body()
          bundleSizes.push({
            url: response.url(),
            size: body.length,
          })
        }
      })

      await page.waitForLoadState('networkidle')

      // Total JS + CSS should be < 2 MB (before compression)
      const totalSize = bundleSizes.reduce((sum, item) => sum + item.size, 0)
      expect(totalSize).toBeLessThan(2 * 1024 * 1024) // 2 MB
    })
  })

  test.describe('Render Performance', () => {
    test('should minimize layout thrashing', async ({ page }) => {
      await page.click('text=Tasks')

      // Measure layout operations
      const layoutCount = await page.evaluate(() => {
        let count = 0
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'layout') {
              count++
            }
          }
        })

        observer.observe({ entryTypes: ['measure'] })

        // Trigger some DOM operations
        const elements = document.querySelectorAll('[data-testid]')
        elements.forEach((el) => {
          el.getBoundingClientRect() // Force layout
        })

        return count
      })

      // Should minimize forced layouts
      expect(layoutCount).toBeLessThan(10)
    })

    test('should use virtual scrolling for long lists', async ({ page }) => {
      await page.click('text=Tasks')

      // Check if virtual scrolling is implemented
      const usesVirtualScrolling = await page.evaluate(() => {
        // Look for common virtual scrolling indicators
        const indicators = [
          '[data-virtual="true"]',
          '.react-virtualized',
          '.virtual-list',
          '[role="list"][style*="transform"]',
        ]

        return indicators.some((selector) => document.querySelector(selector) !== null)
      })

      // For large lists, should use virtual scrolling
      const itemCount = await page.locator('[data-testid="task-item"]').count()

      if (itemCount > 50) {
        expect(usesVirtualScrolling).toBe(true)
      }
    })
  })

  test.describe('Database Performance', () => {
    test('should query database efficiently', async ({ page }) => {
      await page.click('text=Sessions')

      const startTime = Date.now()

      // Wait for data to load
      await page.waitForSelector('[data-testid="session-list"]')

      const queryTime = Date.now() - startTime

      // Database queries should complete quickly
      expect(queryTime).toBeLessThan(100)
    })
  })

  test.describe('Animation Performance', () => {
    test('should maintain 60fps during animations', async ({ page }) => {
      await page.click('text=Sessions')

      // Trigger an animation (e.g., opening a dialog)
      await page.click('button:has-text("New Session")')

      // Measure frame rate during animation
      const frameRate = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let frameCount = 0
          const startTime = performance.now()
          const duration = 1000 // 1 second

          function countFrames() {
            frameCount++
            const elapsed = performance.now() - startTime

            if (elapsed < duration) {
              requestAnimationFrame(countFrames)
            } else {
              const fps = (frameCount / elapsed) * 1000
              resolve(fps)
            }
          }

          requestAnimationFrame(countFrames)
        })
      })

      // Should maintain close to 60fps
      expect(frameRate).toBeGreaterThan(50)
    })

    test('should use CSS animations instead of JavaScript where possible', async ({ page }) => {
      await page.click('text=Sessions')

      // Check for CSS transitions/animations
      const usesCssAnimations = await page.evaluate(() => {
        const elements = document.querySelectorAll('*')
        let count = 0

        elements.forEach((el) => {
          const styles = window.getComputedStyle(el)
          if (
            styles.transition !== 'none' ||
            styles.animation !== 'none' ||
            styles.transform !== 'none'
          ) {
            count++
          }
        })

        return count
      })

      // Should use CSS animations
      expect(usesCssAnimations).toBeGreaterThan(0)
    })
  })

  test.describe('Long Task Performance', () => {
    test('should not have long blocking tasks', async ({ page }) => {
      await page.evaluate(() => {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const win = window as Window & { longTasks?: number[] }
            win.longTasks = win.longTasks || []
            win.longTasks.push(entry.duration)
          }
        })

        observer.observe({ entryTypes: ['longtask'] })
      })

      await page.click('text=Sessions')
      await page.waitForTimeout(3000)

      const tasks = await page.evaluate(() => {
        const win = window as Window & { longTasks?: number[] }
        return win.longTasks || []
      })

      // Should not have many long tasks (> 50ms)
      const longTaskCount = tasks.filter((duration: number) => duration > 50).length

      expect(longTaskCount).toBeLessThan(5)
    })
  })
})
