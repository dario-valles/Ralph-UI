# Ralph UI

**A modern application for orchestrating autonomous AI coding agents using the Ralph Wiggum Loop technique. Access via browser from any device on your network.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19+-61DAFB.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)

---

## What is Ralph UI?

Ralph UI provides a beautiful, intuitive interface for the **Ralph Wiggum Loop** - an autonomous AI development technique that enables AI agents to work continuously on software development tasks using the filesystem and git history as long-term memory.

### Key Features

- **Browser Access** - Access from any device on your network via HTTP/WebSocket
- **Mission Control** - Bird's-eye view of all projects and active agents
- **Multi-Project Support** - Manage multiple projects with VS Code-style project switching
- **Multi-Agent Orchestration** - Run multiple AI agents in parallel with complete isolation
- **Real-Time Monitoring** - Watch your agents work with live terminal output and status updates
- **AI-Powered PRD Creation** - Interactive chat interface for creating PRDs with AI assistance
- **Git Integration** - Automatic worktree management, branching, and PR creation
- **Cost Tracking** - Monitor token usage and costs across all agents
- **Session Persistence** - Pause, resume, and recover sessions at any time
- **PRD Management** - Create PRDs from templates with quality scoring and one-click execution

---

## Technology Stack

**Frontend:**
- React 19 with TypeScript
- Tailwind CSS + shadcn/ui
- Zustand for state management
- xterm.js for terminal emulation

**Backend:**
- Rust with Axum HTTP/WebSocket server
- File-based JSON storage in `.ralph-ui/`
- git2-rs for git operations
- tokio for async I/O
- portable-pty for terminal emulation

**Development:**
- Bun for fast package management
- Vite for blazing-fast builds
- Vitest for unit testing, markdown E2E tests with LLM browser automation

---

## Getting Started

### Prerequisites

- **Rust:** 1.75+ (install from [rustup.rs](https://rustup.rs))
- **Bun:** 1.2+ (recommended) or Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/Ralph-UI.git
cd Ralph-UI

# Install dependencies
bun install

# Start the backend server (Terminal 1)
bun run server:dev

# Start the frontend dev server (Terminal 2)
bun run dev

# Open http://localhost:1420 in your browser
# Enter the auth token displayed by the server

# Run tests
bun run test           # Frontend tests
bun run cargo:test     # Backend tests

# Build for production
bun run cargo:build    # Backend binary
bun run build          # Frontend assets
```

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

---

## Documentation

- **[Quick Start Guide](./QUICK_START.md)** - Developer setup and getting started
- **[Project Structure](./PROJECT_STRUCTURE.md)** - File organization and architecture
- **[CLAUDE.md](./CLAUDE.md)** - Detailed development instructions and commands

---

## What is the Ralph Wiggum Loop?

The Ralph Wiggum Loop (named after the beloved Simpsons character) is an autonomous AI development technique where:

1. **Infinite Iteration:** AI agents run in loops until all tasks are complete
2. **Filesystem Memory:** Progress persists in files and git history, not LLM context
3. **Fresh Context:** When context fills up, a new agent starts with fresh memory
4. **Autonomous Operation:** Agents can work for hours without human intervention

Originally coined by Geoffrey Huntley, this technique represents a paradigm shift in AI-assisted development, with community members reporting 14+ hour autonomous sessions successfully upgrading entire codebases.

---

## Supported AI Agents

- **Claude Code** (Anthropic's official CLI) - Fully integrated
- **OpenCode** (Open source alternative) - Fully integrated
- **Cursor Agent** - Integrated
- **Codex CLI** (OpenAI) - Integrated

---

## Advanced Features

### Dry-Run Mode
Preview execution without spawning agents or creating branches. Toggle in the PRD Execution dialog to validate your PRD and configuration before committing resources.

### @filename Syntax
Reference file contents in prompts using `@filename` syntax:
```
Check @README.md for project context
Look at @src/main.rs for the entry point
```
Files are automatically injected into agent prompts.

### Progress File Tracking
Sessions persist progress to `.ralph-ui/` directories within each project for recovery after interruptions. Tracks task state changes with timestamps.

### Graceful Shutdown
Signal handlers (SIGINT, SIGTERM, SIGHUP) ensure clean shutdown:
- Stops all running agents
- Cleans up worktrees
- Preserves committed branches

### Server Commands

```bash
bun run server           # Production server (port 3420)
bun run server:dev       # Development mode (faster builds)
bun run server:dev:token # Dev mode with fixed token (persists across restarts)
```

### Feature Availability

| Feature | Status |
|---------|--------|
| All UI features | ✓ |
| Real-time events (WebSocket) | ✓ |
| Live terminal output (WebSocket PTY) | ✓ |
| File watching | ✓ |
| Directory browser | ✓ |

See [CLAUDE.md](./CLAUDE.md) for detailed server documentation including authentication, endpoints, and architecture.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Ralph UI                            │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                          │
│  - Mission Control with multi-project overview          │
│  - Task list with dependency tracking                   │
│  - Agent monitor with live terminal output              │
│  - PRD creation with AI chat interface                  │
│  - Git timeline and PR management                       │
├─────────────────────────────────────────────────────────┤
│  Backend (Rust + Axum)                                  │
│  - HTTP/WebSocket server                                │
│  - Task engine (PRD parsing, state tracking)            │
│  - Git manager (worktrees, branches, commits)           │
│  - Agent manager (spawn, monitor, kill, PTY)            │
│  - File storage (.ralph-ui/ JSON files)                 │
├─────────────────────────────────────────────────────────┤
│  External Integrations                                  │
│  - Claude Code CLI, OpenCode CLI                        │
│  - GitHub API (Issues, PRs)                             │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment

### Docker

```dockerfile
FROM rust:latest AS builder
WORKDIR /app
COPY server .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/ralph-ui /usr/local/bin/
EXPOSE 3420
CMD ["ralph-ui", "--bind", "0.0.0.0"]
```

### Binary

```bash
# Build release binary (14MB)
bun run cargo:build

# Run directly
./server/target/release/ralph-ui --port 3420 --bind 0.0.0.0
```

---

## Related Projects

- **[ralph-tui](https://github.com/subsy/ralph-tui)** - Terminal UI implementation (TypeScript/Bun)
- **[ralphy](https://github.com/michaelshimeles/ralphy)** - Bash automation tool for Ralph Loop
- **[ralph](https://github.com/snarktank/ralph)** - Autonomous AI agent loop CLI

Ralph UI aims to provide the most comprehensive graphical interface for the Ralph ecosystem.

---

## Contributing

We welcome contributions! This project is in active development.

### How to Contribute

1. Check the [Project Structure](./PROJECT_STRUCTURE.md) to understand the codebase
2. Look for issues tagged with `good-first-issue` or `help-wanted`
3. Fork the repository and create a feature branch
4. Make your changes with tests
5. Submit a pull request with a clear description

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Binary Size | ~14 MB |
| Startup Time | < 1s |
| Memory Usage | < 100 MB idle, < 300 MB with 5 agents |
| UI Responsiveness | < 100ms for all interactions |

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Geoffrey Huntley** for pioneering the Ralph Wiggum Loop technique
- **Anthropic** for Claude Code and official Ralph Wiggum plugin
- **ralph-tui team** for inspiration and architectural patterns

---

**Built with Rust, Axum, React, and TypeScript**

*Making autonomous AI development accessible, transparent, and delightful.*
