// Agent types for AI coding agents

export type AgentType = 'claude' | 'opencode' | 'cursor' | 'codex' | 'qwen' | 'droid'

/** Agent display names for UI */
const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  claude: 'Claude',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  codex: 'Codex',
  qwen: 'Qwen',
  droid: 'Droid',
}

/** Format agent type for display in UI */
export function formatAgentName(agent: AgentType): string {
  return AGENT_DISPLAY_NAMES[agent] || agent.charAt(0).toUpperCase() + agent.slice(1)
}

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'implementing'
  | 'testing'
  | 'committing'

export interface LogEntry {
  timestamp: string // RFC3339 timestamp from backend
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
