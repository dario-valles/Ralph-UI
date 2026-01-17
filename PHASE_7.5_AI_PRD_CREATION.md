# Phase 7.5: AI-Guided PRD Creation - Detailed Implementation Guide

**Date:** January 17, 2026
**Duration:** Weeks 15.5-17 (2.5 weeks)
**Status:** Planning

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [User Experience Flow](#user-experience-flow)
4. [Technical Specifications](#technical-specifications)
5. [Database Schema](#database-schema)
6. [API Design](#api-design)
7. [Component Structure](#component-structure)
8. [Integration Points](#integration-points)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Testing Strategy](#testing-strategy)
11. [Security & Privacy](#security--privacy)
12. [Performance Optimization](#performance-optimization)

---

## Overview

### Problem Statement

Currently, Ralph UI requires users to create PRD documents manually (in JSON, YAML, or Markdown) before importing them into the application. This creates friction in the workflow and prevents users from leveraging AI assistance during the critical planning phase.

### Solution

Phase 7.5 introduces an **AI-guided PRD creation system** that:
- Provides an interactive chat interface for collaborative PRD building
- Guides users through best practices using proven frameworks (ChatPRD, OpenAI PM approach)
- Automatically converts conversations into structured PRD documents
- Seamlessly integrates with the existing task management system
- Supports multiple PRD templates for different project types

### Key Benefits

| Benefit | Impact |
|---------|--------|
| **Time Savings** | Reduce PRD creation from hours to ~15 minutes |
| **Quality Improvement** | AI ensures completeness, consistency, and best practices |
| **Lower Barrier to Entry** | Non-PMs can create professional PRDs |
| **Context Awareness** | AI analyzes existing codebase to inform recommendations |
| **Iterative Refinement** | Easy to update and improve PRDs over time |

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Ralph UI Frontend                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  Tasks Page      │  │  PRD Chat Panel  │  │  PRD Editor     │  │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌───────────┐  │  │
│  │  │ Task List  │  │  │  │ Messages   │  │  │  │ Live      │  │  │
│  │  │ with PRD   │◄─┼──┼─►│ Streaming  │  │  │  │ Preview   │  │  │
│  │  │ Preview    │  │  │  │ Input      │  │  │  │ Editor    │  │  │
│  │  └────────────┘  │  │  └────────────┘  │  │  └───────────┘  │  │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌───────────┐  │  │
│  │  │ Dependency │  │  │  │ Templates  │  │  │  │ Sections  │  │  │
│  │  │ Graph      │  │  │  │ Suggestions│  │  │  │ Navigator │  │  │
│  │  └────────────┘  │  │  └────────────┘  │  │  └───────────┘  │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
│                                                                     │
│  State Management (Zustand)                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ prdChatStore    │  │ prdDocStore     │  │ taskStore       │   │
│  │ - messages      │  │ - current PRD   │  │ - tasks         │   │
│  │ - streaming     │  │ - versions      │  │ - sessions      │   │
│  │ - templates     │  │ - quality score │  │ - filters       │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                      Tauri IPC Layer                                │
│  Commands: create_prd_session, send_chat_message, export_prd       │
│  Events: prd_message_chunk, prd_updated, quality_score_updated     │
├─────────────────────────────────────────────────────────────────────┤
│                      Ralph UI Backend (Rust)                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PRD Creation Module                                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │  │
│  │  │ Chat       │  │ PRD        │  │ Quality Analyzer     │   │  │
│  │  │ Handler    │→ │ Generator  │→ │ - Completeness       │   │  │
│  │  │            │  │            │  │ - Clarity            │   │  │
│  │  └────────────┘  └────────────┘  │ - Actionability      │   │  │
│  │        ↓              ↓          └──────────────────────┘   │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │  │
│  │  │ Context    │  │ Template   │  │ Export Engine        │   │  │
│  │  │ Analyzer   │  │ Engine     │  │ - JSON/YAML/MD       │   │  │
│  │  │ (Git/Code) │  │            │  │ - PDF/HTML           │   │  │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  AI Integration Layer                                        │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ Anthropic Claude API Client                            │  │  │
│  │  │ - Model: Claude Opus 4.5 (complex reasoning)           │  │  │
│  │  │ - Streaming: Server-Sent Events                        │  │  │
│  │  │ - Context: 200k tokens for large codebases             │  │  │
│  │  │ - Cost Tracking: Token usage per session               │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ Prompt Engineering Module                              │  │  │
│  │  │ - System prompts for each PRD section                  │  │  │
│  │  │ - Few-shot examples from ChatPRD/OpenAI                │  │  │
│  │  │ - Context injection (repo analysis, git history)       │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Storage (SQLite)                                            │  │
│  │  - prd_documents (PRD metadata, content, versions)          │  │
│  │  - prd_chat_sessions (chat history, context)                │  │
│  │  - prd_templates (system + custom templates)                │  │
│  │  - prd_quality_scores (completeness, clarity, actionability)│  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Opens PRD Creation
         ↓
Frontend: Display template selection
         ↓
User selects template / starts from scratch
         ↓
Backend: Load template + analyze project context
         ↓
AI: Generate opening questions based on template
         ↓
User: Answers questions in chat
         ↓
AI: Iteratively builds PRD sections
    - Problem statement
    - User stories
    - Requirements
    - Technical specs
    - Acceptance criteria
         ↓
Frontend: Live PRD preview updates in real-time
         ↓
Backend: Quality analysis runs continuously
    - Completeness check (all sections filled?)
    - Clarity check (ambiguous terms?)
    - Actionability check (clear tasks?)
         ↓
User: Reviews, edits, refines via chat or direct edit
         ↓
AI: Suggests improvements based on quality scores
         ↓
User: Finalizes PRD
         ↓
Backend: Export to format (JSON/YAML/Markdown)
         ↓
Existing System: Parse → Create Tasks → Assign to Agents
```

---

## User Experience Flow

### Primary User Journey: Creating a Startup MVP PRD

#### Step 1: Template Selection (15 seconds)
```
┌────────────────────────────────────────────────────────┐
│  Create New PRD                                        │
├────────────────────────────────────────────────────────┤
│  Choose a template to get started:                     │
│                                                         │
│  [🚀 Startup MVP]  [🏢 Enterprise Feature]            │
│  [🐛 Bug Fix]      [⚡ Refactoring]                   │
│  [🔌 API/Integration]  [📝 Start from Scratch]        │
│                                                         │
│  Or describe your project, and AI will suggest:        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ "Build a task management app for developers"    │  │
│  └──────────────────────────────────────────────────┘  │
│                      [Continue →]                       │
└────────────────────────────────────────────────────────┘
```

#### Step 2: AI-Guided Discovery (2-3 minutes)
```
┌────────────────────────────────────────────────────────┐
│  Chat with AI                        │  PRD Preview    │
├──────────────────────────────────────┼─────────────────┤
│  🤖 Great! Let's build a clear PRD   │  ## Project     │
│  for your task management app.       │  *(waiting...)*  │
│                                      │                 │
│  First, help me understand the core  │                 │
│  problem you're solving:             │                 │
│                                      │                 │
│  1. Who are your target users?       │                 │
│  2. What pain point does this solve? │                 │
│  3. What's your success metric?      │                 │
│                                      │                 │
│  👤 1. Developers managing multiple  │                 │
│  tasks across projects               │                 │
│  2. Existing tools are too complex   │                 │
│  3. Daily active users               │                 │
│                                      │                 │
│  🤖 Perfect! Based on that, I suggest│  ## Problem     │
│  the following problem statement:    │  Statement      │
│                                      │  Developers...  │
│  "Developers managing multiple...    │                 │
│  [Edit] [Accept]                     │  ## Target Users│
│                                      │  - Developers   │
│  ┌────────────────────────────────┐  │                 │
│  │ Type your message...           │  │                 │
│  └────────────────────────────────┘  │                 │
└────────────────────────────────────────────────────────┘
```

#### Step 3: Iterative Section Building (5-10 minutes)
```
AI guides through each section:
├─ Problem Statement ✓
├─ Target Audience ✓
├─ Success Criteria ✓
├─ User Stories (in progress)
│   ├─ Core user flows
│   ├─ Edge cases
│   └─ MVP scope boundaries
├─ Functional Requirements (pending)
├─ Technical Requirements (pending)
├─ Acceptance Criteria (pending)
└─ Timeline & Milestones (pending)
```

#### Step 4: Quality Check & Refinement (2-3 minutes)
```
┌────────────────────────────────────────────────────────┐
│  🎯 PRD Quality Score: 82% (Good)                      │
├────────────────────────────────────────────────────────┤
│  ✅ Completeness: 95% (All sections filled)           │
│  ⚠️  Clarity: 75% (Some ambiguous terms detected)     │
│      - "simple interface" → Suggest specific metrics  │
│      - "fast performance" → Define latency targets    │
│  ✅ Actionability: 90% (Clear tasks identified)       │
│                                                         │
│  💡 Suggestions:                                       │
│  • Add specific performance targets (e.g., < 100ms)   │
│  • Define "simple" with concrete UI guidelines        │
│  • Consider accessibility requirements (WCAG 2.1)     │
│                                                         │
│  [Apply Suggestions] [Export PRD] [Continue Editing]  │
└────────────────────────────────────────────────────────┘
```

#### Step 5: Export & Task Generation (30 seconds)
```
┌────────────────────────────────────────────────────────┐
│  Export PRD                                            │
├────────────────────────────────────────────────────────┤
│  Format: [Markdown ▼]                                 │
│          □ JSON  □ YAML  ☑ Markdown  □ PDF           │
│                                                         │
│  ☑ Automatically create tasks from PRD                │
│  ☑ Generate dependency graph                          │
│  ☑ Assign initial priorities                          │
│                                                         │
│  Tasks extracted: 24 tasks across 5 epics             │
│  Estimated total: ~8,500 tokens                        │
│                                                         │
│  [Export & Create Tasks]                              │
└────────────────────────────────────────────────────────┘
```

### Secondary Flows

#### Editing Existing PRD
1. Select PRD from history
2. View previous versions (diff viewer)
3. Continue chat to refine
4. See changelog of AI suggestions

#### Using Custom Templates
1. Navigate to Templates
2. Create from existing PRD
3. Define template variables
4. Save for reuse

---

## Technical Specifications

### Frontend Components

#### 1. PRDChatPanel Component
```typescript
// src/components/prd/PRDChatPanel.tsx

interface PRDChatPanelProps {
  sessionId?: string
  onPRDGenerated: (prdId: string) => void
  initialTemplate?: PRDTemplate
}

export function PRDChatPanel({
  sessionId,
  onPRDGenerated,
  initialTemplate
}: PRDChatPanelProps) {
  const { messages, sendMessage, isStreaming } = usePRDChat(sessionId)
  const { currentPRD, updatePRD } = usePRDDocument()

  return (
    <div className="flex flex-col h-full">
      <PRDChatHeader template={initialTemplate} />
      <PRDMessageList messages={messages} isStreaming={isStreaming} />
      <PRDChatInput onSend={sendMessage} disabled={isStreaming} />
      <PRDQualityIndicator score={currentPRD?.qualityScore} />
    </div>
  )
}
```

**Key Features:**
- Real-time message streaming with typewriter effect
- Inline action buttons (Accept, Edit, Regenerate)
- Context-aware suggestions
- Template switching mid-conversation
- Voice input support

#### 2. PRDPreview Component
```typescript
// src/components/prd/PRDPreview.tsx

interface PRDPreviewProps {
  prdId: string
  editable?: boolean
  onSectionUpdate?: (section: string, content: string) => void
}

export function PRDPreview({ prdId, editable, onSectionUpdate }: PRDPreviewProps) {
  const { prd, updateSection } = usePRDDocument(prdId)
  const [editingSection, setEditingSection] = useState<string | null>(null)

  return (
    <div className="prose dark:prose-invert max-w-none">
      <PRDMetadata prd={prd} />

      {prd.sections.map(section => (
        <PRDSection
          key={section.id}
          section={section}
          editable={editable}
          isEditing={editingSection === section.id}
          onEdit={() => setEditingSection(section.id)}
          onSave={(content) => {
            updateSection(section.id, content)
            onSectionUpdate?.(section.id, content)
            setEditingSection(null)
          }}
        />
      ))}

      <PRDQualityBadges scores={prd.qualityScores} />
    </div>
  )
}
```

**Key Features:**
- Markdown rendering with syntax highlighting
- Inline section editing
- Mermaid diagram support (architecture, flows)
- Table of contents with jump links
- Export button (JSON/YAML/MD/PDF)
- Version history dropdown

#### 3. PRDTemplateSelector Component
```typescript
// src/components/prd/PRDTemplateSelector.tsx

interface Template {
  id: string
  name: string
  description: string
  icon: string
  estimatedTime: string
  sections: string[]
  examples?: { title: string; preview: string }[]
}

const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'startup-mvp',
    name: 'Startup MVP',
    description: 'Lean, focused on core features and rapid iteration',
    icon: '🚀',
    estimatedTime: '10-15 min',
    sections: ['Problem', 'Solution', 'User Stories', 'MVP Scope', 'Success Metrics']
  },
  {
    id: 'enterprise-feature',
    name: 'Enterprise Feature',
    description: 'Comprehensive with compliance, security, scalability',
    icon: '🏢',
    estimatedTime: '20-30 min',
    sections: ['Business Case', 'Requirements', 'Architecture', 'Security', 'Compliance', 'Rollout']
  },
  // ... more templates
]

export function PRDTemplateSelector({ onSelect }: { onSelect: (template: Template) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {BUILTIN_TEMPLATES.map(template => (
        <Card key={template.id} onClick={() => onSelect(template)}>
          <div className="text-4xl">{template.icon}</div>
          <h3>{template.name}</h3>
          <p>{template.description}</p>
          <Badge>~{template.estimatedTime}</Badge>
        </Card>
      ))}
    </div>
  )
}
```

#### 4. PRDQualityDashboard Component
```typescript
// src/components/prd/PRDQualityDashboard.tsx

interface QualityScore {
  completeness: number  // 0-100
  clarity: number       // 0-100
  actionability: number // 0-100
  overall: number       // weighted average
  issues: QualityIssue[]
  suggestions: QualitySuggestion[]
}

interface QualityIssue {
  section: string
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion?: string
}

export function PRDQualityDashboard({ prdId }: { prdId: string }) {
  const { qualityScore, refreshScore } = usePRDQuality(prdId)

  return (
    <Card>
      <CardHeader>
        <h3>PRD Quality Score</h3>
        <Badge variant={getScoreVariant(qualityScore.overall)}>
          {qualityScore.overall}%
        </Badge>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <MetricBar label="Completeness" value={qualityScore.completeness} />
          <MetricBar label="Clarity" value={qualityScore.clarity} />
          <MetricBar label="Actionability" value={qualityScore.actionability} />
        </div>

        {qualityScore.issues.length > 0 && (
          <div className="mt-4">
            <h4>Issues Found</h4>
            {qualityScore.issues.map((issue, i) => (
              <Alert key={i} variant={issue.severity}>
                <AlertTitle>{issue.section}</AlertTitle>
                <AlertDescription>{issue.message}</AlertDescription>
                {issue.suggestion && (
                  <Button size="sm" onClick={() => applySuggestion(issue.suggestion)}>
                    Apply Fix
                  </Button>
                )}
              </Alert>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

### Backend Rust Modules

#### 1. PRD Commands Module
```rust
// src-tauri/src/commands/prd.rs

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct PRDChatMessage {
    role: String,  // "user" | "assistant"
    content: String,
    timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PRDDocument {
    id: String,
    title: String,
    template_id: Option<String>,
    sections: Vec<PRDSection>,
    quality_scores: QualityScores,
    created_at: i64,
    updated_at: i64,
    version: i32,
}

#[tauri::command]
pub async fn create_prd_session(
    template_id: Option<String>,
    project_path: String,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    // 1. Create new PRD session in database
    // 2. Analyze project context (git, code structure)
    // 3. Load template if provided
    // 4. Generate initial AI prompt
    // 5. Return session ID
}

#[tauri::command]
pub async fn send_prd_chat_message(
    session_id: String,
    message: String,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    // 1. Save user message to database
    // 2. Build context (previous messages + PRD state + project analysis)
    // 3. Call Claude API with streaming
    // 4. Emit events for each chunk: app.emit("prd_message_chunk", chunk)
    // 5. Parse AI response to extract PRD updates
    // 6. Update PRD document in database
    // 7. Run quality analysis
    // 8. Emit prd_updated and quality_score_updated events
}

#[tauri::command]
pub async fn export_prd(
    prd_id: String,
    format: String,  // "json" | "yaml" | "markdown" | "pdf" | "html"
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    // 1. Load PRD from database
    // 2. Convert to requested format
    // 3. Return file path or content
}

#[tauri::command]
pub async fn analyze_prd_quality(
    prd_id: String,
    app_state: State<'_, AppState>,
) -> Result<QualityScores, String> {
    // 1. Load PRD
    // 2. Run completeness check
    // 3. Run clarity analysis (ambiguity detection)
    // 4. Run actionability check (task extraction)
    // 5. Generate suggestions
    // 6. Save scores to database
    // 7. Return scores
}
```

#### 2. AI Integration Module
```rust
// src-tauri/src/ai/claude.rs

use reqwest::Client;
use serde_json::json;

pub struct ClaudeClient {
    api_key: String,
    client: Client,
    base_url: String,
}

impl ClaudeClient {
    pub async fn stream_completion(
        &self,
        messages: Vec<Message>,
        system: String,
        on_chunk: impl Fn(String),
    ) -> Result<String, Error> {
        let response = self.client
            .post(&format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": "claude-opus-4-5-20251101",
                "max_tokens": 4096,
                "system": system,
                "messages": messages,
                "stream": true
            }))
            .send()
            .await?;

        // Process Server-Sent Events stream
        let mut full_response = String::new();
        let mut event_stream = response.bytes_stream();

        while let Some(chunk) = event_stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            // Parse SSE format: data: {"type":"content_block_delta",...}
            for line in text.lines() {
                if line.starts_with("data: ") {
                    let json_str = &line[6..];
                    if let Ok(data) = serde_json::from_str::<StreamEvent>(json_str) {
                        if let Some(delta_text) = data.delta.text {
                            full_response.push_str(&delta_text);
                            on_chunk(delta_text);
                        }
                    }
                }
            }
        }

        Ok(full_response)
    }
}
```

#### 3. Context Analyzer Module
```rust
// src-tauri/src/prd/context_analyzer.rs

pub struct ProjectContext {
    pub language: String,
    pub framework: Option<String>,
    pub dependencies: Vec<String>,
    pub file_structure: FileTree,
    pub git_info: GitInfo,
    pub recent_commits: Vec<CommitInfo>,
}

pub fn analyze_project(project_path: &str) -> Result<ProjectContext, Error> {
    // 1. Detect language (package.json, Cargo.toml, etc.)
    // 2. Identify framework (React, Vue, Tauri, etc.)
    // 3. Parse dependencies
    // 4. Build file tree (exclude node_modules, target, etc.)
    // 5. Get git info (current branch, remote, etc.)
    // 6. Get recent commits (last 20)
    // 7. Return comprehensive context
}
```

#### 4. Quality Analyzer Module
```rust
// src-tauri/src/prd/quality_analyzer.rs

pub struct QualityAnalyzer;

impl QualityAnalyzer {
    pub fn analyze(prd: &PRDDocument) -> QualityScores {
        let completeness = Self::check_completeness(prd);
        let clarity = Self::check_clarity(prd);
        let actionability = Self::check_actionability(prd);

        QualityScores {
            completeness,
            clarity,
            actionability,
            overall: (completeness as f32 * 0.3 + clarity as f32 * 0.3 + actionability as f32 * 0.4) as u8,
            issues: Self::find_issues(prd),
            suggestions: Self::generate_suggestions(prd),
        }
    }

    fn check_completeness(prd: &PRDDocument) -> u8 {
        // Check if all required sections are filled
        // Weight by section importance
        // Return 0-100 score
    }

    fn check_clarity(prd: &PRDDocument) -> u8 {
        // Detect ambiguous terms: "simple", "fast", "easy", "good"
        // Check for specific metrics
        // Verify clear acceptance criteria
        // Return 0-100 score
    }

    fn check_actionability(prd: &PRDDocument) -> u8 {
        // Extract tasks from requirements
        // Check if tasks are SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
        // Verify dependencies are clear
        // Return 0-100 score
    }
}
```

---

## Database Schema

```sql
-- PRD Documents table
CREATE TABLE prd_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    template_id TEXT,
    content TEXT NOT NULL,  -- JSON blob of full PRD structure
    quality_score_completeness INTEGER,
    quality_score_clarity INTEGER,
    quality_score_actionability INTEGER,
    quality_score_overall INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    project_path TEXT,
    FOREIGN KEY (template_id) REFERENCES prd_templates(id)
);

-- PRD Chat Sessions table
CREATE TABLE prd_chat_sessions (
    id TEXT PRIMARY KEY,
    prd_id TEXT NOT NULL,
    messages TEXT NOT NULL,  -- JSON array of messages
    context TEXT,  -- JSON blob of project context
    created_at INTEGER NOT NULL,
    last_message_at INTEGER,
    FOREIGN KEY (prd_id) REFERENCES prd_documents(id) ON DELETE CASCADE
);

-- PRD Templates table
CREATE TABLE prd_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    system_template BOOLEAN DEFAULT 0,  -- built-in vs custom
    template_structure TEXT NOT NULL,  -- JSON blob of sections
    prompt_templates TEXT NOT NULL,  -- JSON blob of AI prompts for each section
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- PRD Versions table (for history tracking)
CREATE TABLE prd_versions (
    id TEXT PRIMARY KEY,
    prd_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,  -- JSON snapshot
    quality_scores TEXT,  -- JSON scores
    created_at INTEGER NOT NULL,
    change_summary TEXT,
    FOREIGN KEY (prd_id) REFERENCES prd_documents(id) ON DELETE CASCADE,
    UNIQUE(prd_id, version)
);

-- PRD Quality Issues table
CREATE TABLE prd_quality_issues (
    id TEXT PRIMARY KEY,
    prd_id TEXT NOT NULL,
    section TEXT NOT NULL,
    severity TEXT NOT NULL,  -- 'error' | 'warning' | 'info'
    message TEXT NOT NULL,
    suggestion TEXT,
    resolved BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (prd_id) REFERENCES prd_documents(id) ON DELETE CASCADE
);

-- Insert default templates
INSERT INTO prd_templates (id, name, description, icon, system_template, template_structure, prompt_templates, created_at, updated_at)
VALUES
(
    'startup-mvp',
    'Startup MVP',
    'Lean, focused on core features and rapid iteration',
    '🚀',
    1,
    '{
        "sections": [
            {"id": "problem", "title": "Problem Statement", "required": true},
            {"id": "solution", "title": "Proposed Solution", "required": true},
            {"id": "users", "title": "Target Users", "required": true},
            {"id": "user_stories", "title": "User Stories", "required": true},
            {"id": "mvp_scope", "title": "MVP Scope", "required": true},
            {"id": "success_metrics", "title": "Success Metrics", "required": true},
            {"id": "timeline", "title": "Timeline", "required": false}
        ]
    }',
    '{
        "problem": "Help me understand the core problem. Who experiences this problem? How painful is it? What happens if it''s not solved?",
        "solution": "Based on the problem, what solution are you proposing? What makes it better than existing alternatives?",
        "users": "Who will use this product? What are their key characteristics, goals, and pain points?",
        "user_stories": "Let''s break down the user journey. What are the core user stories for your MVP? Format as: As a [role], I want [feature], so that [benefit].",
        "mvp_scope": "What features are in scope for the MVP? What''s explicitly out of scope for now?",
        "success_metrics": "How will you measure success? What metrics matter most in the first 30, 60, 90 days?"
    }',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);
```

---

## API Design

### Tauri Commands

```typescript
// Frontend API types

interface PRDChatSession {
  id: string
  prdId: string
  messages: PRDChatMessage[]
  context: ProjectContext | null
  createdAt: number
  lastMessageAt: number | null
}

interface PRDDocument {
  id: string
  title: string
  templateId: string | null
  sections: PRDSection[]
  qualityScores: QualityScores
  createdAt: number
  updatedAt: number
  version: number
}

interface PRDSection {
  id: string
  title: string
  content: string
  required: boolean
  order: number
}

// Tauri command bindings
const prdApi = {
  // Create new PRD session with optional template
  createSession: (templateId?: string, projectPath?: string) =>
    invoke<string>('create_prd_session', { templateId, projectPath }),

  // Send message and receive streaming response via events
  sendMessage: (sessionId: string, message: string) =>
    invoke<void>('send_prd_chat_message', { sessionId, message }),

  // Get PRD by ID
  getPRD: (prdId: string) =>
    invoke<PRDDocument>('get_prd', { prdId }),

  // Update specific PRD section
  updateSection: (prdId: string, sectionId: string, content: string) =>
    invoke<void>('update_prd_section', { prdId, sectionId, content }),

  // Export PRD to various formats
  export: (prdId: string, format: 'json' | 'yaml' | 'markdown' | 'pdf' | 'html') =>
    invoke<string>('export_prd', { prdId, format }),

  // Analyze quality and get scores
  analyzeQuality: (prdId: string) =>
    invoke<QualityScores>('analyze_prd_quality', { prdId }),

  // List all PRDs
  listPRDs: () =>
    invoke<PRDDocument[]>('list_prds'),

  // Get PRD versions (history)
  getVersions: (prdId: string) =>
    invoke<PRDVersion[]>('get_prd_versions', { prdId }),

  // List available templates
  listTemplates: () =>
    invoke<PRDTemplate[]>('list_prd_templates'),

  // Create custom template
  createTemplate: (template: Omit<PRDTemplate, 'id' | 'createdAt' | 'updatedAt'>) =>
    invoke<string>('create_prd_template', { template }),
}

// Event listeners for streaming
listen<string>('prd_message_chunk', (event) => {
  // Append chunk to current message
})

listen<PRDDocument>('prd_updated', (event) => {
  // Update PRD preview
})

listen<QualityScores>('quality_score_updated', (event) => {
  // Update quality dashboard
})
```

---

## Integration Points

### 1. Integration with Existing Task System

```typescript
// After PRD is finalized, convert to tasks

async function convertPRDToTasks(prdId: string): Promise<string[]> {
  // 1. Export PRD to Markdown format
  const markdownPath = await prdApi.export(prdId, 'markdown')

  // 2. Use existing PRD import functionality
  const sessionId = useTaskStore.getState().currentSessionId
  const tasks = await taskApi.importPRD({
    sessionId,
    content: await readFile(markdownPath),
    format: 'markdown'
  })

  // 3. Return created task IDs
  return tasks.map(t => t.id)
}
```

### 2. Integration with Git Analysis

```rust
// Provide git context to AI for better suggestions

use crate::git::GitManager;

pub async fn gather_git_context(project_path: &str) -> GitContext {
    let git = GitManager::new(project_path)?;

    GitContext {
        current_branch: git.current_branch()?,
        recent_commits: git.log(20)?,
        branches: git.list_branches()?,
        contributors: git.contributors()?,
        commit_frequency: git.analyze_commit_frequency()?,
    }
}
```

### 3. Integration with Agent System

```typescript
// Link PRD to agent execution

interface Task {
  // ... existing fields
  prdId?: string  // Reference to source PRD
  prdSection?: string  // Specific PRD section this task implements
}

// When starting agent, include PRD context
async function startAgentWithPRDContext(taskId: string) {
  const task = await taskApi.getTask(taskId)

  if (task.prdId) {
    const prd = await prdApi.getPRD(task.prdId)
    const section = prd.sections.find(s => s.id === task.prdSection)

    // Include PRD context in agent prompt
    await agentApi.start({
      taskId,
      additionalContext: `
        This task implements the following requirement from the PRD:

        ${section?.title}
        ${section?.content}

        Ensure your implementation aligns with these requirements.
      `
    })
  }
}
```

---

## Implementation Roadmap

### Week 15.5: Foundation & UI (Days 1-3)

**Day 1: Project Setup**
- [ ] Create `src/components/prd/` directory structure
- [ ] Create `src-tauri/src/prd/` Rust module
- [ ] Add dependencies:
  - Frontend: `react-markdown`, `mermaid`, `@anthropic-ai/sdk` types
  - Backend: `reqwest`, `tokio-stream`
- [ ] Set up database migrations for new tables
- [ ] Create basic Zustand stores (`prdChatStore`, `prdDocStore`)

**Day 2: Chat UI**
- [ ] Build `PRDChatPanel` component
- [ ] Implement message rendering with markdown
- [ ] Add streaming message support
- [ ] Create `PRDChatInput` with autocomplete

**Day 3: Preview UI**
- [ ] Build `PRDPreview` component
- [ ] Add markdown rendering with syntax highlighting
- [ ] Implement section navigation
- [ ] Create inline editing mode

### Week 16: Core Functionality (Days 4-8)

**Day 4: Template System**
- [ ] Create template database schema
- [ ] Build `PRDTemplateSelector` component
- [ ] Implement 5 built-in templates
- [ ] Add template loading logic

**Day 5: AI Integration**
- [ ] Implement `ClaudeClient` in Rust
- [ ] Set up streaming API calls
- [ ] Create prompt engineering system
- [ ] Add token tracking

**Day 6-7: Guided Workflow**
- [ ] Implement multi-step PRD builder
- [ ] Create section-by-section prompts
- [ ] Build context-aware suggestion system
- [ ] Add progressive disclosure UI

**Day 8: Context Analysis**
- [ ] Implement project context analyzer
- [ ] Add git history analysis
- [ ] Create code structure detection
- [ ] Build dependency detection

### Week 16.5: Quality & Export (Days 9-12)

**Day 9: Quality Analysis**
- [ ] Build completeness checker
- [ ] Implement clarity analyzer (ambiguity detection)
- [ ] Create actionability scorer
- [ ] Add issue detection system

**Day 10: Quality Dashboard**
- [ ] Build `PRDQualityDashboard` component
- [ ] Add metric visualization
- [ ] Implement suggestion system
- [ ] Create auto-fix capabilities

**Day 11: Export System**
- [ ] Implement JSON export
- [ ] Add YAML export
- [ ] Create Markdown export (enhanced)
- [ ] Build PDF generation (using headless Chrome)
- [ ] Add HTML export

**Day 12: Templates & Best Practices**
- [ ] Document template structure
- [ ] Add template examples
- [ ] Create custom template builder
- [ ] Implement template sharing

### Week 17: Integration & Polish (Days 13-17)

**Day 13: Task Integration**
- [ ] Connect PRD export to task import
- [ ] Implement automatic task creation
- [ ] Add PRD-to-task mapping
- [ ] Create dependency inference

**Day 14: Versioning**
- [ ] Implement PRD version control
- [ ] Build diff viewer
- [ ] Add rollback functionality
- [ ] Create changelog generation

**Day 15: Advanced Features**
- [ ] Implement similar PRD detection
- [ ] Add historical data analysis
- [ ] Create effort estimation
- [ ] Build risk prediction

**Day 16: Testing**
- [ ] Write unit tests (quality analyzer, exporters)
- [ ] Add integration tests (AI API mocks)
- [ ] Create E2E tests (full PRD creation flow)
- [ ] Performance testing (large PRDs)

**Day 17: Documentation & Polish**
- [ ] Write user guide with screenshots
- [ ] Create video walkthrough
- [ ] Add inline help/tooltips
- [ ] Final UI polish

---

## Testing Strategy

### Unit Tests

```typescript
// Frontend component tests
describe('PRDChatPanel', () => {
  it('displays messages correctly', () => {})
  it('streams AI responses with typewriter effect', () => {})
  it('handles errors gracefully', () => {})
  it('saves messages to store', () => {})
})

describe('PRDQualityAnalyzer', () => {
  it('detects missing required sections', () => {})
  it('identifies ambiguous terms', () => {})
  it('extracts actionable tasks', () => {})
  it('calculates correct scores', () => {})
})
```

```rust
// Backend Rust tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_completeness_checker() {
        let prd = create_test_prd();
        let score = QualityAnalyzer::check_completeness(&prd);
        assert_eq!(score, 85);
    }

    #[test]
    fn test_ambiguity_detection() {
        let content = "We need a simple and fast interface";
        let issues = detect_ambiguity(content);
        assert_eq!(issues.len(), 2);  // "simple" and "fast"
    }

    #[tokio::test]
    async fn test_claude_streaming() {
        let client = ClaudeClient::new("test_key");
        let chunks = vec![];
        client.stream_completion(
            vec![Message { role: "user", content: "Hello" }],
            "You are a helpful assistant",
            |chunk| chunks.push(chunk)
        ).await.unwrap();
        assert!(!chunks.is_empty());
    }
}
```

### Integration Tests

```typescript
// Test full PRD creation flow
describe('PRD Creation E2E', () => {
  it('creates PRD from startup MVP template', async () => {
    const sessionId = await prdApi.createSession('startup-mvp', '/test/project')
    await prdApi.sendMessage(sessionId, 'Build a task manager')

    // Wait for AI response
    await waitFor(() => expect(store.currentPRD).toBeDefined())

    // Verify PRD structure
    expect(store.currentPRD.sections).toHaveLength(7)
    expect(store.currentPRD.qualityScores.overall).toBeGreaterThan(70)
  })
})
```

### Performance Tests

```typescript
// Test large PRD handling
describe('Performance', () => {
  it('handles PRD with 50+ sections', async () => {
    const largePRD = createLargePRD(50)
    const start = performance.now()
    await prdApi.analyzeQuality(largePRD.id)
    const end = performance.now()

    expect(end - start).toBeLessThan(3000)  // < 3 seconds
  })

  it('streams AI responses without blocking UI', async () => {
    const sessionId = await prdApi.createSession()
    await prdApi.sendMessage(sessionId, 'Create comprehensive PRD')

    // UI should remain responsive during streaming
    expect(isUIResponsive()).toBe(true)
  })
})
```

---

## Security & Privacy

### API Key Management

```rust
// Use system keychain for API key storage
use keyring::Entry;

pub fn get_anthropic_api_key() -> Result<String, Error> {
    let entry = Entry::new("ralph-ui", "anthropic_api_key")?;
    entry.get_password()
        .map_err(|e| Error::KeychainError(e))
}

pub fn set_anthropic_api_key(key: &str) -> Result<(), Error> {
    let entry = Entry::new("ralph-ui", "anthropic_api_key")?;
    entry.set_password(key)
        .map_err(|e| Error::KeychainError(e))
}
```

### Data Privacy

- **No telemetry**: All PRD content stays local
- **Optional cloud sync**: Users can opt-in to cloud backup (encrypted)
- **API key security**: Never log or expose API keys
- **Project context**: Only send minimal necessary context to AI

### Cost Controls

```typescript
// Token usage tracking and limits
interface CostLimits {
  maxTokensPerSession: number      // Default: 50,000
  maxCostPerSession: number         // Default: $5
  warnAtPercentage: number          // Default: 80%
}

// Monitor usage in real-time
function checkCostLimits(usage: TokenUsage, limits: CostLimits) {
  const estimatedCost = (usage.inputTokens * 0.015 + usage.outputTokens * 0.075) / 1000

  if (estimatedCost > limits.maxCostPerSession) {
    throw new Error('Cost limit exceeded')
  }

  if (estimatedCost > limits.maxCostPerSession * (limits.warnAtPercentage / 100)) {
    showWarning(`Approaching cost limit: $${estimatedCost.toFixed(2)}`)
  }
}
```

---

## Performance Optimization

### Frontend Optimizations

1. **Lazy Loading**: Load PRD components only when needed
2. **Virtual Scrolling**: For long message histories
3. **Debounced Updates**: Batch PRD preview updates
4. **Memoization**: Cache expensive computations

```typescript
// Example: Memoized quality calculation
const qualityScore = useMemo(() =>
  calculateQualityScore(prd),
  [prd.sections, prd.version]
)

// Virtual scrolling for messages
import { useVirtualizer } from '@tanstack/react-virtual'

function PRDMessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      {virtualizer.getVirtualItems().map(virtualItem => (
        <div key={virtualItem.key} style={{ height: virtualItem.size }}>
          <MessageBubble message={messages[virtualItem.index]} />
        </div>
      ))}
    </div>
  )
}
```

### Backend Optimizations

1. **Connection Pooling**: Reuse HTTP connections to Anthropic API
2. **Caching**: Cache project context analysis (invalidate on file changes)
3. **Streaming**: Use streaming for AI responses to reduce perceived latency
4. **Parallel Processing**: Run quality analysis in background thread

```rust
// Example: Cached context analysis
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ContextCache {
    cache: Arc<RwLock<HashMap<String, (ProjectContext, SystemTime)>>>,
}

impl ContextCache {
    pub async fn get_or_analyze(&self, project_path: &str) -> ProjectContext {
        let cache = self.cache.read().await;

        if let Some((context, timestamp)) = cache.get(project_path) {
            // Cache valid for 5 minutes
            if timestamp.elapsed().unwrap().as_secs() < 300 {
                return context.clone();
            }
        }

        drop(cache);  // Release read lock

        // Analyze and cache
        let context = analyze_project(project_path).await;
        let mut cache = self.cache.write().await;
        cache.insert(project_path.to_string(), (context.clone(), SystemTime::now()));

        context
    }
}
```

---

## Conclusion

Phase 7.5 transforms Ralph UI from a PRD **consumer** to a PRD **creator**, empowering users to build comprehensive product requirements documents with AI guidance in minutes instead of hours.

**Key Innovations:**
- ✅ Conversational PRD creation (no blank page syndrome)
- ✅ Context-aware suggestions (analyzes existing code)
- ✅ Quality scoring (ensures completeness, clarity, actionability)
- ✅ Seamless integration (PRD → Tasks → Agents in one flow)
- ✅ Modern UX patterns (scaffolding, streaming, generative UI)

**Success Criteria:**
- Average PRD creation time < 15 minutes
- User satisfaction > 4/5 stars
- Quality scores consistently > 80%
- Zero security vulnerabilities related to API key handling
- AI response latency p95 < 3 seconds

This phase positions Ralph UI as a **complete product development platform**, not just an agent orchestration tool.

---

**Next Steps:**
1. Review and approve this design document
2. Begin Week 15.5 implementation (Day 1: Project Setup)
3. Set up daily standups for progress tracking
4. Schedule design review after UI mockups (Day 3)

**Document Status:** ✅ READY FOR REVIEW
**Last Updated:** January 17, 2026
