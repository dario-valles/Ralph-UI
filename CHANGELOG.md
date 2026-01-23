# Changelog

All notable changes to Ralph UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### GSD Workflow for Guided PRD Creation
- Complete GSD (Get Stuff Done) workflow system for intelligent PRD generation
- 8-phase stepper workflow orchestrating PRD creation:
  1. Deep Questioning - Chat-based context gathering (what/why/who/done questions)
  2. Research - Parallel Claude Code agents for requirement research
  3. Requirements - Auto-generated requirements from research
  4. Scoping - Kanban view for categorizing requirements (V1/V2/Out of Scope)
  5. Roadmap - Visual interface for planning feature versions
  6. Verification - Requirements verification and acceptance criteria extraction
  7. Export - Convert to Ralph PRD format
  8. Complete - Workflow completion
- Research streaming with real-time terminal-like output panels using Tauri events
- Auto-generates PROJECT.md from questioning context
- 645+ Rust tests and 20+ TypeScript tests for GSD workflow

#### Advanced Fallback Configuration
- New `ErrorStrategyConfig` enum (Retry, Skip, Abort) for error handling
- Extended `FallbackSettings` with:
  - `fallbackChain` - ordered list of fallback agents
  - `testPrimaryRecovery` - validate primary agent recovery capability
  - `recoveryTestInterval` - interval for testing recovery
- Backend now uses config values instead of hardcoded fallback settings
- Added Codex to execution agent dropdown

#### GitHub Issues Import
- "Import from GitHub" as third workflow option in PRD creation
- Multi-step workflow: GitHub token, issue selection, import to PRD
- Label and milestone filtering support
- Extracts acceptance criteria from markdown checkboxes in issue bodies
- Converts GitHub issues directly into PRD stories

#### Kanban Scoping Improvements
- Drag-and-drop Kanban view for requirement scoping (alongside list view)
- 4 columns: Unscoped, V1, V2, Out of Scope
- Improved requirement categorization and visual workflow

#### PRD Editor Redesign
- Tabbed interface for PRD editing:
  - **Content** - Main PRD document editing
  - **Stories** - Display extracted stories
  - **Execution** - Inline Ralph Loop dashboard (replaces execution dialog)
  - **History** - Execution history tracking
- Better navigation between PRD editing and execution
- Cleaner separation of concerns for PRD lifecycle

#### Other Features
- AI-powered conflict resolution with ConflictResolver
- Double-press Ctrl+C detection with confirmation dialog for interruption
- Streaming execution feedback with real-time progress events

### Changed
- PRD execution migrated from dialog to inline tab-based workflow
- File-based storage now primary (SQLite being phased out)
- Improved research orchestrator and workflow state management

### Fixed
- Silent data loss where advanced fallback settings were configured but not persisted
- Fixed acceptance criteria extraction from issue bodies
- Frontend-backend fallback settings alignment

### Removed
- Legacy Sessions/Tasks/Agents UI
- PRDExecutionDialog (replaced by inline Execution tab)
- Unused dead code and compiler warnings cleaned up

## Technical Details

### New Components
- `gsdStore` - Workflow state management (563 lines)
- GSD Tauri commands (544 lines)
- GSD type definitions (306 lines)
- File-based planning storage (582 lines)

### Test Coverage
- 650+ Rust backend tests
- 80% frontend coverage target
- 240+ E2E tests (Playwright)
- WCAG 2.1 AA accessibility coverage
