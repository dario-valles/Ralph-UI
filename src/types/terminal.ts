// Terminal feature types

/**
 * Terminal type - shell (normal) or agent (connected to an agent process)
 */
export type TerminalType = 'shell' | 'agent'

/**
 * Agent terminal status
 */
export type AgentTerminalStatus = 'running' | 'exited'

/**
 * Represents a single terminal instance
 */
export interface TerminalInstance {
  id: string
  title: string
  cwd: string
  isActive: boolean
  createdAt: string
  /** Type of terminal - 'shell' for normal terminals, 'agent' for agent terminals */
  terminalType: TerminalType
  /** Agent ID if this is an agent terminal */
  agentId?: string
  /** Status of the agent terminal */
  agentStatus?: AgentTerminalStatus
}

/**
 * Direction for splitting terminal panes
 */
export type SplitDirection = 'horizontal' | 'vertical'

/**
 * Represents a terminal pane (for split views)
 */
export interface TerminalPane {
  id: string
  terminalId: string
  splitDirection?: SplitDirection
  children?: TerminalPane[]
  size: number // Percentage (0-100)
}

/**
 * Terminal panel display modes
 */
export type TerminalPanelMode = 'closed' | 'minimized' | 'panel' | 'full'

/**
 * Terminal store state shape
 */
export interface TerminalState {
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  panelMode: TerminalPanelMode
  panelHeight: number // Percentage (10-90)
  paneLayout: TerminalPane | null
}

/**
 * Options for spawning a new terminal
 */
export interface SpawnOptions {
  cwd?: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
}
