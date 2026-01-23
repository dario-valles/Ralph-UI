# Test Suite: Git Operations

## Overview
Tests for git worktree management, branching, commits, diffs, and pull request workflows.

## Preconditions
- Application running at http://localhost:1420
- A git repository is configured as the project
- Git credentials configured (for push/PR operations)

---

## Test: View Repository Status

### Description
Verify git status display.

### Steps
1. **Navigate** to git section
   - Expected: Git view loads

2. **Verify** current branch displayed
   - Expected: Branch name visible

3. **Verify** uncommitted changes shown (if any)
   - Expected: Changed files listed

4. **Verify** ahead/behind status
   - Expected: Commits ahead/behind remote shown

### Expected Outcome
- Git status accurately reflects repository state

---

## Test: Create Worktree

### Description
Verify git worktree creation.

### Steps
1. **Navigate** to worktrees section
   - Expected: Worktree management view loads

2. **Click** "Create Worktree" button
   - Expected: Worktree creation dialog opens

3. **Fill** branch name for worktree
   - Expected: Name entered

4. **Fill** worktree path (or use default)
   - Expected: Path set

5. **Click** create button
   - Expected: Worktree created

6. **Verify** worktree appears in list
   - Expected: New worktree visible

### Expected Outcome
- Git worktree created successfully

---

## Test: List Worktrees

### Description
Verify worktree listing.

### Steps
1. **Navigate** to worktrees section
   - Expected: Worktrees list loads

2. **Verify** main worktree listed
   - Expected: Main branch worktree shown

3. **Verify** additional worktrees listed
   - Expected: All worktrees visible

4. **Verify** worktree details
   - Expected: Path and branch shown for each

### Expected Outcome
- All worktrees are listed with details

---

## Test: Switch Worktree

### Description
Verify switching between worktrees.

### Steps
1. **Navigate** to worktrees section
   - Expected: Worktrees list loads

2. **Click** on a worktree to select
   - Expected: Worktree selected

3. **Click** switch/activate button
   - Expected: Worktree activated

4. **Verify** active worktree indicator
   - Expected: Current worktree highlighted

### Expected Outcome
- Can switch between worktrees

---

## Test: Delete Worktree

### Description
Verify worktree deletion.

### Steps
1. **Navigate** to worktrees section
   - Expected: Worktrees list loads

2. **Click** delete on a worktree
   - Expected: Confirmation dialog appears

3. **Confirm** deletion
   - Expected: Worktree deleted

4. **Verify** worktree removed from list
   - Expected: Worktree no longer visible

### Expected Outcome
- Worktree deleted successfully

---

## Test: Create Branch

### Description
Verify branch creation.

### Steps
1. **Navigate** to branches section
   - Expected: Branch management loads

2. **Click** "Create Branch" button
   - Expected: Branch creation dialog opens

3. **Fill** branch name
   - Expected: Name entered

4. **Select** base branch (optional)
   - Expected: Base selected

5. **Click** create button
   - Expected: Branch created

6. **Verify** branch in list
   - Expected: New branch visible

### Expected Outcome
- New branch created successfully

---

## Test: List Branches

### Description
Verify branch listing.

### Steps
1. **Navigate** to branches section
   - Expected: Branches list loads

2. **Verify** local branches listed
   - Expected: Local branches visible

3. **Verify** remote branches listed (if applicable)
   - Expected: Remote branches visible

4. **Verify** current branch indicated
   - Expected: Active branch highlighted

### Expected Outcome
- All branches listed with current highlighted

---

## Test: Switch Branch

### Description
Verify branch switching.

### Steps
1. **Navigate** to branches section
   - Expected: Branches list loads

2. **Click** on a branch
   - Expected: Branch selected

3. **Click** switch/checkout button
   - Expected: Branch checkout initiated

4. **Verify** current branch changed
   - Expected: New branch is active

### Expected Outcome
- Branch switched successfully

---

## Test: Delete Branch

### Description
Verify branch deletion.

### Steps
1. **Navigate** to branches section
   - Expected: Branches list loads

2. **Click** delete on a branch
   - Expected: Confirmation appears

3. **Confirm** deletion
   - Expected: Branch deleted

4. **Verify** branch removed from list
   - Expected: Branch no longer visible

### Expected Outcome
- Branch deleted successfully

---

## Test: View Commit History

### Description
Verify commit history display.

### Steps
1. **Navigate** to commits section
   - Expected: Commit history loads

2. **Verify** commits listed
   - Expected: Recent commits visible

3. **Verify** commit details
   - Expected: Message, author, date shown

4. **Verify** commit hash displayed
   - Expected: Short hash visible

### Expected Outcome
- Commit history displays correctly

---

## Test: View Commit Details

### Description
Verify individual commit details.

### Steps
1. **Navigate** to commits section
   - Expected: Commit list loads

2. **Click** on a commit
   - Expected: Commit detail view opens

3. **Verify** full commit message
   - Expected: Complete message shown

4. **Verify** changed files listed
   - Expected: Files modified in commit

5. **Verify** diff available
   - Expected: Can view changes

### Expected Outcome
- Commit details show full information

---

## Test: View Diff

### Description
Verify diff viewer functionality.

### Steps
1. **Navigate** to changes or diff view
   - Expected: Diff viewer loads

2. **Select** a changed file
   - Expected: File diff displayed

3. **Verify** additions highlighted
   - Expected: Added lines in green

4. **Verify** deletions highlighted
   - Expected: Removed lines in red

5. **Verify** context lines shown
   - Expected: Surrounding unchanged lines visible

### Expected Outcome
- Diff viewer shows changes clearly

---

## Test: Stage Changes

### Description
Verify staging files for commit.

### Steps
1. **Navigate** to changes view
   - Expected: Uncommitted changes listed

2. **Click** stage button on a file
   - Expected: File staged

3. **Verify** file moves to staged section
   - Expected: File in staged list

4. **Click** unstage button
   - Expected: File unstaged

5. **Verify** file returns to unstaged
   - Expected: File back in changes list

### Expected Outcome
- Files can be staged and unstaged

---

## Test: Create Commit

### Description
Verify commit creation.

### Steps
1. **Navigate** to changes view
   - Expected: Changes displayed

2. **Stage** files to commit
   - Expected: Files staged

3. **Fill** commit message
   - Expected: Message entered

4. **Click** commit button
   - Expected: Commit created

5. **Verify** commit in history
   - Expected: New commit appears

### Expected Outcome
- Commit created with staged changes

---

## Test: Push Changes

### Description
Verify pushing to remote.

### Steps
1. **Navigate** to git view with unpushed commits
   - Expected: Commits ahead of remote

2. **Click** push button
   - Expected: Push initiated

3. **Verify** push progress
   - Expected: Progress indicator shown

4. **Verify** push success
   - Expected: Success message or status

### Expected Outcome
- Changes pushed to remote

---

## Test: Pull Changes

### Description
Verify pulling from remote.

### Steps
1. **Navigate** to git view with remote changes
   - Expected: Commits behind remote shown

2. **Click** pull button
   - Expected: Pull initiated

3. **Verify** pull progress
   - Expected: Progress shown

4. **Verify** pull success
   - Expected: Local updated

### Expected Outcome
- Changes pulled from remote

---

## Test: Create Pull Request

### Description
Verify PR creation workflow.

### Steps
1. **Navigate** to branch with changes
   - Expected: Branch has commits

2. **Click** "Create Pull Request" button
   - Expected: PR creation dialog opens

3. **Fill** PR title
   - Expected: Title entered

4. **Fill** PR description
   - Expected: Description entered

5. **Select** target branch
   - Expected: Base branch selected

6. **Click** create PR button
   - Expected: PR created

7. **Verify** PR link or confirmation
   - Expected: PR URL or success message

### Expected Outcome
- Pull request created successfully

---

## Test: View Pull Request List

### Description
Verify PR listing.

### Steps
1. **Navigate** to pull requests section
   - Expected: PR list loads

2. **Verify** open PRs listed
   - Expected: Open PRs visible

3. **Verify** PR details
   - Expected: Title, author, status shown

### Expected Outcome
- Pull requests are listed

---

## Test: View Pull Request Details

### Description
Verify PR detail view.

### Steps
1. **Navigate** to PR list
   - Expected: PRs loaded

2. **Click** on a PR
   - Expected: PR detail opens

3. **Verify** PR title and description
   - Expected: Full details shown

4. **Verify** changed files
   - Expected: Files in PR listed

5. **Verify** comments (if any)
   - Expected: PR comments visible

### Expected Outcome
- PR details display completely

---

## Test: Merge Pull Request

### Description
Verify PR merge workflow.

### Steps
1. **Navigate** to PR detail
   - Expected: PR detail loads

2. **Verify** merge button available
   - Expected: Merge option shown

3. **Click** merge button
   - Expected: Merge confirmation

4. **Select** merge type (if options)
   - Expected: Merge/squash/rebase option

5. **Confirm** merge
   - Expected: PR merged

6. **Verify** merge success
   - Expected: Merged status shown

### Expected Outcome
- Pull request merged successfully

---

## Test: Git Integration with Agent

### Description
Verify agent git operations.

### Steps
1. **Navigate** to session with active agent
   - Expected: Agent running

2. **Verify** agent can make commits
   - Expected: Commits from agent visible

3. **Verify** commits attributed to agent
   - Expected: Author shows agent info

4. **Verify** changes in correct worktree
   - Expected: Changes isolated to worktree

### Expected Outcome
- Agent git operations work correctly

---

## Test: Resolve Merge Conflict

### Description
Verify merge conflict resolution.

### Steps
1. **Navigate** to git view with conflict
   - Expected: Conflict indicator visible

2. **Click** on conflicted file
   - Expected: Conflict view opens

3. **Verify** conflict markers shown
   - Expected: <<<, ===, >>> markers

4. **Select** resolution (ours/theirs/manual)
   - Expected: Resolution option chosen

5. **Save** resolved file
   - Expected: Conflict marked resolved

6. **Complete** merge
   - Expected: Merge completes

### Expected Outcome
- Merge conflicts can be resolved

---

## Test: Stash Changes

### Description
Verify git stash functionality.

### Steps
1. **Navigate** to git view with uncommitted changes
   - Expected: Changes visible

2. **Click** stash button
   - Expected: Stash dialog opens

3. **Fill** stash message (optional)
   - Expected: Message entered

4. **Click** stash button
   - Expected: Changes stashed

5. **Verify** working directory clean
   - Expected: No uncommitted changes

### Expected Outcome
- Changes stashed successfully

---

## Test: Apply Stash

### Description
Verify stash application.

### Steps
1. **Navigate** to stash list
   - Expected: Stashes listed

2. **Click** apply on a stash
   - Expected: Stash applied

3. **Verify** changes restored
   - Expected: Stashed changes back

### Expected Outcome
- Stash applied successfully

---

## Test: View Blame

### Description
Verify git blame view.

### Steps
1. **Navigate** to file viewer
   - Expected: File content displayed

2. **Click** blame option
   - Expected: Blame view activates

3. **Verify** commit info per line
   - Expected: Author and commit shown

4. **Click** on blame entry
   - Expected: Commit details shown

### Expected Outcome
- Blame shows line-by-line history

---

## Test: Cherry Pick Commit

### Description
Verify cherry-pick functionality.

### Steps
1. **Navigate** to commit history
   - Expected: Commits listed

2. **Click** cherry-pick on a commit
   - Expected: Cherry-pick dialog

3. **Select** target branch
   - Expected: Branch selected

4. **Confirm** cherry-pick
   - Expected: Commit applied

5. **Verify** commit in target branch
   - Expected: Commit appears

### Expected Outcome
- Commit cherry-picked successfully

---

## Test: Revert Commit

### Description
Verify commit revert.

### Steps
1. **Navigate** to commit history
   - Expected: Commits listed

2. **Click** revert on a commit
   - Expected: Revert confirmation

3. **Confirm** revert
   - Expected: Revert commit created

4. **Verify** revert commit in history
   - Expected: Revert commit visible

### Expected Outcome
- Commit reverted with new commit

---

## Test: View Tags

### Description
Verify tag listing.

### Steps
1. **Navigate** to tags section
   - Expected: Tags list loads

2. **Verify** tags listed
   - Expected: Repository tags visible

3. **Verify** tag details
   - Expected: Name, commit, date shown

### Expected Outcome
- Tags are listed correctly

---

## Test: Create Tag

### Description
Verify tag creation.

### Steps
1. **Navigate** to tags section
   - Expected: Tags view loads

2. **Click** create tag button
   - Expected: Tag creation dialog

3. **Fill** tag name
   - Expected: Name entered

4. **Fill** tag message (for annotated)
   - Expected: Message entered

5. **Click** create
   - Expected: Tag created

6. **Verify** tag in list
   - Expected: New tag visible

### Expected Outcome
- Tag created successfully

---

## Test: Fetch Remote

### Description
Verify fetching from remote.

### Steps
1. **Navigate** to git view
   - Expected: Git view loads

2. **Click** fetch button
   - Expected: Fetch initiated

3. **Verify** fetch progress
   - Expected: Progress shown

4. **Verify** remote refs updated
   - Expected: Remote branches current

### Expected Outcome
- Remote fetched successfully

---

## Test: View Remote Configuration

### Description
Verify remote configuration display.

### Steps
1. **Navigate** to git settings/remotes
   - Expected: Remotes listed

2. **Verify** remote URL shown
   - Expected: Origin URL visible

3. **Verify** remote name
   - Expected: "origin" or custom name

### Expected Outcome
- Remote configuration displayed

---

## Test: Git Hooks Status

### Description
Verify git hooks information.

### Steps
1. **Navigate** to git settings
   - Expected: Settings view loads

2. **Verify** hooks information (if available)
   - Expected: Active hooks listed

### Expected Outcome
- Git hooks status visible
