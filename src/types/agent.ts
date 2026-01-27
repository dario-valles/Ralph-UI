// Agent types for AI coding agents

export type AgentType = 'claude' | 'opencode' | 'cursor' | 'codex' | 'qwen' | 'droid' | 'gemini'

/** Agent display names for UI */
const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  claude: 'Claude',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  codex: 'Codex',
  qwen: 'Qwen',
  droid: 'Droid',
  gemini: 'Gemini',
}

/** Format agent type for display in UI */
export function formatAgentName(agent: AgentType): string {
  return AGENT_DISPLAY_NAMES[agent] || agent.charAt(0).toUpperCase() + agent.slice(1)
}

/**
 * Parse a composite agent:provider value into its components
 * Examples:
 *   "claude" -> { agentType: "claude", providerId: undefined }
 *   "claude:zai" -> { agentType: "claude", providerId: "zai" }
 *   "cursor" -> { agentType: "cursor", providerId: undefined }
 */
export function parseAgentWithProvider(value: string): {
  agentType: AgentType
  providerId?: string
} {
  const [agentPart, providerPart] = value.split(':')
  return {
    agentType: agentPart as AgentType,
    providerId: providerPart || undefined,
  }
}

/**
 * Format agent type with optional provider for display
 * Examples:
 *   ("claude", undefined) -> "Claude"
 *   ("claude", "Z.AI") -> "Claude (Z.AI)"
 *   ("cursor", undefined) -> "Cursor"
 */
export function formatAgentWithProvider(agentType: AgentType, providerName?: string): string {
  const agentName = formatAgentName(agentType)
  if (providerName && providerName !== 'Anthropic (Direct)') {
    return `${agentName} (${providerName})`
  }
  return agentName
}

/**
 * Build a composite value for agent selector options
 * Examples:
 *   ("claude", "anthropic") -> "claude"
 *   ("claude", "zai") -> "claude:zai"
 */
export function buildAgentProviderValue(agentType: AgentType, providerId?: string): string {
  if (!providerId || providerId === 'anthropic') {
    return agentType
  }
  return `${agentType}:${providerId}`
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

/** Status information for an AI agent CLI tool */
export interface AgentStatusInfo {
  /** The agent type identifier */
  agentType: AgentType
  /** Whether the agent CLI is available on the system */
  available: boolean
  /** Human-readable display name */
  displayName: string
  /** The CLI command name (e.g., "claude", "cursor-agent") */
  cliCommand: string
  /** Installation hint/command for users who don't have it */
  installHint: string
}
