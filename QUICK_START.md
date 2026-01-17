# Quick Start Guide - Ralph UI Development

This guide helps you get started with Ralph UI development in under 30 minutes.

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Tools

1. **Rust** (1.75+)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

2. **Bun** (1.2+) - Recommended JavaScript runtime
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

   *Alternative: Node.js 18+ works, but Bun is faster*

3. **Tauri CLI**
   ```bash
   cargo install tauri-cli
   ```

4. **Platform-Specific Dependencies**

   **macOS:**
   ```bash
   xcode-select --install
   ```

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libxdo-dev \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev
   ```

   **Windows:**
   - Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 11)

### Optional Tools

- **VS Code** with extensions:
  - Rust Analyzer
  - Tauri
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense

- **mold** (faster linker for Linux)
  ```bash
  # Ubuntu/Debian
  sudo apt install mold
  ```

---

## Project Setup

### Step 1: Create Tauri Project

```bash
# Create new Tauri project
cargo create-tauri-app ralph-ui

# When prompted, select:
# - Package manager: bun (or npm/yarn/pnpm)
# - UI template: React
# - Add TypeScript: Yes
# - Build tool: Vite

cd ralph-ui
```

### Step 2: Install Dependencies

```bash
# Install frontend dependencies
bun install

# Add essential dependencies
bun add zustand                    # State management
bun add @tanstack/react-query      # Data fetching
bun add tailwindcss postcss autoprefixer  # Styling
bun add -D @types/node             # Node types

# Initialize Tailwind CSS
bunx tailwindcss init -p
```

### Step 3: Set Up Tailwind CSS + shadcn/ui

```bash
# Install shadcn/ui
bunx shadcn@latest init

# When prompted:
# - TypeScript: Yes
# - Style: Default
# - Base color: Slate
# - CSS variables: Yes

# Add some initial components
bunx shadcn@latest add button
bunx shadcn@latest add card
bunx shadcn@latest add input
bunx shadcn@latest add badge
```

### Step 4: Configure Rust Backend

Edit `src-tauri/Cargo.toml` to add dependencies:

```toml
[dependencies]
tauri = { version = "2.0", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
git2 = "0.18"  # Git operations
rusqlite = { version = "0.31", features = ["bundled"] }  # SQLite
```

### Step 5: Run Development Server

```bash
# Start Tauri in development mode
bun tauri dev

# This will:
# 1. Compile Rust backend (first time takes 2-5 minutes)
# 2. Start Vite dev server
# 3. Open the application window
```

**First-time compilation is slow!** Subsequent runs are much faster (~10s).

---

## Project Structure

After setup, your project should look like this:

```
ralph-ui/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── lib/                # Utilities, hooks, stores
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Tauri app entry
│   │   ├── commands.rs     # Tauri commands (create this)
│   │   └── lib.rs          # Library code (create this)
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── public/                 # Static assets
├── index.html              # HTML entry
├── package.json            # Node dependencies
├── tailwind.config.js      # Tailwind configuration
├── tsconfig.json           # TypeScript config
└── vite.config.ts          # Vite config
```

---

## Development Workflow

### 1. Create a Tauri Command (Rust)

Edit `src-tauri/src/main.rs`:

```rust
use tauri::Manager;

// Example command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Ralph UI!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])  // Register command
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 2. Call Command from React (TypeScript)

Create `src/lib/tauri.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';

export async function greet(name: string): Promise<string> {
  return await invoke('greet', { name });
}
```

Use in component:

```tsx
import { useState } from 'react';
import { greet } from './lib/tauri';
import { Button } from './components/ui/button';

function App() {
  const [greeting, setGreeting] = useState('');

  const handleGreet = async () => {
    const message = await greet('Developer');
    setGreeting(message);
  };

  return (
    <div className="p-8">
      <Button onClick={handleGreet}>Greet</Button>
      {greeting && <p className="mt-4">{greeting}</p>}
    </div>
  );
}
```

### 3. Hot Reload

- **Frontend changes:** Auto-reload (Vite HMR)
- **Rust changes:** Requires manual restart (`Ctrl+C` then `bun tauri dev`)

### 4. Debugging

**Frontend (JavaScript):**
- Open DevTools: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
- Console, Network, React DevTools all work

**Backend (Rust):**
```bash
# Run with debug logs
RUST_LOG=debug bun tauri dev

# Use println! for quick debugging
println!("Debug: {:?}", variable);
```

---

## Common Tasks

### Add a New UI Component

```bash
# shadcn/ui has 40+ components
bunx shadcn@latest add dialog
bunx shadcn@latest add table
bunx shadcn@latest add toast

# See all: https://ui.shadcn.com/
```

### Add State Management (Zustand)

Create `src/lib/store.ts`:

```typescript
import { create } from 'zustand';

interface AppState {
  tasks: Task[];
  addTask: (task: Task) => void;
}

export const useStore = create<AppState>((set) => ({
  tasks: [],
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
}));
```

Use in component:

```tsx
import { useStore } from './lib/store';

function TaskList() {
  const tasks = useStore((state) => state.tasks);
  const addTask = useStore((state) => state.addTask);

  return (
    <ul>
      {tasks.map((task) => <li key={task.id}>{task.title}</li>)}
    </ul>
  );
}
```

### Work with File System

```rust
// src-tauri/src/main.rs
use std::fs;

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path)
        .map_err(|e| e.to_string())
}
```

```typescript
// src/lib/tauri.ts
export async function readFile(path: string): Promise<string> {
  return await invoke('read_file', { path });
}
```

### Spawn a Process

```rust
use std::process::Command;

#[tauri::command]
async fn run_command(cmd: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())
}
```

### Use SQLite Database

```rust
// src-tauri/src/database.rs
use rusqlite::{Connection, Result};

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open("ralph.db")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}
```

---

## Building for Production

### Development Build

```bash
bun tauri dev
```

### Production Build

```bash
# Build for current platform
bun tauri build

# Output locations:
# - macOS: src-tauri/target/release/bundle/dmg/
# - Windows: src-tauri/target/release/bundle/msi/
# - Linux: src-tauri/target/release/bundle/deb/ or .appimage
```

### Build for Multiple Platforms

**macOS → Windows/Linux:**
Not directly supported. Use CI/CD (GitHub Actions) for cross-platform builds.

**Example GitHub Actions:**
```yaml
name: Build
on: [push]

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - uses: actions-rust-lang/setup-rust-toolchain@v1

      - run: bun install
      - run: bun tauri build
```

---

## Testing

### Unit Tests (Rust)

```bash
# Run Rust tests
cd src-tauri
cargo test
```

### Unit Tests (Frontend)

```bash
# Install Vitest
bun add -D vitest @testing-library/react @testing-library/jest-dom

# Run tests
bun test
```

### E2E Tests (Playwright)

```bash
# Install Playwright
bun add -D @playwright/test

# Run E2E tests
bun playwright test
```

---

## Performance Optimization

### Reduce Bundle Size

```toml
# src-tauri/Cargo.toml
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Better optimization
strip = true        # Remove symbols
```

### Faster Compilation (Linux)

```bash
# Install mold linker
sudo apt install mold

# Use mold
echo '[target.x86_64-unknown-linux-gnu]' >> ~/.cargo/config.toml
echo 'linker = "clang"' >> ~/.cargo/config.toml
echo 'rustflags = ["-C", "link-arg=-fuse-ld=mold"]' >> ~/.cargo/config.toml
```

---

## Troubleshooting

### "Command not found: cargo"

Solution: Ensure Rust is installed and in PATH:
```bash
source $HOME/.cargo/env
```

### "webkit2gtk not found" (Linux)

Solution: Install WebKit dependencies:
```bash
sudo apt install libwebkit2gtk-4.1-dev
```

### Rust compilation takes forever

- First compilation: 2-5 minutes (normal)
- Subsequent compilations: 10-30 seconds
- Use `mold` linker on Linux for 2x speedup

### Port 1420 already in use

Solution: Kill existing Vite process:
```bash
lsof -ti:1420 | xargs kill -9
```

### Changes not reflecting

1. Frontend changes: Should auto-reload (check Vite is running)
2. Rust changes: Requires app restart (`Ctrl+C` then `bun tauri dev`)
3. `tauri.conf.json` changes: Requires full rebuild

---

## Next Steps

1. **Read the Implementation Plan:** [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
2. **Understand the Architecture:** [IMPLEMENTATION_PLAN.md#3-technical-architecture](./IMPLEMENTATION_PLAN.md#3-technical-architecture)
3. **Pick a Phase 1 Task:** See [Phase 1: Foundation](./IMPLEMENTATION_PLAN.md#phase-1-foundation-weeks-1-2)
4. **Join the Community:** Discord, GitHub Discussions
5. **Build Something:** Start with a simple feature (task list UI, greet command)

---

## Useful Resources

### Documentation
- [Tauri 2.0 Docs](https://v2.tauri.app/)
- [Tauri API Reference](https://v2.tauri.app/reference/javascript/api/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Zustand Docs](https://docs.pmnd.rs/zustand/getting-started/introduction)

### Examples
- [Tauri Examples](https://github.com/tauri-apps/tauri/tree/dev/examples)
- [Awesome Tauri](https://github.com/tauri-apps/awesome-tauri)

### Community
- [Tauri Discord](https://discord.com/invite/tauri)
- [Ralph-TUI GitHub](https://github.com/subsy/ralph-tui)

---

## Getting Help

1. **Check documentation first:** Most questions answered in official docs
2. **Search GitHub Issues:** Someone may have encountered the same problem
3. **Ask in Discord:** Tauri and Ralph communities are helpful
4. **Create an issue:** If you find a bug, report it with reproduction steps

---

**Happy coding! 🚀**

*Building the future of autonomous AI development, one commit at a time.*
