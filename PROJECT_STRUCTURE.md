# Ralph UI - Project Structure

This document outlines the organization of the Ralph UI codebase.

## Directory Structure

```
Ralph-UI/
├── src/                        # Frontend source code (React + TypeScript)
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui base components
│   │   ├── layout/             # Layout (AppLayout, Sidebar, TitleBar)
│   │   ├── dashboard/          # Dashboard and Sessions pages
│   │   ├── tasks/              # Task management (TaskList, TaskDetail, PRDImport)
│   │   ├── agents/             # Agent monitoring (AgentList, AgentDetail, SubagentTree)
│   │   ├── git/                # Git operations (BranchManager, DiffViewer, etc.)
│   │   ├── prd/                # PRD management and AI chat
│   │   ├── parallel/           # Parallel execution UI
│   │   ├── projects/           # Project management (ProjectPicker, ProjectSwitcher)
│   │   ├── mission-control/    # Mission Control dashboard
│   │   ├── settings/           # Settings page
│   │   └── recovery/           # Session recovery components
│   ├── stores/                 # Zustand state management (7 stores)
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities and API wrappers
│   ├── config/                 # Frontend configuration
│   ├── types/                  # TypeScript type definitions
│   ├── test/                   # Test setup
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # Application entry point
│   └── index.css               # Global styles (Tailwind)
├── src-tauri/                  # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs             # Tauri application entry
│   │   ├── lib.rs              # Library entry point
│   │   ├── events.rs           # Event system
│   │   ├── commands/           # Tauri IPC command handlers
│   │   ├── database/           # SQLite operations
│   │   ├── models/             # Data models
│   │   ├── git/                # Git operations (git2-rs)
│   │   ├── agents/             # Agent process management
│   │   ├── parallel/           # Parallel execution
│   │   ├── session/            # Session management
│   │   ├── parsers/            # PRD parsers (JSON, YAML, Markdown)
│   │   ├── templates/          # Template system
│   │   ├── config/             # Configuration management
│   │   ├── github/             # GitHub API integration
│   │   └── utils/              # Utility functions
│   ├── tests/                  # Backend integration tests
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── e2e/                        # End-to-end tests (Playwright)
├── public/                     # Static assets
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── vite.config.ts              # Vite build configuration
├── vitest.config.ts            # Vitest test configuration
├── playwright.config.ts        # Playwright E2E configuration
└── eslint.config.js            # ESLint configuration
```

## Frontend Architecture

### Components (`src/components/`)

**UI Components (`ui/`):**
- shadcn/ui base components (Button, Card, Dialog, Input, etc.)
- Fully customizable with Tailwind CSS

**Layout Components (`layout/`):**
- `AppLayout.tsx` - Main application layout with sidebar
- `Sidebar.tsx` - Navigation sidebar
- `TitleBar.tsx` - VS Code-style title bar with project selector

**Feature Components:**
- `dashboard/` - DashboardPage, SessionsPage
- `tasks/` - TaskList, TaskDetail, DependencyGraph, PRDImport
- `agents/` - AgentList, AgentDetail, AgentLogViewer, SubagentTree
- `git/` - BranchManager, WorktreeManager, CommitHistory, DiffViewer
- `prd/` - PRDEditor, PRDList, PRDChatPanel, PRDTemplateSelector, PRDExecutionDialog
- `parallel/` - ParallelExecutionPage, AgentComparison, ConflictResolution
- `projects/` - ProjectPicker, ProjectSwitcher
- `mission-control/` - MissionControlPage, ProjectStatusCard, ActiveAgentsGrid, ActivityTimeline
- `settings/` - SettingsPage
- `recovery/` - SessionRecoveryBanner

### State Management (`src/stores/`)

Seven Zustand stores:

| Store | Purpose |
|-------|---------|
| `sessionStore.ts` | Session lifecycle, configuration |
| `taskStore.ts` | Task CRUD, filtering, status |
| `agentStore.ts` | Agent status, logs, monitoring |
| `prdStore.ts` | PRD management, templates |
| `prdChatStore.ts` | AI chat state for PRD creation |
| `projectStore.ts` | Multi-project management |
| `uiStore.ts` | UI state (sidebars, modals) |
| `toastStore.ts` | Toast notifications |

### Hooks (`src/hooks/`)

- `useMissionControlData.ts` - Mission Control data fetching

### API Layer (`src/lib/`)

- `tauri-api.ts` - Main Tauri command wrappers
- `agent-api.ts` - Agent-specific API calls
- `git-api.ts` - Git operation wrappers
- `parallel-api.ts` - Parallel execution API
- `config-api.ts` - Configuration API
- `utils.ts` - Common utilities

### Type System (`src/types/`)

Centralized TypeScript definitions:
- `index.ts` - Core domain types (Task, Session, Agent, PRD, Project)
- Matches backend Rust types for consistency

## Backend Architecture

### Tauri Commands (`src-tauri/src/commands/`)

| Module | Purpose |
|--------|---------|
| `sessions.rs` | Session CRUD, resume, export |
| `tasks.rs` | Task CRUD, filtering, status |
| `agents.rs` | Agent spawn, monitor, logs |
| `git.rs` | Branch, worktree, commit operations |
| `github.rs` | GitHub API (PRs, Issues) |
| `prd.rs` | PRD CRUD, templates, execution |
| `prd_chat.rs` | AI chat for PRD creation |
| `projects.rs` | Project management |
| `parallel.rs` | Pool, scheduler, conflict detection |
| `config.rs` | Configuration management |
| `recovery.rs` | Session recovery |
| `templates.rs` | Template operations |
| `traces.rs` | Agent trace parsing |
| `mission_control.rs` | Mission Control data |

### Database (`src-tauri/src/database/`)

SQLite operations:
- `mod.rs` - Database initialization and migrations
- `sessions.rs` - Session CRUD
- `tasks.rs` - Task CRUD
- `agents.rs` - Agent CRUD and logs
- `prd.rs` - PRD documents and templates
- `prd_chat.rs` - PRD chat sessions
- `projects.rs` - Project management

### Models (`src-tauri/src/models/`)

- `mod.rs` - Core data structures
- `state_machine.rs` - Task/Session state machines
- `prd_chat.rs` - PRD chat models

### Git Operations (`src-tauri/src/git/`)

Full git2-rs integration:
- Branch management (create, delete, list, checkout)
- Worktree operations (create, list, remove)
- Commit operations (create, history, diff)
- File staging and status

### Agent Management (`src-tauri/src/agents/`)

- `manager.rs` - Process spawn/monitor
- `rate_limiter.rs` - API rate limiting
- `fallback.rs` - Fallback strategies
- `trace_parser.rs` - Agent output parsing

### Parallel Execution (`src-tauri/src/parallel/`)

Multi-agent orchestration:
- `pool.rs` - Agent pool with resource limits
- `scheduler.rs` - Task scheduling strategies
- `coordinator.rs` - Worktree coordination
- `conflicts.rs` - Merge conflict detection

### Session Management (`src-tauri/src/session/`)

- `mod.rs` - Module exports
- `lock.rs` - Session locking for crash recovery
- `recovery.rs` - Auto-recovery on startup
- `progress.rs` - Progress file tracking (`.ralph/progress_{session_id}.txt`)

### Other Backend Modules

- `parsers/` - PRD parsers (JSON, YAML, Markdown)
- `templates/` - Template engine with @filename resolution
- `config/` - Configuration loading and merging
- `github/` - GitHub API client
- `events.rs` - Event system for real-time updates
- `shutdown.rs` - Graceful shutdown and signal handling

## Testing

### Running Tests

```bash
# Unit tests (Frontend)
bun test

# E2E tests (Playwright)
bun run e2e

# Backend tests (Rust)
cd src-tauri && cargo test
```

### E2E Test Files

- `app.spec.ts` - Basic app functionality
- `agent-workflows.spec.ts` - Agent lifecycle tests
- `git-operations.spec.ts` - Git workflow tests
- `parallel-execution.spec.ts` - Multi-agent tests
- `session-management.spec.ts` - Session tests
- `task-management.spec.ts` - Task operation tests
- `error-scenarios.spec.ts` - Error handling tests
- `accessibility.spec.ts` - WCAG compliance tests
- `performance.spec.ts` - Performance tests

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
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Historical roadmap |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | This file |
