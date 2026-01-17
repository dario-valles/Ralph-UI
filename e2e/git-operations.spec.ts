import { test, expect } from '@playwright/test'

test.describe('Git Operations (Phase 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Worktree Management', () => {
    test('should display worktree list', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Worktrees")')

      // Should show worktrees list
      await expect(page.locator('h2:has-text("Worktrees")')).toBeVisible()
      await expect(page.locator('[data-testid="worktree-list"]')).toBeVisible()
    })

    test('should create a new worktree', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Worktrees")')

      // Click create button
      await page.click('button:has-text("Create Worktree")')

      // Fill in form
      await page.fill('input[name="branch"]', 'feature/new-worktree')
      await page.fill('input[name="path"]', '/tmp/worktree-test')
      await page.click('button:has-text("Create")')

      // Should show success
      await expect(page.locator('text=Worktree created successfully')).toBeVisible({
        timeout: 5000,
      })

      // Should appear in list
      await expect(page.locator('text=feature/new-worktree')).toBeVisible()
    })

    test('should delete a worktree', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Worktrees")')

      // Click delete on a worktree
      await page.click('[data-testid="delete-worktree"]').first()

      // Confirm deletion
      await page.click('button:has-text("Confirm")')

      // Should show success
      await expect(page.locator('text=Worktree deleted')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should show worktree details', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Worktrees")')

      // Click on a worktree
      await page.click('[data-testid="worktree-item"]').first()

      // Should show details
      await expect(page.locator('text=Worktree Details')).toBeVisible()
      await expect(page.locator('text=Branch')).toBeVisible()
      await expect(page.locator('text=Path')).toBeVisible()
      await expect(page.locator('text=Status')).toBeVisible()
    })

    test('should switch to worktree', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Worktrees")')

      // Click switch button
      await page.click('[data-testid="switch-worktree"]').first()

      // Should show confirmation
      await expect(page.locator('text=Switched to worktree')).toBeVisible({
        timeout: 3000,
      })
    })

    test('should show worktree isolation status', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Worktrees")')

      // Should show isolation indicators
      await expect(page.locator('[data-testid="isolation-badge"]')).toBeVisible()
    })
  })

  test.describe('Branch Management', () => {
    test('should list all branches', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Should show branches list
      await expect(page.locator('h2:has-text("Branches")')).toBeVisible()
      await expect(page.locator('[data-testid="branch-list"]')).toBeVisible()

      // Should show current branch indicator
      await expect(page.locator('[data-current="true"]')).toBeVisible()
    })

    test('should create a new branch', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Click create button
      await page.click('button:has-text("New Branch")')

      // Fill in form
      await page.fill('input[name="branchName"]', 'feature/test-branch')
      await page.selectOption('select[name="baseBranch"]', 'main')
      await page.click('button:has-text("Create Branch")')

      // Should show success
      await expect(page.locator('text=Branch created')).toBeVisible({
        timeout: 5000,
      })

      // Should appear in list
      await expect(page.locator('text=feature/test-branch')).toBeVisible()
    })

    test('should switch branches', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Click on a branch
      await page.click('[data-testid="branch-item"]:not([data-current="true"])').first()

      // Click switch button
      await page.click('button:has-text("Switch")')

      // Should show confirmation
      await expect(page.locator('text=Switched to')).toBeVisible({
        timeout: 3000,
      })
    })

    test('should delete a branch', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Click delete on a non-current branch
      await page.click('[data-testid="delete-branch"]:not([data-current="true"])').first()

      // Confirm deletion
      await page.click('button:has-text("Confirm")')

      // Should show success
      await expect(page.locator('text=Branch deleted')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should merge branches', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Click merge button
      await page.click('button:has-text("Merge")')

      // Select source and target
      await page.selectOption('select[name="source"]', 'feature/branch-1')
      await page.selectOption('select[name="target"]', 'main')

      // Confirm merge
      await page.click('button:has-text("Merge Branches")')

      // Should show result
      await expect(
        page.locator('text=Merge successful, text=Merge conflicts detected').first()
      ).toBeVisible({
        timeout: 5000,
      })
    })

    test('should show branch graph', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Click graph view
      await page.click('button:has-text("Graph View")')

      // Should show visual graph
      await expect(page.locator('[data-testid="branch-graph"]')).toBeVisible()
      await expect(page.locator('svg, canvas').first()).toBeVisible()
    })
  })

  test.describe('Commit History', () => {
    test('should display commit history', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')

      // Should show commits list
      await expect(page.locator('h2:has-text("Commit History")')).toBeVisible()
      await expect(page.locator('[data-testid="commit-list"]')).toBeVisible()

      // Should show commit details
      await expect(page.locator('[data-testid="commit-hash"]').first()).toBeVisible()
      await expect(page.locator('[data-testid="commit-message"]').first()).toBeVisible()
      await expect(page.locator('[data-testid="commit-author"]').first()).toBeVisible()
    })

    test('should filter commits by branch', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')

      // Select branch filter
      await page.selectOption('select[name="branch"]', 'main')

      // Should show filtered commits
      await expect(page.locator('[data-branch="main"]')).toBeVisible()
    })

    test('should filter commits by author', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')

      // Select author filter
      await page.selectOption('select[name="author"]', 'Agent-1')

      // Should show filtered commits
      await expect(page.locator('[data-author="Agent-1"]')).toBeVisible()
    })

    test('should search commits', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')

      // Search for commit message
      await page.fill('input[placeholder*="Search commits"]', 'fix bug')

      // Should show matching commits
      await expect(page.locator('text=fix bug')).toBeVisible()
    })

    test('should view commit details', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')

      // Click on a commit
      await page.click('[data-testid="commit-item"]').first()

      // Should show commit details
      await expect(page.locator('text=Commit Details')).toBeVisible()
      await expect(page.locator('text=Files Changed')).toBeVisible()
      await expect(page.locator('text=Additions')).toBeVisible()
      await expect(page.locator('text=Deletions')).toBeVisible()
    })

    test('should show commit diff', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')
      await page.click('[data-testid="commit-item"]').first()

      // Click on a file to see diff
      await page.click('[data-testid="file-item"]').first()

      // Should show diff viewer
      await expect(page.locator('[data-testid="diff-viewer"]')).toBeVisible()
      await expect(page.locator('.diff-line').first()).toBeVisible()
    })
  })

  test.describe('Diff Viewer', () => {
    test('should compare two commits', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Diff")')

      // Select commits to compare
      await page.selectOption('select[name="commit1"]', 'abc123')
      await page.selectOption('select[name="commit2"]', 'def456')

      // Click compare
      await page.click('button:has-text("Compare")')

      // Should show diff
      await expect(page.locator('[data-testid="diff-viewer"]')).toBeVisible()
    })

    test('should display side-by-side diff', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Diff")')

      // View side-by-side
      await page.click('button:has-text("Side by Side")')

      // Should show two panes
      await expect(page.locator('[data-testid="diff-left"]')).toBeVisible()
      await expect(page.locator('[data-testid="diff-right"]')).toBeVisible()
    })

    test('should display unified diff', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Diff")')

      // View unified
      await page.click('button:has-text("Unified")')

      // Should show single pane with +/- indicators
      await expect(page.locator('.diff-line.addition').first()).toBeVisible()
      await expect(page.locator('.diff-line.deletion').first()).toBeVisible()
    })

    test('should filter diff by file', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Diff")')

      // Search for file
      await page.fill('input[placeholder*="Filter files"]', 'component.tsx')

      // Should show only matching files
      await expect(page.locator('text=component.tsx')).toBeVisible()
    })

    test('should show syntax highlighting in diff', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Diff")')

      // Should have syntax highlighting
      await expect(page.locator('.hljs, .syntax-highlight').first()).toBeVisible({
        timeout: 3000,
      })
    })
  })

  test.describe('Pull Request Management', () => {
    test('should create a pull request', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Pull Requests")')

      // Click create PR
      await page.click('button:has-text("Create PR")')

      // Fill in form
      await page.fill('input[name="title"]', 'Add new feature')
      await page.fill('textarea[name="description"]', 'This PR adds a new feature')
      await page.selectOption('select[name="source"]', 'feature/new-feature')
      await page.selectOption('select[name="target"]', 'main')

      // Submit
      await page.click('button:has-text("Create Pull Request")')

      // Should show success
      await expect(page.locator('text=Pull request created')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should list pull requests', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Pull Requests")')

      // Should show PRs list
      await expect(page.locator('[data-testid="pr-list"]')).toBeVisible()
      await expect(page.locator('[data-testid="pr-item"]').first()).toBeVisible()
    })

    test('should filter PRs by status', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Pull Requests")')

      // Filter by open
      await page.click('button:has-text("Open")')
      await expect(page.locator('[data-pr-status="open"]')).toBeVisible()

      // Filter by closed
      await page.click('button:has-text("Closed")')
      await expect(page.locator('[data-pr-status="closed"]')).toBeVisible()
    })

    test('should view PR details', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Pull Requests")')

      // Click on a PR
      await page.click('[data-testid="pr-item"]').first()

      // Should show PR details
      await expect(page.locator('text=Pull Request Details')).toBeVisible()
      await expect(page.locator('text=Files Changed')).toBeVisible()
      await expect(page.locator('text=Commits')).toBeVisible()
    })

    test('should close a pull request', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Pull Requests")')
      await page.click('[data-testid="pr-item"]').first()

      // Close PR
      await page.click('button:has-text("Close PR")')
      await page.click('button:has-text("Confirm")')

      // Should show closed status
      await expect(page.locator('text=Pull request closed')).toBeVisible({
        timeout: 3000,
      })
    })
  })

  test.describe('Git Integration with Agents', () => {
    test('should show git status for agent worktree', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Click git tab
      await page.click('button:has-text("Git Status")')

      // Should show git status
      await expect(page.locator('text=Branch')).toBeVisible()
      await expect(page.locator('text=Modified Files')).toBeVisible()
      await expect(page.locator('text=Untracked Files')).toBeVisible()
    })

    test('should auto-commit agent changes', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Enable auto-commit
      await page.click('input[name="autoCommit"]')

      // Should show confirmation
      await expect(page.locator('text=Auto-commit enabled')).toBeVisible()

      // Wait for agent to make changes and commit
      await page.waitForTimeout(2000)

      // Should show new commit
      await page.click('button:has-text("Git Status")')
      await expect(page.locator('[data-testid="recent-commit"]').first()).toBeVisible()
    })

    test('should create PR when agent completes task', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-testid="agent-card"]').first()

      // Enable auto-PR
      await page.click('input[name="autoCreatePR"]')

      // Simulate agent completion
      await page.click('[data-testid="complete-task-btn"]')

      // Should show PR created
      await expect(page.locator('text=Pull request created automatically')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should show git conflicts for agent', async ({ page }) => {
      await page.click('text=Agents')
      await page.click('[data-status="conflict"]').first()

      // Should show conflict indicator
      await expect(page.locator('text=Merge Conflicts Detected')).toBeVisible()

      // Click resolve
      await page.click('button:has-text("Resolve Conflicts")')

      // Should show conflict resolution UI
      await expect(page.locator('[data-testid="conflict-resolver"]')).toBeVisible()
    })
  })

  test.describe('Git Performance & Error Handling', () => {
    test('should handle large commit history efficiently', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Commits")')

      // Should load commits with pagination
      await expect(page.locator('[data-testid="pagination"]')).toBeVisible()

      // Load more commits
      await page.click('button:has-text("Load More")')

      // Should append commits
      const commitCount = await page.locator('[data-testid="commit-item"]').count()
      expect(commitCount).toBeGreaterThan(10)
    })

    test('should show loading state during git operations', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Create branch (slow operation)
      await page.click('button:has-text("New Branch")')
      await page.fill('input[name="branchName"]', 'slow-branch')
      await page.click('button:has-text("Create Branch")')

      // Should show loading indicator
      await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible()
    })

    test('should handle git errors gracefully', async ({ page }) => {
      await page.click('text=Git')
      await page.click('button:has-text("Branches")')

      // Try to create invalid branch
      await page.click('button:has-text("New Branch")')
      await page.fill('input[name="branchName"]', 'invalid branch name')
      await page.click('button:has-text("Create Branch")')

      // Should show error message
      await expect(page.locator('text=Invalid branch name')).toBeVisible({
        timeout: 3000,
      })
    })

    test('should retry failed git operations', async ({ page }) => {
      await page.click('text=Git')

      // Simulate network error
      await page.route('**/api/git/**', (route) => route.abort())

      // Try to fetch commits
      await page.click('button:has-text("Commits")')

      // Should show error with retry option
      await expect(page.locator('text=Failed to load commits')).toBeVisible()
      await expect(page.locator('button:has-text("Retry")')).toBeVisible()

      // Restore network and retry
      await page.unroute('**/api/git/**')
      await page.click('button:has-text("Retry")')

      // Should load successfully
      await expect(page.locator('[data-testid="commit-list"]')).toBeVisible({
        timeout: 5000,
      })
    })
  })
})
