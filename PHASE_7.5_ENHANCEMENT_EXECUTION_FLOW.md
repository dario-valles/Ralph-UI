# Phase 7.5 Enhancement: PRD to Execution Flow

**Date:** January 17, 2026
**Enhancement Type:** User Experience Improvement
**Priority:** High

---

## Problem Statement

The current Phase 7.5 design focuses on PRD creation but doesn't clearly define the **"what happens next"** flow - how users seamlessly transition from a completed PRD to actually executing the tasks with AI agents.

## Proposed Enhancement: One-Click PRD Execution

### User Flow

```
PRD Created → Review Quality → Export & Create Tasks → Start Execution
     ↓              ↓                    ↓                    ↓
  AI Chat      Quality Score        Task Creation      Agent Assignment
                  82%                 24 tasks              Auto
```

### UI/UX Design

#### 1. PRD Completion Screen

After finalizing a PRD, show an action sheet:

```
┌────────────────────────────────────────────────────────┐
│  🎉 PRD Complete!                                      │
├────────────────────────────────────────────────────────┤
│  Your PRD "Task Manager MVP" is ready                 │
│                                                         │
│  📊 Quality Score: 85% (Excellent)                    │
│  ✅ 24 tasks extracted                                │
│  📈 Estimated: ~8,500 tokens                          │
│                                                         │
│  What would you like to do?                            │
│                                                         │
│  [🚀 Create Tasks & Start Execution]  ← PRIMARY ACTION│
│  [📄 Export PRD Only]                                  │
│  [✏️  Continue Editing]                                │
└────────────────────────────────────────────────────────┘
```

#### 2. Task Creation & Agent Configuration

When user clicks **"Create Tasks & Start Execution"**:

```
┌────────────────────────────────────────────────────────┐
│  Configure Execution                                   │
├────────────────────────────────────────────────────────┤
│  Session Name: [Task Manager MVP - Jan 17 2026    ]   │
│                                                         │
│  Agent Type:   [Claude Code ▼]                        │
│                □ OpenCode  ☑ Claude  □ Cursor         │
│                                                         │
│  Execution Mode:                                       │
│  ○ Sequential (One task at a time)                    │
│  ● Parallel (Up to 3 agents)                          │
│                                                         │
│  Task Priority:                                        │
│  ☑ High Priority Tasks First                          │
│  ☑ Respect Dependencies                               │
│                                                         │
│  Limits:                                               │
│  Max Iterations:  [10      ] per task                 │
│  Cost Limit:      [$50     ] per session              │
│                                                         │
│  Git Configuration:                                    │
│  Branch Prefix:   [feature/task-manager-    ]         │
│  ☑ Create worktrees for parallel execution            │
│  ☑ Auto-create PRs when tasks complete                │
│                                                         │
│  [← Back]  [Start Execution →]                        │
└────────────────────────────────────────────────────────┘
```

#### 3. Execution Dashboard

After starting, redirect to Agent Monitor with PRD context:

```
┌────────────────────────────────────────────────────────┐
│  Executing: Task Manager MVP                           │
│  From PRD: prd_abc123                          [View]  │
├────────────────────────────────────────────────────────┤
│  Progress: 3/24 tasks completed (12.5%)                │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
│                                                         │
│  Active Agents (3/3):                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Agent 1: Implementing user authentication       │  │
│  │ Status: Implementing | Iteration 3/10            │  │
│  │ Branch: feature/task-manager-auth                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Agent 2: Building task list UI                  │  │
│  │ Status: Testing | Iteration 5/10                 │  │
│  │ Branch: feature/task-manager-task-list           │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Agent 3: Setting up database schema              │  │
│  │ Status: Committing | Iteration 2/10              │  │
│  │ Branch: feature/task-manager-db                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Completed Tasks:                                      │
│  ✅ Initialize project structure                      │
│  ✅ Set up development environment                    │
│  ✅ Configure build pipeline                          │
│                                                         │
│  [Pause All] [View PRD] [View Logs]                   │
└────────────────────────────────────────────────────────┘
```

### Technical Implementation

#### 1. New Tauri Command: `execute_prd`

```rust
// src-tauri/src/commands/prd.rs

#[tauri::command]
pub async fn execute_prd(
    prd_id: String,
    config: ExecutionConfig,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    // 1. Load PRD from database
    let prd = app_state.db.get_prd(&prd_id)?;

    // 2. Export PRD to temporary markdown file
    let temp_md = export_prd_to_temp(&prd)?;

    // 3. Parse markdown into tasks using existing parser
    let parsed_prd = crate::parsers::parse_prd_auto(&temp_md)?;

    // 4. Create session for this execution
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = Session {
        id: session_id.clone(),
        name: config.session_name.unwrap_or(format!("{} Execution", prd.title)),
        project_path: config.project_path,
        created_at: SystemTime::now(),
        status: SessionStatus::Active,
        config: config.into_session_config(),
        tasks: vec![],
        total_cost: 0.0,
        total_tokens: 0,
    };
    app_state.db.create_session(&session)?;

    // 5. Create tasks in database with PRD reference
    let mut task_ids = vec![];
    for prd_task in parsed_prd.tasks {
        let task = Task {
            id: uuid::Uuid::new_v4().to_string(),
            title: prd_task.title,
            description: prd_task.description,
            status: TaskStatus::Pending,
            priority: prd_task.priority,
            dependencies: prd_task.dependencies,
            session_id: session_id.clone(),
            prd_id: Some(prd_id.clone()),  // Link back to PRD!
            prd_section: prd_task.section,
            ..Default::default()
        };
        app_state.db.create_task(&task)?;
        task_ids.push(task.id);
    }

    // 6. Start agent execution based on mode
    match config.execution_mode {
        ExecutionMode::Sequential => {
            // Start first task only
            if let Some(first_task_id) = task_ids.first() {
                start_agent_for_task(first_task_id, &config, &app_state).await?;
            }
        }
        ExecutionMode::Parallel => {
            // Start up to N tasks based on max_parallel
            let tasks_to_start = task_ids.iter()
                .take(config.max_parallel as usize);

            for task_id in tasks_to_start {
                start_agent_for_task(task_id, &config, &app_state).await?;
            }
        }
    }

    // 7. Return session ID for UI to navigate to
    Ok(session_id)
}

#[derive(Debug, Deserialize)]
pub struct ExecutionConfig {
    session_name: Option<String>,
    project_path: String,
    agent_type: AgentType,  // Claude, OpenCode, Cursor
    execution_mode: ExecutionMode,  // Sequential, Parallel
    max_parallel: u8,
    max_iterations: u32,
    cost_limit: f64,
    branch_prefix: String,
    create_worktrees: bool,
    auto_create_prs: bool,
    priority_based: bool,
    respect_dependencies: bool,
}

#[derive(Debug, Deserialize)]
pub enum ExecutionMode {
    Sequential,
    Parallel,
}
```

#### 2. Frontend Integration

```typescript
// src/lib/tauri-api.ts - Add new API method

const prdApi = {
  // ... existing methods

  // New method for one-click execution
  executeFromPRD: (prdId: string, config: ExecutionConfig) =>
    invoke<string>('execute_prd', { prdId, config }),
}

// src/components/prd/PRDExecutionDialog.tsx

interface PRDExecutionDialogProps {
  prdId: string
  onSuccess: (sessionId: string) => void
}

export function PRDExecutionDialog({ prdId, onSuccess }: PRDExecutionDialogProps) {
  const [config, setConfig] = useState<ExecutionConfig>({
    agentType: 'claude',
    executionMode: 'parallel',
    maxParallel: 3,
    maxIterations: 10,
    costLimit: 50,
    branchPrefix: 'feature/',
    createWorktrees: true,
    autoCreatePRs: true,
    priorityBased: true,
    respectDependencies: true,
  })

  const handleExecute = async () => {
    try {
      const sessionId = await prdApi.executeFromPRD(prdId, config)
      toast.success('Execution started! Redirecting to agent monitor...')
      onSuccess(sessionId)
      // Navigate to agent monitor
      router.push(`/agents?session=${sessionId}`)
    } catch (error) {
      toast.error(`Failed to start execution: ${error}`)
    }
  }

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Execution</DialogTitle>
        </DialogHeader>

        {/* Form fields for all config options */}
        <Form config={config} onChange={setConfig} />

        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button onClick={handleExecute}>Start Execution</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### 3. Enhanced Task Model

Update the Task model to include PRD reference:

```typescript
// src/types/task.ts

interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  priority: number
  dependencies: string[]  // Task IDs
  sessionId: string

  // NEW: PRD integration fields
  prdId?: string           // Reference to source PRD
  prdSection?: string      // Which PRD section this implements
  prdRequirement?: string  // Specific requirement text from PRD

  assignedAgent?: string
  estimatedTokens?: number
  actualTokens?: number
  startedAt?: Date
  completedAt?: Date
  branch?: string
  worktreePath?: string
  error?: string
}
```

### User Stories

#### Story 1: Quick Start from PRD
**As a** product manager
**I want to** immediately start execution after creating a PRD
**So that** I don't have to manually export, import, and configure agents

**Acceptance Criteria:**
- [ ] "Create Tasks & Start Execution" button appears on PRD completion
- [ ] Button opens configuration dialog with smart defaults
- [ ] Clicking "Start Execution" creates tasks and launches agents
- [ ] User is redirected to agent monitor showing progress
- [ ] All tasks link back to source PRD for context

#### Story 2: Review Before Execute
**As a** tech lead
**I want to** review extracted tasks before starting execution
**So that** I can verify the AI correctly interpreted the PRD

**Acceptance Criteria:**
- [ ] "Export PRD Only" option creates tasks without starting agents
- [ ] Tasks page shows preview of extracted tasks
- [ ] User can edit/remove tasks before execution
- [ ] "Start Execution" button available on tasks page for PRD-sourced tasks

#### Story 3: Resume PRD Execution
**As a** developer
**I want to** resume execution of a partially completed PRD
**So that** I can continue work after pausing or failures

**Acceptance Criteria:**
- [ ] PRD history shows execution status (Not Started, In Progress, Completed, Failed)
- [ ] "Resume Execution" button for in-progress PRDs
- [ ] Resuming continues from where it left off (skips completed tasks)
- [ ] Agent monitor shows which tasks are from resumed PRD

### Database Schema Updates

```sql
-- Add PRD execution tracking
CREATE TABLE prd_executions (
    id TEXT PRIMARY KEY,
    prd_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL,  -- 'not_started' | 'in_progress' | 'completed' | 'failed' | 'paused'
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    total_tasks INTEGER NOT NULL,
    completed_tasks INTEGER DEFAULT 0,
    failed_tasks INTEGER DEFAULT 0,
    config TEXT NOT NULL,  -- JSON ExecutionConfig
    FOREIGN KEY (prd_id) REFERENCES prd_documents(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Update tasks table to include PRD reference
ALTER TABLE tasks ADD COLUMN prd_id TEXT;
ALTER TABLE tasks ADD COLUMN prd_section TEXT;
ALTER TABLE tasks ADD COLUMN prd_requirement TEXT;
ALTER TABLE tasks ADD FOREIGN KEY (prd_id) REFERENCES prd_documents(id);
```

### Navigation Flow

```
PRD Chat → Complete PRD → Action Sheet
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
            Start Execution      Export Only
                    ↓                   ↓
            Config Dialog        Tasks Preview
                    ↓                   ↓
            Agent Monitor        (optional) Start Later
                    ↓
            Task Completion
                    ↓
            PRs Created
                    ↓
            Done! 🎉
```

### Success Metrics

- **Time to First Agent**: < 30 seconds from PRD completion to agent start
- **User Confusion Rate**: < 10% users asking "what's next?"
- **Execution Success Rate**: > 80% of PRD executions complete successfully
- **User Satisfaction**: > 4.5/5 for "ease of going from PRD to execution"

### Implementation Priority

**Priority:** HIGH - This is a critical UX gap

**Estimated Effort:** 2-3 days (within Week 17 of Phase 7.5)

**Breakdown:**
- Day 1: Backend `execute_prd` command + database schema
- Day 2: Frontend dialog + navigation flow
- Day 3: Testing + polish

### Benefits

1. **Seamless UX**: One-click from idea to execution
2. **Context Preservation**: Agents have access to full PRD context
3. **Traceability**: Every task links back to PRD requirement
4. **Resume Capability**: Can pause/resume PRD execution
5. **Reduced Friction**: No manual export/import/configure steps

---

## Recommendation

**Add this enhancement to Phase 7.5, Week 17** (Integration week)

Update the implementation plan to include:
- [ ] `execute_prd` Tauri command
- [ ] PRDExecutionDialog component
- [ ] Database schema updates for execution tracking
- [ ] Navigation flow from PRD completion to agent monitor
- [ ] E2E test: Create PRD → Execute → Monitor → Complete

This makes Phase 7.5 a **complete feature** rather than just PRD creation.

---

**Status:** ✅ READY FOR INCLUSION IN PHASE 7.5
**Last Updated:** January 17, 2026
