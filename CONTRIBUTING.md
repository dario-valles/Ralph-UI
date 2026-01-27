# Contributing to Ralph UI

Thank you for your interest in contributing to Ralph UI! This document provides guidelines and information for contributors.

## 🚨 Important: Phase 1 Status

**Ralph UI is currently in Phase 1: Bug Fixes & Polish**

We are focusing on **stability and polish** before adding new features. At this stage, we are specifically looking for:

### ✅ What We Want
- **Bug reports** with reproduction steps
- **Bug fix PRs** that address existing issues
- **Polish improvements** (UX, performance, error handling)
- **Documentation fixes** and clarifications
- **Test coverage** for existing functionality

### ⏸️ What We're NOT Accepting (Yet)
- New feature proposals
- Major architectural changes
- Experimental features
- "Nice to have" enhancements

**Why?** We want to ensure Ralph UI is rock-solid and production-ready before expanding functionality. This prevents technical debt and ensures a stable foundation for future features.

### How to Contribute During Phase 1

1. **Check existing issues** - Look for `bug`, `polish`, or `good first issue` labels
2. **Reproduce bugs** - Confirm reported issues are reproducible
3. **Submit focused PRs** - One fix per PR, with clear description
4. **Add tests** - Ensure bug fixes include test coverage
5. **Document changes** - Update CLAUDE.md if behavior changes

**Phase 2 Planning:** We are collecting feature requests for Phase 2. Feel free to open issues with `feature-request` label, but note they will be evaluated after Phase 1 completion.

---

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Ralph-UI.git
   cd Ralph-UI
   ```
3. **Install dependencies**:
   ```bash
   bun install
   ```
4. **Set up the development environment** (see [CLAUDE.md](./CLAUDE.md) for details)

## Development Workflow

### Running the Project

```bash
# Terminal 1: Start the backend server
bun run server:dev

# Terminal 2: Start the frontend dev server
bun run dev
```

### Code Quality

Before submitting a PR, ensure your code passes all checks:

```bash
# Frontend
bun run lint          # ESLint (strict, 0 warnings allowed)
bun run test:run      # Unit tests
bun run typecheck     # TypeScript type checking

# Backend
bun run cargo:test    # Rust tests (650+ tests)
cargo clippy          # Rust linter
cargo fmt --check     # Rust formatting
```

### Commit Messages

We follow conventional commit messages:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example: `feat: add dark mode toggle to settings panel`

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** with clear, focused commits

3. **Write tests** for new functionality

4. **Update documentation** if needed (especially CLAUDE.md for development changes)

5. **Submit a pull request** with:
   - Clear title describing the change
   - Description of what and why
   - Screenshots for UI changes
   - Link to related issues

6. **Address review feedback** promptly

## Architecture Overview

- **Frontend**: React 19 + TypeScript, Zustand stores, shadcn/ui components
- **Backend**: Rust + Axum, file-based JSON storage, git2-rs

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for detailed file organization.

## Code Style

### TypeScript/React

- Use functional components with hooks
- Prefer Zustand stores for state management
- Follow mobile-first responsive design
- Use shadcn/ui components when possible

### Rust

- Follow standard Rust idioms
- Use `?` for error propagation
- Add tests for new functionality
- Document public APIs

## Reporting Issues

### Bug Reports (Priority during Phase 1)

When reporting bugs, please include:

1. **Clear title** describing the bug
2. **Steps to reproduce** (numbered list)
3. **Expected behavior**
4. **Actual behavior**
5. **Environment info:**
   - OS and version
   - Browser and version (if applicable)
   - Ralph UI version (`git rev-parse HEAD`)
   - Agent CLI version(s) being used
6. **Relevant logs:**
   - Server logs
   - Browser console errors
   - Screenshots/screen recordings
7. **Workarounds** (if you found any)

**Bug Report Template:**

```markdown
## Description
[One sentence summary]

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

## Additional Context
[Any other relevant info]
```

### Polish & Improvement Reports

Have an idea for making existing features better? We welcome:

- UX improvements (usability, accessibility)
- Performance optimizations
- Error handling improvements
- Code quality enhancements
- Documentation clarifications

**Polish Report Template:**

```markdown
## Area for Improvement
[What area of the app?]

## Current Behavior
[How it works now]

## Proposed Improvement
[Your suggestion]

## Benefits
[Why this helps users]
```

### Feature Requests (For Phase 2 Planning)

We're collecting feature requests for Phase 2! Please:

1. **Search existing issues** first
2. **Use `feature-request` label**
3. **Describe the use case** clearly
4. **Explain the benefit** to users
5. **Consider the scope** - small vs large features

**Note:** Feature requests will be reviewed and prioritized after Phase 1 completion. We appreciate your patience and input!

**Feature Request Template:**

```markdown
## Feature Description
[One sentence summary]

## Use Case
[Describe the scenario where this would be useful]

## Proposed Solution
[How you envision it working]

## Alternatives Considered
[Other approaches you thought of]

## Additional Context
[Examples, mockups, or references]
```

## Priority Labels

- `critical` - Crashes, data loss, security issues
- `high` - Major functionality broken
- `medium` - Minor bugs or annoyances
- `low` - Nice to have fixes
- `polish` - UX/performance improvements
- `feature-request` - For Phase 2 consideration

## Questions?

- Check [CLAUDE.md](./CLAUDE.md) for detailed development documentation
- Open a GitHub Discussion for general questions
- Open an Issue for bugs or feature requests

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
