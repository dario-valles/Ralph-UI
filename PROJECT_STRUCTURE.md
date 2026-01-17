# Ralph UI - Project Structure

This document outlines the organization of the Ralph UI codebase.

## Directory Structure

```
Ralph-UI/
├── src/                        # Frontend source code (React + TypeScript)
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui base components (Button, Card, etc.)
│   │   ├── layout/             # Layout components (Header, Sidebar, etc.)
│   │   ├── dashboard/          # Dashboard-specific components
│   │   ├── tasks/              # Task management components
│   │   ├── agents/             # Agent monitoring components
│   │   └── settings/           # Settings components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utility libraries
│   │   └── utils.ts            # Common utility functions (cn, etc.)
│   ├── stores/                 # Zustand state management stores
│   │   └── sessionStore.ts     # Session and task state
│   ├── types/                  # TypeScript type definitions
│   │   └── index.ts            # Core domain types
│   ├── utils/                  # Utility functions
│   ├── test/                   # Test setup and utilities
│   │   └── setup.ts            # Vitest test setup
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # Application entry point
│   └── index.css               # Global styles (Tailwind directives)
├── src-tauri/                  # Tauri/Rust backend
│   ├── src/                    # Rust source code
│   │   ├── main.rs             # Main entry point
│   │   ├── commands/           # Tauri command handlers
│   │   ├── git/                # Git operations (git2-rs)
│   │   ├── agents/             # Agent process management
│   │   ├── database/           # SQLite database operations
│   │   └── models/             # Data models
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── e2e/                        # End-to-end tests (Playwright)
│   └── app.spec.ts             # E2E test specs
├── public/                     # Static assets
├── .github/                    # GitHub Actions workflows
│   └── workflows/              # CI/CD pipelines
├── docs/                       # Documentation (planning, architecture, etc.)
│   ├── IMPLEMENTATION_PLAN.md  # Comprehensive implementation plan
│   ├── FRAMEWORK_DECISION.md   # Framework selection rationale
│   ├── QUICK_START.md          # Getting started guide
│   └── SUMMARY.md              # Project summary
├── package.json                # Node.js dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── vite.config.ts              # Vite build configuration
├── vitest.config.ts            # Vitest test configuration
├── playwright.config.ts        # Playwright E2E test configuration
├── eslint.config.js            # ESLint configuration
├── .prettierrc                 # Prettier configuration
└── README.md                   # Project README

## Component Organization

### UI Components (`src/components/ui/`)
Base components from shadcn/ui:
- `button.tsx` - Button component with variants
- `card.tsx` - Card component with header, content, footer
- More components will be added as needed

### Feature Components
Organized by feature area:
- `dashboard/` - Dashboard view components
- `tasks/` - Task list, task detail, PRD import
- `agents/` - Agent monitor, terminal output, subagent tree
- `settings/` - Configuration and preferences

### Layout Components (`src/components/layout/`)
Structural components:
- Shell/container components
- Navigation components
- Header/Footer components

## State Management

### Zustand Stores (`src/stores/`)
- `sessionStore.ts` - Manages sessions, tasks, and their states
- Future: `agentStore.ts`, `settingsStore.ts`

## Type System

### TypeScript Types (`src/types/`)
Centralized type definitions matching the implementation plan:
- `Task`, `Session`, `Agent` interfaces
- `SessionConfig`, status enums
- Matches backend Rust types for consistency

## Backend Structure (`src-tauri/`)

### Rust Modules (to be implemented)
- `commands/` - Tauri IPC command handlers
- `git/` - Git operations using git2-rs
- `agents/` - Agent spawning and monitoring
- `database/` - SQLite with migrations
- `models/` - Rust data structures

## Testing

### Unit Tests
- React component tests alongside components (`.test.tsx`)
- Utility function tests in `src/utils/*.test.ts`
- Rust unit tests in `src-tauri/src/**/*.rs`

### Integration Tests
- Tauri IPC tests
- Database operation tests

### E2E Tests
- Playwright tests in `e2e/`
- Full user workflow tests

## Build System

### Frontend (Vite)
- Development: `bun run dev`
- Production build: `bun run build`
- Path aliases: `@/` maps to `src/`

### Backend (Tauri)
- Development: `bun run tauri dev`
- Production build: `bun run tauri build`

### Scripts (package.json)
- `lint` - Run ESLint
- `format` - Run Prettier
- `test` - Run Vitest
- `e2e` - Run Playwright tests

## Naming Conventions

### Files
- Components: PascalCase (e.g., `TaskList.tsx`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Types: camelCase (e.g., `types.ts`)
- Stores: camelCase with "Store" suffix (e.g., `sessionStore.ts`)

### Components
- Functional components with TypeScript
- Use named exports for components
- Props interfaces: `ComponentNameProps`

### Functions
- camelCase for functions and methods
- Descriptive names (e.g., `fetchSessionData`, not `getData`)

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

## Phase 1 Completion Status

- [x] Project initialization
- [x] Development tools setup (ESLint, Prettier, Vitest, Playwright)
- [x] Tailwind CSS + shadcn/ui configuration
- [x] File structure and organization
- [ ] CI/CD pipeline
- [ ] Rust backend structure
- [ ] Tauri IPC foundation
- [ ] SQLite database
- [ ] Basic UI shell

## Next Steps

See `IMPLEMENTATION_PLAN.md` for detailed phase breakdown and upcoming tasks.
