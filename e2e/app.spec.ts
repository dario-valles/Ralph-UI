import { test, expect } from '@playwright/test'

test('has title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Ralph UI/)
})

test('renders main content', async ({ page }) => {
  await page.goto('/')
  const main = page.locator('main')
  await expect(main).toBeVisible()
})
