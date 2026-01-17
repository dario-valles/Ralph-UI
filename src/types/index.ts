// Core domain types based on the implementation plan

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: number
  dependencies: string[] // Task IDs
  assignedAgent?: string
  estimatedTokens?: number
  actualTokens?: number
  startedAt?: Date
  completedAt?: Date
  branch?: string
  worktreePath?: string
  error?: string
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed'
export type AgentType = 'claude' | 'opencode' | 'cursor'

export interface SessionConfig {
  maxParallel: number
  maxIterations: number
  maxRetries: number
  agentType: AgentType
  autoCreatePRs: boolean
  draftPRs: boolean
  runTests: boolean
  runLint: boolean
}

export interface Session {
  id: string
  name: string
  projectPath: string
  createdAt: Date
  lastResumedAt?: Date
  status: SessionStatus
  config: SessionConfig
  tasks: Task[]
  totalCost: number
  totalTokens: number
}

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'implementing'
  | 'testing'
  | 'committing'

export interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export interface Agent {
  id: string
  sessionId: string
  taskId: string
  status: AgentStatus
  processId?: number
  worktreePath: string
  branch: string
  iterationCount: number
  tokens: number
  cost: number
  logs: LogEntry[]
  subagents: Agent[] // Nested agent calls
}
