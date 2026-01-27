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
- **Remote Terminal Access** - Access from phones, tablets, or any device via your network or tunnels
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

## Quick Start (NPX)

The fastest way to run Ralph UI - no cloning or building required:

```bash
# Run Ralph UI instantly
npx ralph-ui

# Or with custom port
npx ralph-ui --port 8080
```

The binary is downloaded once and cached in `~/.ralph-ui/bin/`.

**Supported platforms:** macOS (Intel/Apple Silicon), Linux (x64/arm64), Windows

---

## Getting Started

### Prerequisites

- **Rust:** 1.75+ (install from [rustup.rs](https://rustup.rs))
- **Bun:** 1.2+ (recommended) or Node.js 18+

### Installation

**Option 1: NPX (Recommended)**

```bash
npx ralph-ui
```

That's it! The server starts on port 3420. Open `http://localhost:3420` and enter the auth token.

**Option 2: From Source (Development)**

```bash
# Clone the repository
git clone https://github.com/dario-valles/Ralph-UI.git
cd Ralph-UI

# Install dependencies
bun install

# Start the backend server (Terminal 1)
bun run server:dev

# Start the frontend dev server (Terminal 2)
bun run dev

# Open http://localhost:1420 in your browser
# Enter the auth token displayed by the server
```

**Testing & Building**

```bash
bun run test           # Frontend tests
bun run cargo:test     # Backend tests
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

Ralph UI supports 7 production-ready AI coding agents with full session management and token optimization:

- **Claude Code** (Anthropic's official CLI) - Fully integrated with session resumption
- **OpenCode** (Open source alternative) - Fully integrated with resume support
- **Cursor Agent** - Integrated with session resume capability
- **Codex CLI** (OpenAI) - Integrated with session resume support
- **Qwen Code** (Alibaba) - Integrated with Claude-compatible API
- **Droid** (Factory AI) - Integrated with CLI session management
- **gemini-cli** (Google) - Integrated with Gemini models

### Alternative API Providers for Claude

For Claude Code, Ralph UI supports alternative API providers that offer Claude-compatible endpoints:

- **Anthropic (Direct)** - Default provider using official Anthropic API
- **Z.AI** - Claude-compatible API with alternative pricing
- **MiniMax** - Claude-compatible API service
- **MiniMax (China)** - China-specific endpoint for MiniMax service

**Provider Configuration:**
- Configure providers in Settings → API Providers
- Add API tokens for each provider you want to use
- Test connections directly from the UI
- Set a default provider for all Claude operations

**Usage:**
- When selecting agents, choose "Claude (Z.AI)" or "Claude (MiniMax)" from the dropdown
- The agent/model selector displays available providers once configured
- All Claude features work identically across providers
- Environment variables are automatically set when spawning agents

**Benefits:**
- Access Claude models through alternative providers
- Potential cost savings depending on provider pricing
- Geographic optimization (e.g., MiniMax China for Asia-Pacific users)
- Easy provider switching without code changes

### Session Resumption for Token Savings

Ralph UI uses native CLI session resumption to avoid re-sending full conversation history on each message, providing **67-90% token savings** depending on conversation length.

**How it works:**
1. **First message:** Full prompt sent, agent's session ID captured from output
2. **Subsequent messages:** Session ID passed via resume flag, history omitted from prompt
3. **The CLI agent** maintains its own context, so history isn't needed

**Supported agents with resume flags:**
- Claude Code (`--resume <session-id>`)
- Cursor Agent (`--resume=<chat-id>`)
- Codex CLI (`codex resume <session-id>`)
- Qwen Code (`--continue`)
- OpenCode (`--session <session-id>`)
- Droid (`--session-id <session-id>`)
- gemini-cli (check documentation for resume support)

**Token savings by conversation length:**

| Messages | Without Resume | With Resume | Savings |
|----------|----------------|-------------|---------|
| 5        | 15 exchanges   | 5 exchanges | 67%     |
| 10       | 55 exchanges   | 10 exchanges| 82%     |
| 20       | 210 exchanges  | 20 exchanges| 90%     |

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

## Remote Terminal Access

Ralph UI runs as an HTTP/WebSocket server, accessible from any device on your network or remotely via tunnels.

### Local Network Access

```bash
# Start server (binds to all interfaces by default)
npx ralph-ui

# Or specify port
npx ralph-ui --port 8080
```

Access from any device: `http://<your-ip>:3420`
- Find your IP: `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux)
- Enter the auth token shown in the terminal

### Remote Access via Tunnels

For access outside your network:

```bash
# Using ngrok
ngrok http 3420

# Using Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3420

# Using Tailscale (recommended for persistent access)
# Install Tailscale, then access via your Tailscale IP
```

### Security Notes

- Always use a strong `--token` for remote access
- Consider HTTPS proxy for public tunnels
- The default token is regenerated on each restart; use `--token` for persistence

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

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

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
