# Ralph UI

**A modern cross-platform desktop and mobile application for orchestrating autonomous AI coding agents using the Ralph Wiggum Loop technique.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)

---

## What is Ralph UI?

Ralph UI provides a beautiful, intuitive interface for the **Ralph Wiggum Loop** - an autonomous AI development technique that enables AI agents to work continuously on software development tasks using the filesystem and git history as long-term memory.

### Key Features

🤖 **Multi-Agent Orchestration** - Run multiple AI agents in parallel with complete isolation
📊 **Real-Time Monitoring** - Watch your agents work with live terminal output and status updates
🌳 **Git Integration** - Automatic worktree management, branching, and PR creation
💰 **Cost Tracking** - Monitor token usage and costs across all agents
⚡ **Session Persistence** - Pause, resume, and recover sessions at any time
📱 **Cross-Platform** - Desktop (Windows, macOS, Linux) ready, Mobile (iOS, Android) planned
🎯 **Task Management** - Import tasks from PRDs, YAML, JSON, or create from templates
📝 **PRD Management** - Create PRDs from templates with quality scoring and one-click execution

---

## Why Tauri 2.0?

Ralph UI is built with **Tauri 2.0**, the cutting-edge framework for cross-platform desktop and mobile applications:

- **Tiny Bundle Size:** 3-10 MB vs Electron's 100+ MB
- **Low Memory Usage:** 30-40 MB vs Electron's 200-300 MB
- **Fast Startup:** 0.4s vs Electron's 1.5s
- **Mobile Support:** iOS and Android from a single codebase
- **Secure:** Rust backend with memory safety and narrow permissions
- **Efficient:** Native OS WebView instead of bundled browser

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the complete framework evaluation.

---

## Technology Stack

**Frontend:**
- React 18+ with TypeScript
- Tailwind CSS + shadcn/ui
- xterm.js for terminal emulation
- Zustand for state management

**Backend:**
- Rust with Tauri 2.0
- SQLite for data persistence
- git2-rs for git operations
- tokio for async I/O

**Development:**
- Bun for fast package management
- Vite for blazing-fast builds
- Vitest + Playwright for testing

---

## Project Status

✅ **Status:** Production Ready (Phases 1-7.5 Complete)
📅 **Started:** January 17, 2026
🎯 **Desktop MVP:** ✅ Complete
🎯 **Mobile Release:** Phase 8 (In Planning)

**Test Coverage:** 500+ tests (139 unit + 240+ E2E + 150+ backend)

See [PHASES_COMPLETION.md](./PHASES_COMPLETION.md) for detailed completion report.

---

## Getting Started

### Prerequisites

- **Rust:** 1.75+ (install from [rustup.rs](https://rustup.rs))
- **Node.js:** 18+ or **Bun:** 1.2+ (recommended)
- **Tauri CLI:** `cargo install tauri-cli`

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/Ralph-UI.git
cd Ralph-UI

# Install dependencies
bun install

# Run in development mode
bun run tauri dev

# Run tests
bun test

# Build for production
bun run tauri build
```

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

---

## Documentation

- **[Phases Completion Report](./PHASES_COMPLETION.md)** - Complete status of all implemented phases
- **[Phase 7.5 Details](./PHASE_7.5_COMPLETION.md)** - PRD management and one-click execution
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Comprehensive development roadmap
- **[Framework Decision](./FRAMEWORK_DECISION.md)** - Why we chose Tauri 2.0
- **[Quick Start Guide](./QUICK_START.md)** - Developer setup and getting started
- **[Project Structure](./PROJECT_STRUCTURE.md)** - File organization and architecture

---

## What is the Ralph Wiggum Loop?

The Ralph Wiggum Loop (named after the beloved Simpsons character) is an autonomous AI development technique where:

1. **Infinite Iteration:** AI agents run in loops until all tasks are complete
2. **Filesystem Memory:** Progress persists in files and git history, not LLM context
3. **Fresh Context:** When context fills up, a new agent starts with fresh memory
4. **Autonomous Operation:** Agents can work for hours without human intervention

Originally coined by Geoffrey Huntley, this technique represents a paradigm shift in AI-assisted development, with community members reporting 14+ hour autonomous sessions successfully upgrading entire codebases.

### Learn More

- [2026 - The Year of the Ralph Loop Agent](https://dev.to/alexandergekov/2026-the-year-of-the-ralph-loop-agent-1gkj)
- [Ralph Loop for Deep Agents: Building Autonomous AI](https://medium.com/ai-artistry/ralph-loop-for-deep-agents-building-autonomous-ai-that-just-keeps-going-cb4da3a09b37)
- [What is Ralph Loop? A New Era of Autonomous Coding](https://medium.com/@tentenco/what-is-ralph-loop-a-new-era-of-autonomous-coding-96a4bb3e2ac8)
- [The Ralph Wiggum Technique: Ship Code While You Sleep](https://ai-checker.webcoda.com.au/articles/ralph-wiggum-technique-claude-code-autonomous-loops-2026)

---

## Related Projects

- **[ralph-tui](https://github.com/subsy/ralph-tui)** - Terminal UI implementation (TypeScript/Bun)
- **[ralphy](https://github.com/michaelshimeles/ralphy)** - Bash automation tool for Ralph Loop
- **[ralph](https://github.com/snarktank/ralph)** - Autonomous AI agent loop CLI

Ralph UI aims to provide the most comprehensive graphical interface for the Ralph ecosystem.

---

## Supported AI Agents

- ✅ **Claude Code** (Anthropic's official CLI) - Fully integrated
- ✅ **OpenCode** (Open source alternative) - Fully integrated
- ✅ **Cursor Agent** - Integrated
- 🚧 **Custom Agents** (Plugin system planned for Phase 9)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Ralph UI (Tauri)                    │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                          │
│  - Dashboard with real-time metrics                     │
│  - Task list with dependency tracking                   │
│  - Agent monitor with live terminal output              │
│  - Git timeline and PR management                       │
├─────────────────────────────────────────────────────────┤
│  Backend (Rust)                                         │
│  - Task engine (PRD parsing, state tracking)            │
│  - Git manager (worktrees, branches, commits)           │
│  - Agent manager (spawn, monitor, kill)                 │
│  - Storage layer (SQLite)                               │
├─────────────────────────────────────────────────────────┤
│  External Integrations                                  │
│  - Claude Code CLI, OpenCode CLI                        │
│  - GitHub API (Issues, PRs)                             │
└─────────────────────────────────────────────────────────┘
```

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md#3-technical-architecture) for detailed architecture diagrams.

---

## Contributing

We welcome contributions! This project is in early development, so there's plenty of opportunity to shape its direction.

### How to Contribute

1. Check the [Implementation Plan](./IMPLEMENTATION_PLAN.md) for current phase and tasks
2. Look for issues tagged with `good-first-issue` or `help-wanted`
3. Fork the repository and create a feature branch
4. Make your changes with tests
5. Submit a pull request with a clear description

### Development Setup

See [QUICK_START.md](./QUICK_START.md) for detailed development setup instructions.

---

## Roadmap

### ✅ Phase 1-2: Foundation & Task Management
- ✅ Tauri 2.0 project setup
- ✅ React + TypeScript UI
- ✅ SQLite database with migrations
- ✅ PRD parsing (JSON, YAML, Markdown)
- ✅ Task management UI

### ✅ Phase 3-4: Agent Integration & Git
- ✅ Claude Code, OpenCode, Cursor integration
- ✅ Real-time agent monitoring with xterm.js
- ✅ Git worktree management
- ✅ GitHub PR automation
- ✅ Visual diff viewer

### ✅ Phase 5-6: Parallel Execution & Sessions
- ✅ Multi-agent orchestration (4 scheduling strategies)
- ✅ Session persistence and recovery
- ✅ Conflict detection and resolution
- ✅ Resource monitoring and limits

### ✅ Phase 7: Testing & Polish
- ✅ 139 unit tests (100% pass)
- ✅ 240+ E2E tests (Playwright)
- ✅ 150+ backend tests (Rust)
- ✅ WCAG 2.1 AA accessibility
- ✅ Performance testing

### ✅ Phase 7.5: PRD Management
- ✅ Template-based PRD creation (5 built-in templates)
- ✅ Quality scoring (completeness, clarity, actionability)
- ✅ One-click PRD execution
- ✅ Export to JSON/Markdown/YAML

### 🎯 Phase 8: Mobile Support (Upcoming)
- 🚧 iOS and Android builds with Tauri Mobile
- 🚧 Mobile-optimized UI components
- 🚧 Touch gestures and navigation
- 🚧 App store submission

See [PHASES_COMPLETION.md](./PHASES_COMPLETION.md) for detailed implementation status.

---

## Performance Targets

| Metric | Target |
|--------|--------|
| App Bundle Size | < 15 MB (desktop), < 25 MB (mobile) |
| Startup Time | < 1s (cold), < 0.3s (warm) |
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
- **Tauri team** for the incredible cross-platform framework
- **The Simpsons** for the lovably persistent Ralph Wiggum character

---

## Contact & Support

- **Issues:** [GitHub Issues](https://github.com/your-org/Ralph-UI/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/Ralph-UI/discussions)
- **Twitter:** [@RalphUI](https://twitter.com/RalphUI) (coming soon)

---

**Built with ❤️ using Tauri 2.0, React, and Rust**

*Making autonomous AI development accessible, transparent, and delightful.*
