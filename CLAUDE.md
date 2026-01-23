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
cd src-tauri && cargo test     # Rust backend tests (650+ tests)

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
- **Zustand stores** (`src/stores/`): 8 feature-isolated stores (session, task, agent, prd, prdChat, gsd, project, ui, toast, ralphLoop)
- **Tauri API wrappers** (`src/lib/`): Centralized IPC calls to Rust backend
- **shadcn/ui components** (`src/components/ui/`): Radix UI + Tailwind CSS
- **Feature components** (`src/components/`): mission-control, tasks, agents, git, prd, dashboard, parallel, etc.

### Backend (src-tauri/)
- **Tauri 2.0 + Rust** with tokio async runtime
- **Command handlers** (`src/commands/`): 14 modules for IPC boundaries
- **File storage** (`src/file_storage/`): JSON files in `.ralph-ui/` for sessions, PRDs, chat
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

## GSD Workflow

The GSD (Get Stuff Done) workflow provides guided PRD creation through 8 phases:
1. **Questioning** - Chat-based context gathering (what/why/who/done)
2. **Research** - Parallel AI agent research on requirements
3. **Requirements** - Auto-generated requirements from research
4. **Scoping** - Kanban drag-and-drop for V1/V2/Out of Scope categorization
5. **Roadmap** - Visual feature version planning
6. **Verification** - Requirements coverage validation
7. **Export** - Convert to Ralph PRD format
8. **Complete** - Workflow completion

Key files:
- `src/stores/gsdStore.ts` - Workflow state management
- `src-tauri/src/commands/gsd.rs` - Backend commands
- `src/types/gsd.ts` - Type definitions

## Data Storage

### File-Based Storage (Primary)
Data is stored in `.ralph-ui/` directories within each project for git-trackable collaboration:

```
{project}/.ralph-ui/
├── sessions/{id}.json     # Session state with embedded tasks
├── prds/{name}.json       # PRD documents with stories/progress
├── chat/{id}.json         # Chat sessions with embedded messages
├── planning/{id}/         # GSD planning sessions
│   ├── PROJECT.md         # Generated project context
│   ├── SUMMARY.md         # Research synthesis
│   ├── REQUIREMENTS.md    # Generated requirements
│   └── ROADMAP.md         # Feature roadmap
└── .gitignore             # Excludes runtime files (agents/, *.lock)
```

All file operations use atomic writes (temp file + rename) for safety.

## Testing

- **Unit tests**: Vitest with jsdom, 386+ tests, 80% coverage targets
- **E2E tests**: Playwright (Chromium), 240+ tests
- **Backend tests**: cargo test, 650+ tests
- **Accessibility**: jest-axe integration with WCAG 2.1 AA coverage
