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

3. **Tauri CLI**
   ```bash
   cargo install tauri-cli
   ```

4. **Platform Dependencies**

   **macOS:**
   ```bash
   xcode-select --install
   ```

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
     libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
   ```

   **Windows:**
   - Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - WebView2 (pre-installed on Windows 11)

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
bun run tauri dev
```

This starts:
- Vite dev server with hot reload for frontend changes
- Tauri app with the Rust backend

**First run:** Rust compilation takes 2-5 minutes. Subsequent runs are fast (~10s).

### Production Build

```bash
bun run tauri build
```

Output locations:
- **macOS:** `src-tauri/target/release/bundle/dmg/`
- **Windows:** `src-tauri/target/release/bundle/msi/`
- **Linux:** `src-tauri/target/release/bundle/deb/` or `.appimage`

---

## Running Tests

### Unit Tests (Frontend)

```bash
bun test
```

Runs 139 unit tests across all stores and components.

### E2E Tests (Playwright)

```bash
bun run e2e
```

Runs 240+ end-to-end tests.

### Backend Tests (Rust)

```bash
cd src-tauri
cargo test
```

Runs 150+ backend tests.

---

## Project Structure

```
Ralph-UI/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI components
│   │   ├── ui/             # shadcn/ui base components
│   │   ├── tasks/          # Task management
│   │   ├── agents/         # Agent monitoring
│   │   ├── git/            # Git operations
│   │   └── prd/            # PRD management
│   ├── stores/             # Zustand state management
│   ├── lib/                # Utilities and Tauri API
│   └── types/              # TypeScript types
├── src-tauri/              # Backend (Rust + Tauri)
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── database/       # SQLite operations
│   │   ├── git/            # Git operations (git2-rs)
│   │   ├── agents/         # Agent process management
│   │   └── parallel/       # Parallel execution
│   └── Cargo.toml          # Rust dependencies
├── e2e/                    # Playwright E2E tests
└── package.json            # Node dependencies
```

---

## Development Workflow

### Making Frontend Changes

1. Edit files in `src/`
2. Changes auto-reload via Vite HMR
3. Run `bun test` to verify

### Making Backend Changes

1. Edit files in `src-tauri/src/`
2. Restart `bun run tauri dev` (Ctrl+C and re-run)
3. Run `cargo test` in `src-tauri/` to verify

### Adding a New Tauri Command

1. Define command in `src-tauri/src/commands/`
2. Register in `src-tauri/src/main.rs`
3. Add TypeScript wrapper in `src/lib/tauri-api.ts`
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

### WebKit not found (Linux)

```bash
sudo apt install libwebkit2gtk-4.1-dev
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `bun run tauri dev` | Start development server |
| `bun run tauri build` | Build for production |
| `bun test` | Run unit tests |
| `bun run e2e` | Run E2E tests |
| `bun run lint` | Run ESLint |
| `bun run format` | Format with Prettier |

---

## Next Steps

- **Understand the codebase:** Read [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- **See what's built:** Read [PHASES_COMPLETION.md](./PHASES_COMPLETION.md)
- **Architecture details:** Read [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- **Framework rationale:** Read [FRAMEWORK_DECISION.md](./FRAMEWORK_DECISION.md)

---

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/your-org/Ralph-UI/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/Ralph-UI/discussions)
