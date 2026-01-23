# Quick Start Guide - Ralph UI

Get Ralph UI running on your machine in under 10 minutes.

---

## Prerequisites

### Required

1. **Rust** (1.75+)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

2. **Bun** (1.2+)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Platform Dependencies**

   **macOS:**
   ```bash
   xcode-select --install
   ```

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt update
   sudo apt install build-essential curl wget file libssl-dev pkg-config
   ```

   **Windows:**
   - Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/Ralph-UI.git
cd Ralph-UI

# Install frontend dependencies
bun install
```

---

## Running the Application

### Development Mode

```bash
# Terminal 1: Start the backend server
bun run server:dev

# Terminal 2: Start the frontend dev server
bun run dev

# Open http://localhost:1420 in your browser
# Enter the auth token displayed by the server
```

**First run:** Rust compilation takes 2-5 minutes. Subsequent runs are fast (~10s).

### Production Build

```bash
# Build backend binary
bun run cargo:build

# Build frontend assets
bun run build

# Run the server
./src-tauri/target/release/ralph-ui --port 3420 --bind 0.0.0.0
```

Output: Single binary at `src-tauri/target/release/ralph-ui` (~14MB)

### Server Variants

```bash
bun run server           # Production server (port 3420)
bun run server:dev       # Development mode (faster builds)
bun run server:dev:token # Dev mode with fixed token (no re-entry after restart)
```

The server displays an auth token on startup - enter it in the browser connection dialog.

See [CLAUDE.md](./CLAUDE.md) for full server documentation.

---

## Running Tests

### Unit Tests (Frontend)

```bash
bun run test
```

Runs unit tests across all stores and components (345+ tests).

### E2E Tests (Claude Code Skill)

```bash
/e2e                           # Run all tests
/e2e functional                # Run functional tests only
/e2e workflow                  # Run workflow tests only
/e2e responsive                # Run responsive tests only
```

Markdown-based E2E tests executed via Claude Code skill with browser automation. See `e2e/README.md` for details.

### Backend Tests (Rust)

```bash
bun run cargo:test
```

Runs 670+ backend tests covering:
- File storage operations
- Git operations
- Agent management
- GSD workflow
- Ralph Loop execution
- Template rendering
- Signal handling

---

## Project Structure

```
Ralph-UI/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI components
│   │   ├── ui/             # shadcn/ui base components
│   │   ├── prd/            # PRD management and GSD workflow
│   │   └── git/            # Git operations
│   ├── stores/             # Zustand state management
│   ├── lib/                # Utilities and API wrappers
│   └── types/              # TypeScript types
├── src-tauri/              # Backend (Rust + Axum)
│   ├── src/
│   │   ├── commands/       # Business logic handlers
│   │   ├── file_storage/   # JSON file storage
│   │   ├── git/            # Git operations (git2-rs)
│   │   ├── agents/         # Agent process management
│   │   ├── gsd/            # GSD workflow
│   │   ├── ralph_loop/     # Ralph Loop execution
│   │   └── server/         # HTTP/WebSocket server
│   └── Cargo.toml          # Rust dependencies
├── e2e/                    # Markdown E2E tests (LLM-executed)
└── package.json            # Node dependencies
```

---

## Development Workflow

### Making Frontend Changes

1. Edit files in `src/`
2. Changes auto-reload via Vite HMR
3. Run `bun run test` to verify

### Making Backend Changes

1. Edit files in `src-tauri/src/`
2. Restart server (Ctrl+C and re-run `bun run server:dev`)
3. Run `bun run cargo:test` to verify

### Adding a New Backend Command

1. Define function in `src-tauri/src/commands/`
2. Add route in `src-tauri/src/server/proxy.rs`
3. Add TypeScript wrapper in `src/lib/invoke.ts` or API file
4. Use via `invoke('command_name', { params })`

---

## Common Issues

### Rust compilation slow

First compilation is 2-5 minutes (normal). Use `mold` linker on Linux for faster rebuilds:
```bash
sudo apt install mold
```

### Port 1420 already in use

```bash
lsof -ti:1420 | xargs kill -9
```

### Port 3420 already in use

```bash
bun run server:kill
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `bun run server:dev` | Start backend server (dev mode) |
| `bun run dev` | Start frontend dev server |
| `bun run server` | Start backend server (production) |
| `bun run cargo:build` | Build production binary |
| `bun run test` | Run frontend unit tests |
| `bun run cargo:test` | Run backend unit tests |
| `/e2e` | Run E2E tests (Claude Code skill) |
| `bun run lint` | Run ESLint |
| `bun run format` | Format with Prettier |

---

## Next Steps

- **Understand the codebase:** Read [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- **Development instructions:** Read [CLAUDE.md](./CLAUDE.md)

---

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/your-org/Ralph-UI/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/Ralph-UI/discussions)
