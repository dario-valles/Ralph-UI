# Phase 1: Bug Fixes & Polish - Community Guide

## Overview

Ralph UI is currently in **Phase 1: Bug Fixes & Polish**. We are focusing on stability and polish before adding new features.

## What This Means

### ✅ We Want (Phase 1)

- **Bug Reports** - Help us find and fix issues
- **Bug Fix PRs** - Pull requests that fix existing bugs
- **Polish Improvements** - UX, performance, error handling
- **Documentation** - Better docs, guides, clarifications
- **Test Coverage** - Tests for existing functionality

### ⏸️ We're NOT Accepting (Yet)

- ❌ New feature implementations
- ❌ Major architectural changes
- ❌ Experimental features
- ❌ "Nice to have" enhancements

**Why?** Building a solid foundation prevents technical debt and ensures Ralph UI is production-ready before expanding functionality.

---

## How to Contribute

### 1. Find Something to Work On

**Check GitHub Issues:**
- Look for labels: `bug`, `polish`, `good first issue`
- Filter by: `label:bug` or `label:polish`
- Comment that you're working on it to avoid duplication

### 2. Report a Bug

Use the **Bug Report** template when creating a new issue:

```markdown
## Bug Description
[Clear summary]

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- OS:
- Browser:
- Ralph UI:
- Agent:

## Logs
[Relevant error messages]
```

### 3. Suggest Polish Improvements

Use the **Polish & Improvement** template for:

- UX enhancements
- Performance optimizations
- Better error messages
- Code quality improvements
- Accessibility improvements

### 4. Submit a Bug Fix PR

1. **Fork and branch:**
   ```bash
   git checkout -b fix/your-bug-fix
   ```

2. **Make focused changes** - One bug fix per PR

3. **Add tests** - Ensure the bug is covered by tests

4. **Update docs** - If behavior changes, update CLAUDE.md

5. **PR title format:**
   ```
   fix(area): brief description
   # Example: fix(agents): handle agent crash gracefully
   ```

6. **PR description should include:**
   - What bug you're fixing
   - How you fixed it
   - Before/after screenshots (if UI change)
   - Related issue number

### 5. Feature Ideas (Phase 2 Planning)

Have a great feature idea? We'd love to hear it!

- Use the **Feature Request** template
- Label will be `feature-request`
- We'll evaluate after Phase 1 completion
- Helps us plan Phase 2 roadmap

---

## Files Added

### 1. Updated README.md
- ✅ Prominent Phase 1 notice at top
- ✅ Clear focus on stability
- ✅ Link to CONTRIBUTING.md

### 2. Updated CONTRIBUTING.md
- ✅ Phase 1 section explaining current focus
- ✅ Bug report template
- ✅ Polish report template
- ✅ Feature request process
- ✅ Priority labels guide

### 3. GitHub Issue Templates
- ✅ **bug_report.md** - Structured bug reports
- ✅ **polish_request.md** - UX/performance improvements
- ✅ **feature_request.md** - Phase 2 ideas

---

## Response Templates

### When Someone Opens a Bug Report

```
🙏 Thanks for reporting this bug!

To help us fix this faster, could you please:
1. Provide steps to reproduce
2. Share relevant logs (server + browser console)
3. Include your environment details (OS, browser, versions)

Once we have this info, we can triage and prioritize the fix.
```

### When Someone Submits a Feature Request

```
🚀 Great feature idea! Thanks for sharing.

Since we're currently in Phase 1 (bug fixes & polish), we've
labeled this as `feature-request` for Phase 2 planning.

We'll review and prioritize all feature requests after Phase 1
completion. We appreciate your understanding and patience!

In the meantime, feel free to:
- Report any bugs you encounter
- Suggest polish improvements
- Submit PRs for bug fixes
```

### When Someone Opens a Great Polish Issue

```
✨ Excellent polish suggestion!

This aligns perfectly with our Phase 1 focus. Would you be
interested in submitting a PR? We'd be happy to review it.

If you need guidance, check out CONTRIBUTING.md or let us know
what questions you have.
```

---

## Label Guide

When creating or triaging issues, use these labels:

### Priority
- `critical` - Crashes, data loss, security
- `high` - Major functionality broken
- `medium` - Minor bugs or annoyances
- `low` - Nice to have fixes

### Type
- `bug` - Confirmed bug
- `polish` - UX/performance/quality improvement
- `feature-request` - For Phase 2
- `documentation` - Docs need improvement

### Status
- `confirmed` - Issue reproduced/confirmed
- `in-progress` - Someone is working on it
- `needs-info` - Need more details from reporter
- `good first issue` - Good for new contributors

---

## Example Workflow

### Scenario: User Reports a Bug

**User creates issue:**
```
[BUG] Agent crashes when session exceeds 100 messages
```

**Maintainer response:**
```
🙏 Thanks for reporting! A few questions:
1. Which agent are you using? (Claude, Cursor, etc.)
2. Can you share the agent's terminal output?
3. What's your Ralph UI version? (git rev-parse HEAD)
```

**User provides details:**
```
- Using Claude Code 1.0
- Terminal shows: "Context window exceeded"
- Ralph UI: commit abc123
```

**Maintainer triages:**
```
✅ Confirmed - Session resumption not triggering
Label: bug, high, confirmed
Milestone: Phase 1
```

**Contributor picks it up:**
```
@maintainer I'd like to work on this!
```

**Maintainer:**
```
✅ Assigned! Check out server/src/agents/ for session handling.
Let me know if you need guidance.
```

**Contributor submits PR:**
```
fix(agents): trigger session resumption before context limit

- Check context usage at 90% instead of 100%
- Gracefully resume session with --resume flag
- Add test for context threshold detection

Fixes #123
```

**Maintainer reviews & merges:**
```
✅ Merged! Thanks for the fix!
Closing #123
```

---

## FAQ for Contributors

### Q: Can I still implement a feature if I really want to?

A: We'd prefer you focus on bugs/polish during Phase 1. If you feel strongly about a feature, open a `feature-request` issue and we can discuss. Features that directly support stability might be considered case-by-case.

### Q: How long will Phase 1 last?

A: As long as needed to achieve stability. We don't have a fixed timeline - quality is more important than speed. We'll announce Phase 2 when we're confident Ralph UI is rock-solid.

### Q: Can I still ask questions about planned features?

A: Absolutely! Use GitHub Discussions for questions. We're happy to talk about future plans - we just won't implement them during Phase 1.

### Q: What if I find a bug while working on another bug?

A: Create a separate issue for each bug. This helps us track and prioritize them individually. You can mention they're related.

### Q: Can I submit multiple small polish improvements in one PR?

A: Generally no - keep PRs focused on one change. This makes code review easier and ensures we can merge improvements incrementally. If they're tightly related (e.g., fixing 3 related UX issues in one component), discuss it in the issue first.

---

## Success Metrics

We'll know Phase 1 is complete when:

- ✅ No critical bugs open
- ✅ High-priority bugs addressed
- ✅ Key polish improvements implemented
- ✅ Test coverage adequate (80%+ targets met)
- ✅ Documentation comprehensive and clear
- ✅ Stable for 2+ weeks of daily use without major issues

---

## Questions?

- **Contributing:** See [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Development:** See [CLAUDE.md](./CLAUDE.md)
- **Architecture:** See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- **Discussions:** Use [GitHub Discussions](https://github.com/dario-valles/Ralph-UI/discussions)

---

**Thank you for helping make Ralph UI stable and polished!** 🙏✨
