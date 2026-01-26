# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ralph UI is an HTTP/WebSocket server application for orchestrating autonomous AI coding agents using the Ralph Wiggum Loop technique. The app enables multi-agent parallel development sessions where progress persists in files and git history rather than LLM context.

The backend is built with Rust (Axum), and the frontend is a React SPA that connects via HTTP/WebSocket.

## Development Commands

```bash
# Development
bun run dev                    # Frontend only (Vite dev server on port 1420)
bun run server:dev             # Backend server in dev mode

# Production
bun run server                 # Run HTTP/WebSocket server (release build)
bun run server:build           # Build server binary only

# Testing
bun run test                   # Unit tests (Vitest) - NOTE: use "bun run test", not "bun test"
bun run test:run               # Run tests once
bun run test:coverage          # With coverage report
bun run cargo:test             # Rust backend tests (650+ tests)
/e2e                           # E2E tests via Claude Code skill

# Code Quality
bun run lint                   # ESLint (strict, 0 warnings allowed)
bun run lint:fix               # Auto-fix lint issues
bun run format                 # Prettier format (frontend)
cargo fmt                      # Rust format (run from server/ dir)
cargo clippy -- -D warnings    # Rust lints (run from server/ dir)

# Building
bun run cargo:build            # Production backend build
bun run build                  # Production frontend build
```

## Quick Start

```bash
# Terminal 1: Start the backend server
bun run server:dev

# Terminal 2: Start the frontend dev server
bun run dev

# Open http://localhost:1420 in browser
# Enter the auth token displayed by the server
```

## Running the Server

```bash
# Start server with default settings (port 3420, bind 0.0.0.0)
bun run server

# Development mode (faster builds, debug symbols)
bun run server:dev

# Development with fixed token (no need to re-enter after restart)
bun run server:dev:token

# Custom port/bind/token
cd server && cargo run -- --port 8080 --bind 127.0.0.1 --token my-secret-token

# Or use environment variable
RALPH_SERVER_TOKEN=my-secret-token bun run server:dev
```

The server displays a startup banner with:
- Server URL (e.g., `http://0.0.0.0:3420`)
- Auth token (32-char hex string, or your custom token)

## Browser Connection

When accessing the frontend from a browser, a connection dialog appears automatically. Enter:
1. **Server URL**: `http://localhost:3420` (or your server address)
2. **Auth Token**: Copy from server startup output

The connection is stored in localStorage and persists across page reloads.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invoke` | POST | Command proxy - routes to backend commands |
| `/ws/events` | GET | WebSocket for real-time events |
| `/health` | GET | Health check |
| `/` | GET | Connection instructions page |

## Authentication

All requests require Bearer token authentication:
```bash
curl -X POST http://localhost:3420/api/invoke \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cmd": "get_sessions", "args": {"projectPath": "/path/to/project"}}'
```

WebSocket connections pass token as query parameter: `/ws/events?token=YOUR_TOKEN`

## Architecture

### Frontend (src/)
- **React 19 + TypeScript** with Vite bundler
- **Zustand stores** (`src/stores/`): 8 feature-isolated stores (session, task, agent, prd, prdChat, gsd, project, ui, toast, ralphLoop)
- **API wrappers** (`src/lib/`): Centralized HTTP/WebSocket calls to backend
- **shadcn/ui components** (`src/components/ui/`): Radix UI + Tailwind CSS
- **Feature components** (`src/components/`): mission-control, tasks, agents, git, prd, dashboard, parallel, etc.

### Backend (server/)
- **Axum + Rust** with tokio async runtime
- **HTTP/WebSocket server** (`src/server/`): API proxy, auth, events
- **Command handlers** (`src/commands/`): 14 modules for business logic
- **File storage** (`src/file_storage/`): JSON files in `.ralph-ui/` for sessions, PRDs, chat
- **Git operations** (`src/git/`): git2-rs integration for branches, worktrees, commits
- **Agent management** (`src/agents/`): Process spawning, rate limiting, log parsing, PTY support
- **Parallel orchestration** (`src/parallel/`): Pool, scheduler, worktree coordination

### Server Architecture

```
server/src/server/
├── mod.rs      # Server setup, router, CORS
├── auth.rs     # Bearer token middleware (tower::Layer)
├── proxy.rs    # Command routing (150+ commands via routing macros)
├── events.rs   # WebSocket broadcaster
└── state.rs    # Shared application state
```

The server uses the **Command Proxy Pattern** - a single `/api/invoke` endpoint routes HTTP requests to command handler functions.

**Proxy routing patterns** (`proxy.rs`):
- `route_async!` / `route_sync!` - Commands returning values
- `route_unit!` / `route_unit_async!` - Commands returning nothing
- `get_arg()` / `get_opt_arg()` - Type-safe argument extraction
- Helper functions: `build_agent_command()`, `build_server_chat_prompt()`, `generate_session_title()`

### Data Flow
1. React component → Zustand store + API wrapper
2. `invoke()` HTTP call → Rust command handler
3. Handler accesses file storage/git/agents → returns typed response
4. Store updates → React re-renders

## Key Patterns

### Type Sharing
Types in `src/types/index.ts` must match Rust structs in `server/src/models/`. Keep synchronized.

### State Management
Each feature has its own Zustand store. Access via hooks, not direct imports:
```typescript
import { useSessionStore } from '@/stores/sessionStore'
const { sessions, createSession } = useSessionStore()
```

### API Calls
All backend calls go through `src/lib/invoke.ts`:
```typescript
import { invoke } from '@/lib/invoke'
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

### Mobile-First Design
**IMPORTANT**: All UI components must be designed mobile-first. Write base styles for mobile screens, then use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`) to add styles for larger screens.

```typescript
// CORRECT: Mobile-first approach
<div className="flex flex-col gap-2 p-4 md:flex-row md:gap-4 lg:p-6">

// WRONG: Desktop-first approach
<div className="flex flex-row gap-4 p-6 max-md:flex-col max-md:gap-2 max-md:p-4">
```

Key principles:
- Start with single-column layouts, expand to multi-column at `md:` or `lg:`
- Use smaller spacing/padding by default, increase at breakpoints
- Stack elements vertically on mobile, arrange horizontally on larger screens
- Test components at 320px width minimum (mobile viewport)
- Use responsive text sizes: `text-sm md:text-base lg:text-lg`

### Design System (Colors & Tokens)

Use these consistent design tokens across all components:

**Borders & Backgrounds:**
- Muted backgrounds: `bg-muted/30`
- Standard borders: `border-border/50`
- Card hover: `hover:bg-muted/30 transition-colors` or `hover:shadow-md transition-shadow`

**Status Colors (with dark mode):**
```typescript
// Success states
'bg-green-500/5 border-green-500/30 dark:bg-green-500/10'
'text-green-600 dark:text-green-400'

// Warning states
'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'

// Error/destructive states
'bg-destructive/5 border-destructive/20 text-destructive'

// Info/highlight states
'bg-blue-500/5 border-blue-500/30 dark:bg-blue-500/10'
```

**Badge Variants** (`src/components/ui/badge.tsx`):
- `variant="success"` - Green with dark mode support
- `variant="warning"` - Amber with dark mode support
- `variant="emerald"` - Gradient emerald-teal for primary CTAs

**Quality Score Colors** (`src/components/prd/quality-utils.ts`):
- All functions include dark mode variants automatically
- Use `getScoreColor()`, `getScoreBg()`, `getProgressColor()`, `getProgressBgColor()`

**Responsive Spacing Patterns:**
```typescript
'p-2.5 sm:p-3'     // Compact cards
'p-3 sm:p-4'       // Standard cards
'p-3 sm:p-6'       // Large sections
'gap-2 sm:gap-4'   // Flex gaps
'mb-3 sm:mb-4'     // Margins
```

**Dialog Sizing (use Tailwind classes, not arbitrary values):**
```typescript
'max-w-sm'   // Small dialogs: confirmations, simple forms (~384px)
'max-w-md'   // Medium dialogs: form dialogs, detail views (~448px)
'max-w-lg'   // Large dialogs: multi-step, complex forms (~512px)
'max-w-xl'   // Extra large: import dialogs, previews (~576px)
'max-w-2xl'  // Wide content: file editors, settings (~672px)
'max-w-3xl'  // Very wide: dashboards (~768px)
'max-w-4xl'  // Full-featured modals (~896px)
```

### Prompt Templates
**IMPORTANT**: When creating new prompts for AI agents, always add them to the template system so they can be edited by users.

**Template System Architecture:**
- **Builtin templates**: Hardcoded in `server/src/templates/builtin.rs` (read-only defaults)
- **Project templates**: `{project}/.ralph-ui/templates/{name}.tera` (project-specific overrides)
- **Global templates**: `~/.ralph-ui/templates/{name}.tera` (user-wide overrides)
- **Resolution order**: Project → Global → Builtin (first found wins)

**Adding a New Prompt Template:**
1. Add the default template to `server/src/templates/builtin.rs`
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

**GSD/Chat Prompts:** Currently use `GsdCustomPrompts` in config (`server/src/gsd/config.rs`) with fields for `deep_questioning`, `architecture`, `codebase`, `best_practices`, `risks`. These should eventually migrate to the template system.

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

Fully integrated: Claude Code, OpenCode, Cursor Agent, Codex CLI, Qwen Code, Droid

### Agent Session Resumption (Token Optimization)

PRD Chat uses native CLI session resumption to avoid resending full conversation history on each message. This provides **67-90% token savings** depending on conversation length.

**How it works:**
1. First message: Full prompt sent, agent's session ID captured from output
2. Subsequent messages: Session ID passed via resume flag, history omitted from prompt
3. The CLI agent maintains its own context, so history isn't needed

**Resume commands by agent:**

| Agent | Resume Flag | CLI Reference |
|-------|-------------|---------------|
| Claude Code | `--resume <session-id>` | [CLI Reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference) |
| Cursor Agent | `--resume=<chat-id>` | [Cursor Docs](https://docs.cursor.com/agent/cli) |
| Codex CLI | `codex resume <session-id>` | [Codex CLI Reference](https://github.com/openai/codex) |
| Qwen Code | `--continue` | [Qwen Code Docs](https://github.com/QwenLM/Qwen-Agent) |
| OpenCode | `--session <session-id>` | [OpenCode Docs](https://github.com/opencode-ai/opencode) |
| Droid | `--session-id <session-id>` | [Factory Droid CLI](https://docs.factory.ai/reference/cli-reference) |

**Key files:**
- `server/src/commands/prd_chat/agent_executor.rs` - `build_agent_command()` with resume flags
- `server/src/models/prd_chat.rs` - `ChatSession.external_session_id` field
- `server/src/file_storage/chat_ops.rs` - `update_chat_session_external_id()`

**Token savings by conversation length:**

| Messages | Without Resume | With Resume | Savings |
|----------|----------------|-------------|---------|
| 5 | 15 exchanges | 5 exchanges | 67% |
| 10 | 55 exchanges | 10 exchanges | 82% |
| 20 | 210 exchanges | 20 exchanges | 90% |

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
- `server/src/commands/gsd.rs` - Backend commands
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
- **E2E tests**: Markdown-based tests in `e2e/` executed via `/e2e` skill with browser automation
- **Backend tests**: cargo test, 650+ tests
- **Accessibility**: jest-axe integration with WCAG 2.1 AA coverage

### E2E Tests

E2E tests are written in markdown format and executed via the `/e2e` Claude Code skill:

```bash
/e2e                                    # Run all tests
/e2e functional                         # Run functional tests only
/e2e workflow                           # Run workflow tests only
/e2e responsive                         # Run responsive tests only
/e2e functional/01-app-basics.md        # Run specific test file
```

Test files are organized in:
- `e2e/functional/` - Core feature tests (sessions, tasks, agents, git)
- `e2e/workflow/` - End-to-end workflow tests (GSD, Ralph Loop, PRD)
- `e2e/responsive/` - Viewport-specific tests (mobile, tablet, desktop)

See `e2e/README.md` for test format and writing guidelines.

### CI Requirements

Before pushing, ensure these checks pass locally:

```bash
# Frontend
bun run lint                   # No ESLint warnings
bun run typecheck              # TypeScript types
bun run test:run               # Unit tests

# Backend (from server/ directory)
cargo fmt --check              # Rust formatting
cargo clippy -- -D warnings    # Rust lints (strict, no warnings)
cargo test                     # Backend tests
```

**Clippy Configuration:** Crate-level clippy allows are defined in `server/src/lib.rs` with explanatory comments. Only add new allows if fixing the warning would significantly reduce readability or require major refactoring.

## Deployment

### Docker

```dockerfile
FROM rust:latest AS builder
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /target/release/ralph-ui /usr/local/bin/
EXPOSE 3420
CMD ["ralph-ui", "--bind", "0.0.0.0"]
```

### Binary

```bash
# Build release binary
bun run cargo:build

# Run directly
./server/target/release/ralph-ui --port 3420 --bind 0.0.0.0
```
