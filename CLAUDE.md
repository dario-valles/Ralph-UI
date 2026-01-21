# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ralph UI is a Tauri desktop application for orchestrating autonomous AI coding agents using the Ralph Wiggum Loop technique. The app enables multi-agent parallel development sessions where progress persists in files and git history rather than LLM context.

## Development Commands

```bash
# Development
bun run tauri dev              # Start full dev environment (Vite + Rust backend)
bun run dev                    # Frontend only (Vite dev server on port 1420)

# Testing
bun run test                   # Unit tests (Vitest) - NOTE: use "bun run test", not "bun test"
bun run test:run               # Run tests once
bun run test:coverage          # With coverage report
bun run e2e                    # E2E tests (Playwright)
cd src-tauri && cargo test     # Rust backend tests (575+ tests)

# Code Quality
bun run lint                   # ESLint (strict, 0 warnings allowed)
bun run lint:fix               # Auto-fix lint issues
bun run format                 # Prettier format

# Building
bun run tauri build            # Production bundle
```

## Architecture

### Frontend (src/)
- **React 19 + TypeScript** with Vite bundler
- **Zustand stores** (`src/stores/`): 7 feature-isolated stores (session, task, agent, prd, prdChat, project, ui, toast)
- **Tauri API wrappers** (`src/lib/`): Centralized IPC calls to Rust backend
- **shadcn/ui components** (`src/components/ui/`): Radix UI + Tailwind CSS
- **Feature components** (`src/components/`): mission-control, tasks, agents, git, prd, dashboard, parallel, etc.

### Backend (src-tauri/)
- **Tauri 2.0 + Rust** with tokio async runtime
- **Command handlers** (`src/commands/`): 14 modules for IPC boundaries
- **File storage** (`src/file_storage/`): JSON files in `.ralph-ui/` for sessions, PRDs, chat
- **Database** (`src/database/`): SQLite (legacy, being phased out)
- **Git operations** (`src/git/`): git2-rs integration for branches, worktrees, commits
- **Agent management** (`src/agents/`): Process spawning, rate limiting, log parsing
- **Parallel orchestration** (`src/parallel/`): Pool, scheduler, worktree coordination

### Data Flow
1. React component → Zustand store + Tauri API wrapper
2. `invoke()` IPC call → Rust command handler
3. Handler accesses file storage/git/agents → returns typed response
4. Store updates → React re-renders

## Key Patterns

### Type Sharing
Types in `src/types/index.ts` must match Rust structs in `src-tauri/src/models/`. Keep synchronized.

### State Management
Each feature has its own Zustand store. Access via hooks, not direct imports:
```typescript
import { useSessionStore } from '@/stores/sessionStore'
const { sessions, createSession } = useSessionStore()
```

### Tauri Commands
All backend calls go through `src/lib/tauri-api.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core'
const result = await invoke<T>('command_name', { args })
```

### Shared Utilities
- `src/lib/tauri-check.ts` - Centralized `isTauri` check for environment detection
- `src/test/store-test-utils.ts` - Test utilities: mock factories, `resetStore` helper

### Component Organization
- Feature folders under `src/components/` (e.g., `mission-control/`, `agents/`, `sessions/`)
- shadcn/ui base components in `src/components/ui/`
- Shared components in `src/components/shared/` (EmptyState, StatCard)
- Layout components in `src/components/layout/`

### Navigation Context Pattern
**IMPORTANT**: When navigating between pages, always set the appropriate Zustand store context before navigating. Many pages require `currentSession` or `activeProject` to be set:

```typescript
// Before navigating to session-related pages
const { setCurrentSession } = useSessionStore()
const { setActiveProject } = useProjectStore()

// Set context before navigate()
setCurrentSession(session)
const project = projects.find(p => p.path === session.projectPath)
if (project) setActiveProject(project.id)
navigate(`/sessions/${session.id}`)
```

Pages and their context requirements:
- `/tasks` - Requires `currentSession` (shows "No Session Selected" without it)
- `/agents` - Requires `currentSession` (shows "No Session Selected" without it)
- `/sessions/:id` - Fetches session by ID, but should also set `currentSession` for consistency
- `/sessions` - Works without context, but filters by `activeProject` if set

## Supported AI Agents

Fully integrated: Claude Code, OpenCode, Cursor Agent, Codex CLI

## Data Storage

### File-Based Storage (Primary)
Data is stored in `.ralph-ui/` directories within each project for git-trackable collaboration:

```
{project}/.ralph-ui/
├── sessions/{id}.json     # Session state with embedded tasks
├── prds/{name}.json       # PRD documents with stories/progress
├── chat/{id}.json         # Chat sessions with embedded messages
└── .gitignore             # Excludes runtime files (agents/, *.lock)
```

All file operations use atomic writes (temp file + rename) for safety.

### SQLite (Legacy)
SQLite database in `src-tauri/src/database/` is being phased out. New features should use file storage.

## Testing

- **Unit tests**: Vitest with jsdom, 575+ tests, 80% coverage targets
- **E2E tests**: Playwright (Chromium), 240+ tests
- **Backend tests**: cargo test, 575+ tests
- **Accessibility**: jest-axe integration
