# Ralph UI - Project Structure

This document outlines the organization of the Ralph UI codebase.

## Directory Structure

```
Ralph-UI/
├── src/                        # Frontend source code (React + TypeScript)
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui base components (Button, Card, etc.)
│   │   ├── layout/             # Layout components (Header, Sidebar)
│   │   ├── dashboard/          # Dashboard view components
│   │   ├── tasks/              # Task management (TaskList, TaskDetail, PRDImport)
│   │   ├── agents/             # Agent monitoring (AgentList, Terminal)
│   │   ├── git/                # Git operations (BranchManager, DiffViewer)
│   │   ├── prd/                # PRD management (PRDEditor, PRDList, Templates)
│   │   ├── sessions/           # Session management
│   │   └── settings/           # Settings and configuration
│   ├── stores/                 # Zustand state management
│   │   ├── sessionStore.ts     # Session state (26 tests)
│   │   ├── taskStore.ts        # Task state (28 tests)
│   │   ├── agentStore.ts       # Agent state (27 tests)
│   │   └── prdStore.ts         # PRD state (27 tests)
│   ├── lib/                    # Utilities and API
│   │   ├── utils.ts            # Common utilities (cn, etc.)
│   │   └── tauri-api.ts        # Tauri command wrappers
│   ├── types/                  # TypeScript type definitions
│   │   └── index.ts            # Core domain types
│   ├── test/                   # Test setup
│   │   └── setup.ts            # Vitest configuration
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # Application entry point
│   └── index.css               # Global styles (Tailwind)
├── src-tauri/                  # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs             # Tauri application entry
│   │   ├── commands/           # Tauri IPC command handlers
│   │   │   ├── mod.rs          # Command exports
│   │   │   ├── sessions.rs     # Session commands
│   │   │   ├── tasks.rs        # Task commands
│   │   │   ├── agents.rs       # Agent commands
│   │   │   ├── git.rs          # Git commands (17 commands)
│   │   │   ├── github.rs       # GitHub API commands (5 commands)
│   │   │   └── prd.rs          # PRD commands (9 commands)
│   │   ├── database/           # SQLite operations
│   │   │   ├── mod.rs          # Database initialization
│   │   │   ├── sessions.rs     # Session CRUD
│   │   │   ├── tasks.rs        # Task CRUD
│   │   │   ├── agents.rs       # Agent CRUD (13 tests)
│   │   │   └── prd.rs          # PRD CRUD (470 lines)
│   │   ├── git/                # Git operations (git2-rs)
│   │   │   ├── mod.rs          # Git module
│   │   │   └── operations.rs   # Branch, worktree, commit ops (16 tests)
│   │   ├── agents/             # Agent process management
│   │   │   ├── mod.rs          # Agent manager
│   │   │   └── manager.rs      # Process spawn/monitor (7 tests)
│   │   ├── parallel/           # Parallel execution
│   │   │   ├── mod.rs          # Module exports
│   │   │   ├── pool.rs         # Agent pool (10 tests)
│   │   │   ├── scheduler.rs    # Task scheduler (13 tests)
│   │   │   ├── worktree.rs     # Worktree coordinator (10 tests)
│   │   │   └── conflict.rs     # Conflict detection (8 tests)
│   │   ├── parsers/            # PRD parsers
│   │   │   ├── mod.rs          # Parser exports
│   │   │   ├── json.rs         # JSON parser
│   │   │   ├── yaml.rs         # YAML parser
│   │   │   └── markdown.rs     # Markdown parser
│   │   └── github/             # GitHub API integration
│   │       └── client.rs       # REST client (2 tests)
│   ├── tests/                  # Backend integration tests
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── e2e/                        # End-to-end tests (Playwright)
│   ├── agent-workflows.spec.ts # Agent lifecycle tests (50+)
│   ├── git-operations.spec.ts  # Git workflow tests (60+)
│   ├── parallel-execution.spec.ts # Multi-agent tests (50+)
│   ├── error-scenarios.spec.ts # Error handling tests (60+)
│   ├── accessibility.spec.ts   # WCAG 2.1 AA tests (40+)
│   └── performance.spec.ts     # Performance tests (30+)
├── public/                     # Static assets
├── .github/                    # GitHub Actions workflows
│   └── workflows/              # CI/CD pipelines
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── vite.config.ts              # Vite build configuration
├── vitest.config.ts            # Vitest test configuration
├── playwright.config.ts        # Playwright E2E configuration
├── eslint.config.js            # ESLint configuration
└── .prettierrc                 # Prettier configuration
```

## Frontend Architecture

### Components (`src/components/`)

**UI Components (`ui/`):**
- shadcn/ui base components (Button, Card, Input, Dialog, etc.)
- Fully customizable with Tailwind CSS

**Feature Components:**
- `tasks/` - TaskList, TaskDetail, DependencyGraph, PRDImport
- `agents/` - AgentList, AgentMonitor, Terminal output
- `git/` - BranchManager, WorktreeManager, CommitHistory, DiffViewer
- `prd/` - PRDEditor, PRDList, PRDTemplateSelector, PRDExecutionDialog
- `sessions/` - SessionList, SessionDetail, SessionExport
- `dashboard/` - Overview, metrics, quick actions

### State Management (`src/stores/`)

Four Zustand stores with 108 unit tests total:

| Store | Purpose | Tests |
|-------|---------|-------|
| `sessionStore.ts` | Session lifecycle, config | 26 |
| `taskStore.ts` | Task CRUD, filtering | 28 |
| `agentStore.ts` | Agent status, logs | 27 |
| `prdStore.ts` | PRD management | 27 |

### Type System (`src/types/`)

Centralized TypeScript definitions:
- `Task`, `Session`, `Agent`, `PRDDocument` interfaces
- Status enums, configuration types
- Matches backend Rust types for consistency

## Backend Architecture

### Tauri Commands (`src-tauri/src/commands/`)

82 total commands across modules:

| Module | Commands | Purpose |
|--------|----------|---------|
| `sessions.rs` | 8 | Session CRUD, resume, export |
| `tasks.rs` | 10 | Task CRUD, filtering, status |
| `agents.rs` | 11 | Agent spawn, monitor, logs |
| `git.rs` | 17 | Branch, worktree, commit ops |
| `github.rs` | 5 | PR creation, issue management |
| `prd.rs` | 9 | PRD CRUD, templates, execution |
| `parallel.rs` | 22 | Pool, scheduler, conflict detection |

### Database (`src-tauri/src/database/`)

SQLite with 8 tables:
- `sessions` - Session state and config
- `tasks` - Task definitions and status
- `agents` - Agent instances and logs
- `prd_documents` - PRD content and quality scores
- `prd_templates` - Built-in and custom templates
- `prd_executions` - Execution tracking
- `agent_logs` - Log entries
- `schema_version` - Migration tracking

### Git Operations (`src-tauri/src/git/`)

Full git2-rs integration (16 tests):
- Branch management (create, delete, list, checkout)
- Worktree operations (create, list, remove)
- Commit operations (create, history, diff)
- File staging and status

### Parallel Execution (`src-tauri/src/parallel/`)

Multi-agent orchestration (41 tests):
- `pool.rs` - Resource limits (CPU, memory, runtime)
- `scheduler.rs` - 4 strategies (priority, dependency-first, FIFO, cost-first)
- `worktree.rs` - Worktree allocation and cleanup
- `conflict.rs` - Merge conflict detection

## Testing

### Test Coverage

| Layer | Tests | Framework |
|-------|-------|-----------|
| Unit (Frontend) | 139 | Vitest |
| E2E | 240+ | Playwright |
| Backend | 150+ | Rust cargo test |
| **Total** | **500+** | |

### Running Tests

```bash
# Unit tests
bun test

# E2E tests
bun run e2e

# Backend tests
cd src-tauri && cargo test
```

## Build System

### Frontend (Vite)

```bash
bun run dev      # Development server
bun run build    # Production build
```

Path aliases: `@/` maps to `src/`

### Backend (Tauri)

```bash
bun run tauri dev    # Development with hot reload
bun run tauri build  # Production build
```

## Naming Conventions

### Files
- Components: PascalCase (`TaskList.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Stores: camelCase with "Store" suffix (`sessionStore.ts`)
- Tests: Same name with `.test.ts` or `.test.tsx`

### Code
- Components: Functional with TypeScript, named exports
- Props interfaces: `ComponentNameProps`
- Functions: camelCase, descriptive names

## Import Order

1. External libraries (React, etc.)
2. Internal aliases (`@/components`, `@/lib`, etc.)
3. Relative imports
4. Styles

Example:
```tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/sessionStore'
import { cn } from '@/lib/utils'
import './Component.css'
```

## Documentation

| Document | Purpose |
|----------|---------|
| [README.md](./README.md) | Project overview |
| [QUICK_START.md](./QUICK_START.md) | Developer setup |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Full roadmap |
| [PHASES_COMPLETION.md](./PHASES_COMPLETION.md) | Implementation status |
| [PHASE_7.5_COMPLETION.md](./PHASE_7.5_COMPLETION.md) | PRD feature details |
| [FRAMEWORK_DECISION.md](./FRAMEWORK_DECISION.md) | Why Tauri 2.0 |
| [SUMMARY.md](./SUMMARY.md) | Executive summary |
