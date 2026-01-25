# Contributing to Ralph UI

Thank you for your interest in contributing to Ralph UI! This document provides guidelines and information for contributors.

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

When reporting bugs, please include:

1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Environment (OS, browser, versions)
5. Relevant logs or screenshots

## Feature Requests

Feature requests are welcome! Please:

1. Check existing issues first
2. Describe the use case
3. Explain why it would benefit others

## Questions?

- Check [CLAUDE.md](./CLAUDE.md) for detailed development documentation
- Open a GitHub Discussion for general questions
- Open an Issue for bugs or feature requests

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
