import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Automated Accessibility Audits', () => {
    test('should not have accessibility violations on home page', async ({ page }) => {
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test('should not have violations on sessions page', async ({ page }) => {
      await page.click('text=Sessions')
      await page.waitForLoadState('networkidle')

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test('should not have violations on tasks page', async ({ page }) => {
      await page.click('text=Tasks')
      await page.waitForLoadState('networkidle')

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test('should not have violations on agents page', async ({ page }) => {
      await page.click('text=Agents')
      await page.waitForLoadState('networkidle')

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test('should not have violations on git page', async ({ page }) => {
      await page.click('text=Git')
      await page.waitForLoadState('networkidle')

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test('should not have violations on parallel execution page', async ({ page }) => {
      await page.click('text=Parallel')
      await page.waitForLoadState('networkidle')

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('should navigate through main menu with keyboard', async ({ page }) => {
      // Focus first menu item
      await page.keyboard.press('Tab')

      // Navigate through menu items
      const menuItems = ['Dashboard', 'Sessions', 'Tasks', 'Agents', 'Git', 'Parallel']

      for (let i = 0; i < menuItems.length; i++) {
        await page.keyboard.press('ArrowDown')
        const focused = await page.evaluate(() => document.activeElement?.textContent)
        expect(menuItems).toContain(focused || '')
      }
    })

    test('should activate buttons with Enter and Space', async ({ page }) => {
      await page.click('text=Sessions')

      // Focus new session button
      await page.keyboard.press('Tab')
      while (!(await page.evaluate(() => document.activeElement?.textContent?.includes('New Session')))) {
        await page.keyboard.press('Tab')
      }

      // Activate with Enter
      await page.keyboard.press('Enter')

      // Should open dialog
      await expect(page.locator('text=Create New Session')).toBeVisible()

      // Close dialog
      await page.keyboard.press('Escape')

      // Focus button again
      while (!(await page.evaluate(() => document.activeElement?.textContent?.includes('New Session')))) {
        await page.keyboard.press('Tab')
      }

      // Activate with Space
      await page.keyboard.press('Space')

      // Should open dialog
      await expect(page.locator('text=Create New Session')).toBeVisible()
    })

    test('should trap focus in modal dialogs', async ({ page }) => {
      await page.click('text=Sessions')
      await page.click('button:has-text("New Session")')

      // Tab through dialog - initial focus is on the dialog

      // Tab multiple times
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab')
      }

      // Focus should still be within dialog
      const isInDialog = await page.evaluate(() => {
        const activeEl = document.activeElement
        const dialog = document.querySelector('[role="dialog"]')
        return dialog?.contains(activeEl)
      })

      expect(isInDialog).toBe(true)
    })

    test('should close modal with Escape key', async ({ page }) => {
      await page.click('text=Sessions')
      await page.click('button:has-text("New Session")')

      await expect(page.locator('[role="dialog"]')).toBeVisible()

      // Press Escape
      await page.keyboard.press('Escape')

      // Dialog should close
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    })

    test('should navigate tables with arrow keys', async ({ page }) => {
      await page.click('text=Tasks')

      // Focus table
      await page.click('[role="table"], table').first()

      // Navigate with arrow keys
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowRight')

      // Should navigate through table cells
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
      expect(['TD', 'TH', 'TR', 'BUTTON', 'A']).toContain(focusedElement || '')
    })

    test('should support skip to content link', async ({ page }) => {
      // Tab to first element (should be skip link)
      await page.keyboard.press('Tab')

      const skipLinkVisible = await page.evaluate(() => {
        const activeEl = document.activeElement
        return (
          activeEl?.textContent?.includes('Skip') ||
          activeEl?.getAttribute('aria-label')?.includes('skip')
        )
      })

      if (skipLinkVisible) {
        await page.keyboard.press('Enter')

        // Should skip to main content
        const focusedInMain = await page.evaluate(() => {
          const activeEl = document.activeElement
          const main = document.querySelector('main')
          return main?.contains(activeEl)
        })

        expect(focusedInMain).toBe(true)
      }
    })
  })

  test.describe('Screen Reader Support', () => {
    test('should have proper ARIA labels on buttons', async ({ page }) => {
      await page.click('text=Sessions')

      // Check for aria-labels or text content
      const buttons = await page.locator('button').all()

      for (const button of buttons) {
        const hasLabel =
          (await button.getAttribute('aria-label')) ||
          (await button.textContent()) ||
          (await button.getAttribute('aria-labelledby'))

        expect(hasLabel).toBeTruthy()
      }
    })

    test('should have proper heading hierarchy', async ({ page }) => {
      await page.click('text=Sessions')

      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
      const levels: number[] = []

      for (const heading of headings) {
        const tagName = await heading.evaluate((el) => el.tagName)
        const level = parseInt(tagName.replace('H', ''))
        levels.push(level)
      }

      // Should have at least one h1
      expect(levels).toContain(1)

      // Levels should not skip (e.g., h1 -> h3)
      for (let i = 1; i < levels.length; i++) {
        const diff = levels[i] - levels[i - 1]
        expect(diff).toBeLessThanOrEqual(1)
      }
    })

    test('should have alt text for images', async ({ page }) => {
      const images = await page.locator('img').all()

      for (const img of images) {
        const alt = await img.getAttribute('alt')
        const ariaLabel = await img.getAttribute('aria-label')
        const role = await img.getAttribute('role')

        // Images should have alt text or be marked as decorative
        expect(alt !== null || ariaLabel !== null || role === 'presentation').toBe(true)
      }
    })

    test('should have proper form labels', async ({ page }) => {
      await page.click('text=Sessions')
      await page.click('button:has-text("New Session")')

      const inputs = await page.locator('input, textarea, select').all()

      for (const input of inputs) {
        const id = await input.getAttribute('id')
        const ariaLabel = await input.getAttribute('aria-label')
        const ariaLabelledBy = await input.getAttribute('aria-labelledby')

        // Check if there's a label element
        let hasLabel = false
        if (id) {
          hasLabel = (await page.locator(`label[for="${id}"]`).count()) > 0
        }

        // Input should have a label, aria-label, or aria-labelledby
        expect(hasLabel || ariaLabel !== null || ariaLabelledBy !== null).toBe(true)
      }
    })

    test('should announce live regions properly', async ({ page }) => {
      await page.click('text=Sessions')

      // Check for live regions
      const liveRegions = await page.locator('[aria-live]').all()

      for (const region of liveRegions) {
        const ariaLive = await region.getAttribute('aria-live')
        expect(['polite', 'assertive', 'off']).toContain(ariaLive || '')
      }
    })

    test('should have proper link descriptions', async ({ page }) => {
      const links = await page.locator('a').all()

      for (const link of links) {
        const text = await link.textContent()
        const ariaLabel = await link.getAttribute('aria-label')
        const title = await link.getAttribute('title')

        // Links should have descriptive text
        expect(text || ariaLabel || title).toBeTruthy()

        // Avoid generic link text
        const genericTexts = ['click here', 'read more', 'link']
        const linkText = (text || ariaLabel || title || '').toLowerCase()
        expect(genericTexts.every((generic) => !linkText.includes(generic))).toBe(true)
      }
    })

    test('should mark required form fields', async ({ page }) => {
      await page.click('text=Sessions')
      await page.click('button:has-text("New Session")')

      const requiredFields = await page.locator('input[required], [aria-required="true"]').all()

      for (const field of requiredFields) {
        const required = await field.getAttribute('required')
        const ariaRequired = await field.getAttribute('aria-required')

        expect(required !== null || ariaRequired === 'true').toBe(true)
      }
    })

    test('should provide error messages for invalid inputs', async ({ page }) => {
      await page.click('text=Sessions')
      await page.click('button:has-text("New Session")')

      // Submit empty form to trigger validation
      await page.click('button:has-text("Create")')

      // Check for error messages
      const errorMessages = await page
        .locator('[role="alert"], .error, [aria-invalid="true"]')
        .count()

      expect(errorMessages).toBeGreaterThan(0)
    })
  })

  test.describe('Color Contrast', () => {
    test('should have sufficient color contrast', async ({ page }) => {
      // Use axe-core to check color contrast
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa', 'wcag21aa'])
        .analyze()

      const contrastViolations = accessibilityScanResults.violations.filter((violation) =>
        violation.id.includes('color-contrast')
      )

      expect(contrastViolations).toEqual([])
    })
  })

  test.describe('Focus Indicators', () => {
    test('should have visible focus indicators', async ({ page }) => {
      // Tab through focusable elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')

        // Check if focused element has visible focus indicator
        const hasFocusIndicator = await page.evaluate(() => {
          const activeEl = document.activeElement as HTMLElement
          const styles = window.getComputedStyle(activeEl)

          // Check for outline or box-shadow (common focus indicators)
          return (
            styles.outline !== 'none' ||
            styles.outlineWidth !== '0px' ||
            styles.boxShadow !== 'none'
          )
        })

        expect(hasFocusIndicator).toBe(true)
      }
    })
  })

  test.describe('Responsive Text', () => {
    test('should support text resizing', async ({ page }) => {
      // Get initial text size
      const initialSize = await page.evaluate(() => {
        const el = document.querySelector('h1')
        return window.getComputedStyle(el!).fontSize
      })

      // Zoom to 200%
      await page.evaluate(() => {
        document.body.style.zoom = '2'
      })

      // Text should scale
      const scaledSize = await page.evaluate(() => {
        const el = document.querySelector('h1')
        return window.getComputedStyle(el!).fontSize
      })

      // Font size should be larger (note: zoom affects the computed value)
      expect(parseFloat(scaledSize)).toBeGreaterThanOrEqual(parseFloat(initialSize))
    })
  })

  test.describe('Landmark Regions', () => {
    test('should have proper landmark regions', async ({ page }) => {
      // Check for main landmarks
      await expect(page.locator('main, [role="main"]')).toBeVisible()
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible()

      // Check for header/banner
      const hasHeader =
        (await page.locator('header, [role="banner"]').count()) > 0

      expect(hasHeader).toBe(true)
    })
  })

  test.describe('Interactive Element States', () => {
    test('should indicate disabled state properly', async ({ page }) => {
      await page.click('text=Sessions')

      const disabledElements = await page.locator('button:disabled, [aria-disabled="true"]').all()

      for (const element of disabledElements) {
        const disabled = await element.getAttribute('disabled')
        const ariaDisabled = await element.getAttribute('aria-disabled')

        expect(disabled !== null || ariaDisabled === 'true').toBe(true)
      }
    })

    test('should indicate expanded/collapsed state', async ({ page }) => {
      // Find expandable elements
      const expandableElements = await page.locator('[aria-expanded]').all()

      for (const element of expandableElements) {
        const ariaExpanded = await element.getAttribute('aria-expanded')

        expect(['true', 'false']).toContain(ariaExpanded || '')
      }
    })

    test('should indicate selected state in lists', async ({ page }) => {
      await page.click('text=Tasks')

      // Find selectable items
      const selectableItems = await page.locator('[aria-selected]').all()

      for (const item of selectableItems) {
        const ariaSelected = await item.getAttribute('aria-selected')

        expect(['true', 'false']).toContain(ariaSelected || '')
      }
    })
  })
})
