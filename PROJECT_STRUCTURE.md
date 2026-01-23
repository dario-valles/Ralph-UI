# Ralph UI - Project Structure

This document outlines the organization of the Ralph UI codebase.

## Directory Structure

```
Ralph-UI/
├── src/                        # Frontend source code (React + TypeScript)
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui base components
│   │   ├── layout/             # Layout (AppLayout, Sidebar, TitleBar)
│   │   ├── dashboard/          # Dashboard pages
│   │   ├── prd/                # PRD management, GSD workflow, AI chat
│   │   ├── git/                # Git operations (BranchManager, DiffViewer, etc.)
│   │   ├── projects/           # Project management (ProjectPicker, ProjectSwitcher)
│   │   ├── mission-control/    # Mission Control dashboard
│   │   ├── settings/           # Settings page
│   │   └── shared/             # Shared components (EmptyState, StatCard)
│   ├── stores/                 # Zustand state management (8 stores)
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities and API wrappers
│   │   ├── tauri-api.ts        # Main Tauri command wrappers
│   │   ├── invoke.ts           # Unified invoke for Tauri/browser
│   │   └── events-client.ts    # Event handling for Tauri/browser
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
│   │   ├── shutdown.rs         # Graceful shutdown handling
│   │   ├── commands/           # Tauri IPC command handlers
│   │   ├── file_storage/       # JSON file storage (.ralph-ui/)
│   │   ├── models/             # Data models
│   │   ├── git/                # Git operations (git2-rs)
│   │   ├── agents/             # Agent process management
│   │   ├── gsd/                # GSD workflow system
│   │   ├── ralph_loop/         # Ralph Loop execution
│   │   ├── server/             # HTTP/WebSocket server mode
│   │   ├── session/            # Session management
│   │   ├── parsers/            # PRD parsers (JSON, YAML, Markdown)
│   │   ├── templates/          # Template system
│   │   ├── config/             # Configuration management
│   │   ├── github/             # GitHub API integration
│   │   └── utils/              # Utility functions
│   ├── tests/                  # Backend integration tests
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── e2e/                        # Markdown E2E tests (LLM-executed via /e2e skill)
├── public/                     # Static assets
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── vite.config.ts              # Vite build configuration
├── vitest.config.ts            # Vitest test configuration
├── .claude/skills/e2e-runner/  # E2E test runner skill
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

Eight Zustand stores:

| Store | Purpose |
|-------|---------|
| `gsdStore.ts` | GSD workflow state management |
| `prdChatStore.ts` | AI chat state for PRD creation |
| `projectStore.ts` | Multi-project management |
| `ralphLoopStore.ts` | Ralph Loop execution state |
| `terminalStore.ts` | Terminal/agent output management |
| `toastStore.ts` | Toast notifications |
| `toolCallStore.ts` | Tool call tracking for agents |
| `uiStore.ts` | UI state (sidebars, modals) |

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
| `agents.rs` | Agent spawn, monitor, logs |
| `config.rs` | Configuration management |
| `git.rs` | Branch, worktree, commit operations |
| `github.rs` | GitHub API (PRs, Issues) |
| `gsd.rs` | GSD workflow commands |
| `prd.rs` | PRD CRUD, templates, execution |
| `prd_chat.rs` | AI chat for PRD creation |
| `projects.rs` | Project management |
| `ralph_loop.rs` | Ralph Loop execution |
| `sessions.rs` | Session CRUD, resume, export |
| `templates.rs` | Template operations |

### File Storage (`src-tauri/src/file_storage/`)

JSON file-based storage in `.ralph-ui/`:
- `mod.rs` - Module exports
- `chat.rs` - Chat session files
- `prd.rs` - PRD documents
- `sessions.rs` - Session files
- `projects.rs` - Project configuration

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

- `gsd/` - GSD workflow (questioning, research, requirements, verification)
- `ralph_loop/` - Ralph Loop execution engine
- `server/` - HTTP/WebSocket server for browser mode
- `parsers/` - PRD parsers (JSON, YAML, Markdown)
- `templates/` - Template engine with @filename resolution
- `config/` - Configuration loading and merging
- `github/` - GitHub API client
- `watchers/` - File system watchers
- `plugins/` - Plugin system
- `events.rs` - Event system for real-time updates
- `shutdown.rs` - Graceful shutdown and signal handling

## Testing

### Running Tests

```bash
# Unit tests (Frontend)
bun test

# E2E tests (Claude Code skill)
/e2e                    # All tests
/e2e functional         # Functional tests only
/e2e workflow           # Workflow tests only
/e2e responsive         # Responsive tests only

# Backend tests (Rust)
cd src-tauri && cargo test
```

### E2E Test Files (Markdown)

Located in `e2e/`, these markdown tests are executed by the `/e2e` Claude Code skill:

**Functional (`e2e/functional/`):**
- `01-app-basics.md` - Basic app functionality
- `02-session-management.md` - Session CRUD and templates
- `03-task-management.md` - Task operations
- `04-agent-workflows.md` - Agent lifecycle tests
- `05-git-operations.md` - Git workflow tests

**Workflow (`e2e/workflow/`):**
- `01-gsd-workflow.md` - GSD 8-phase workflow
- `02-session-lifecycle.md` - Full session lifecycle
- `03-ralph-loop-workflow.md` - Ralph Loop execution
- `04-prd-creation-workflow.md` - PRD creation workflow

**Responsive (`e2e/responsive/`):**
- `01-mobile-layout.md` - Mobile viewport (375x667)
- `02-tablet-layout.md` - Tablet viewport (768x1024)
- `03-desktop-layout.md` - Desktop viewport (1920x1080)

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
| [CLAUDE.md](./CLAUDE.md) | Development commands and instructions |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | This file |
