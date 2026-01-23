# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ralph UI is a Tauri desktop application for orchestrating autonomous AI coding agents using the Ralph Wiggum Loop technique. The app enables multi-agent parallel development sessions where progress persists in files and git history rather than LLM context.

## Development Commands

```bash
# Development
bun run tauri dev              # Start full dev environment (Vite + Rust backend)
bun run dev                    # Frontend only (Vite dev server on port 1420)

# Server Mode (Browser Access)
bun run server                 # Run HTTP/WebSocket server (release build)
bun run server:dev             # Run server in dev mode (faster builds)
bun run server:build           # Build server binary only

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

## Server Mode (Browser Access)

Ralph UI can run as an HTTP/WebSocket server for browser-based access, enabling use from any device on the network without installing the desktop app. The frontend works identically in both Tauri desktop and browser modes.

### Quick Start (Browser Mode)

```bash
# Terminal 1: Start the backend server
bun run server

# Terminal 2: Start the frontend dev server
bun run dev

# Open http://localhost:1420 in browser
# Enter the auth token displayed by the server
```

### Running the Server

```bash
# Start server with default settings (port 3420, bind 0.0.0.0)
bun run server

# Development mode (faster builds, debug symbols)
bun run server:dev

# Custom port/bind address
cd src-tauri && cargo run --features server --release -- --server --port 8080 --bind 127.0.0.1
```

The server displays a startup banner with:
- Server URL (e.g., `http://0.0.0.0:3420`)
- Auth token (32-char hex string, generated on each startup)

### Browser Connection

When accessing the frontend from a browser (not Tauri), a connection dialog appears automatically. Enter:
1. **Server URL**: `http://localhost:3420` (or your server address)
2. **Auth Token**: Copy from server startup output

The connection is stored in localStorage and persists across page reloads.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invoke` | POST | Command proxy - routes to Tauri commands |
| `/ws/events` | GET | WebSocket for real-time events |
| `/health` | GET | Health check |
| `/` | GET | Connection instructions page |

### Authentication

All requests require Bearer token authentication:
```bash
curl -X POST http://localhost:3420/api/invoke \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cmd": "get_sessions", "args": {"projectPath": "/path/to/project"}}'
```

WebSocket connections pass token as query parameter: `/ws/events?token=YOUR_TOKEN`

### Frontend Browser Mode Architecture

The frontend uses a unified API layer that works in both Tauri and browser modes:

```typescript
// src/lib/invoke.ts - Automatically routes to Tauri IPC or HTTP
import { invoke } from '@/lib/invoke'
await invoke('get_sessions', { projectPath: '/path' })

// src/lib/events-client.ts - Automatically uses Tauri events or WebSocket
import { subscribeEvent } from '@/lib/events-client'
const unlisten = await subscribeEvent('ralph:progress', handler)
```

Key browser mode files:
- `src/lib/invoke.ts` - HTTP fallback for `invoke()` calls
- `src/lib/events-client.ts` - WebSocket client for real-time events
- `src/components/ServerConnectionDialog.tsx` - Connection UI
- `src/hooks/useServerConnection.ts` - Connection state management

### Server Architecture

```
src-tauri/src/server/
├── mod.rs      # Server setup, router, CORS
├── auth.rs     # Bearer token middleware (tower::Layer)
├── proxy.rs    # Command routing (~60+ commands)
├── events.rs   # WebSocket broadcaster
└── state.rs    # Shared application state
```

The server uses the **Command Proxy Pattern** - a single `/api/invoke` endpoint routes HTTP requests directly to existing Tauri command functions, requiring zero changes to existing commands.

### Graceful Degradation

| Feature | Desktop (Tauri) | Browser | Notes |
|---------|-----------------|---------|-------|
| All UI features | ✓ | ✓ | Full parity |
| Real-time events | ✓ | ✓ | WebSocket in browser |
| Native file dialogs | ✓ | ✗ | Use project path input |
| PTY terminal input | ✓ | ✗ | Output streaming only |
| Desktop notifications | ✓ | ✓ | Web Notifications API |

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

### Prompt Templates
**IMPORTANT**: When creating new prompts for AI agents, always add them to the template system so they can be edited by users.

**Template System Architecture:**
- **Builtin templates**: Hardcoded in `src-tauri/src/templates/builtin.rs` (read-only defaults)
- **Project templates**: `{project}/.ralph-ui/templates/{name}.tera` (project-specific overrides)
- **Global templates**: `~/.ralph-ui/templates/{name}.tera` (user-wide overrides)
- **Resolution order**: Project → Global → Builtin (first found wins)

**Adding a New Prompt Template:**
1. Add the default template to `src-tauri/src/templates/builtin.rs`
2. Register it in the `BUILTIN_TEMPLATES` array
3. Add TypeScript types if needed in `src/types/index.ts`
4. The template will automatically appear in Settings → Templates for user editing

**Template Engine:** Uses [Tera](https://tera.netlify.app/) syntax (similar to Jinja2):
```tera
You are working on: {{ task.title }}

{% if acceptance_criteria | length > 0 %}
## Acceptance Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
{% endif %}
```

**GSD/Chat Prompts:** Currently use `GsdCustomPrompts` in config (`src-tauri/src/gsd/config.rs`) with fields for `deep_questioning`, `architecture`, `codebase`, `best_practices`, `risks`. These should eventually migrate to the template system.

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
