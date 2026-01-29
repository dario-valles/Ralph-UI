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

## Quick Install (NPX)

The fastest way to get started - no prerequisites except Node.js:

```bash
# Run Ralph UI instantly
npx ralph-ui

# Server starts on http://localhost:3420
# Enter the auth token shown in terminal
```

The binary is automatically downloaded for your platform and cached in `~/.ralph-ui/bin/`.

**Supported:** macOS (Intel/Apple Silicon), Linux (x64/arm64), Windows

---

## Installation (From Source)

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
./server/target/release/ralph-ui --port 3420 --bind 0.0.0.0
```

Output: Single binary at `server/target/release/ralph-ui` (~14MB)

### Server Variants

```bash
bun run server           # Production server (port 3420)
bun run server:dev       # Development mode (faster builds)
bun run server:dev:token # Dev mode with fixed token (no re-entry after restart)
```

The server displays an auth token on startup - enter it in the browser connection dialog.

See [CLAUDE.md](./CLAUDE.md) for full server documentation.

---

## Remote Access

### From Other Devices on Your Network

Ralph UI binds to all network interfaces by default (0.0.0.0), so you can access it from any device on your local network.

1. Find your computer's IP address:
   ```bash
   # macOS
   ipconfig getifaddr en0

   # Linux
   hostname -I | awk '{print $1}'

   # Windows
   ipconfig | findstr IPv4
   ```

2. Start the server:
   ```bash
   npx ralph-ui --port 3420
   ```

3. On your phone/tablet/other device, open: `http://<your-ip>:3420`

4. Enter the auth token displayed in the terminal

### Remote Access (Outside Your Network)

For access from anywhere, use a tunnel service:

```bash
# ngrok (quick setup)
ngrok http 3420

# Cloudflare Tunnel (free, more reliable)
cloudflared tunnel --url http://localhost:3420

# Tailscale (recommended for persistent access)
# After installing Tailscale, access via your Tailscale IP
```

### Fixed Auth Token

By default, a new token is generated on each restart. For persistent access:

```bash
# Use a fixed token
npx ralph-ui --token my-secret-token

# Or via environment variable
RALPH_SERVER_TOKEN=my-secret-token npx ralph-ui
```

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

Runs 650+ backend tests covering:
- File storage operations
- Git operations
- Agent management
- PRD workflow
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
│   │   ├── prd/            # PRD management and AI chat
│   │   └── git/            # Git operations
│   ├── stores/             # Zustand state management
│   ├── lib/                # Utilities and API wrappers
│   └── types/              # TypeScript types
├── server/              # Backend (Rust + Axum)
│   ├── src/
│   │   ├── commands/       # Business logic handlers
│   │   ├── file_storage/   # JSON file storage
│   │   ├── git/            # Git operations (git2-rs)
│   │   ├── agents/         # Agent process management
│   │   ├── prd_workflow/   # PRD workflow
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

1. Edit files in `server/src/`
2. Restart server (Ctrl+C and re-run `bun run server:dev`)
3. Run `bun run cargo:test` to verify

### Adding a New Backend Command

1. Define function in `server/src/commands/`
2. Add route in `server/src/server/proxy.rs`
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
