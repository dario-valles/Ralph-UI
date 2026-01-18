// Configuration API wrappers for backend commands

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type {
  RalphConfig,
  RalphExecutionConfig,
  RalphGitConfig,
  RalphValidationConfig,
  RalphFallbackSettings,
  ConfigPaths,
  TemplateInfo,
  RenderRequest,
  StaleLockInfo,
  RecoveryResult,
  SubagentEvent,
  SubagentTree,
  SubagentTreeSummary,
} from '@/types'

// Check if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Safe invoke wrapper that handles the case when Tauri isn't available
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri || typeof tauriInvoke !== 'function') {
    throw new Error(`Tauri is not available. Command '${cmd}' cannot be executed outside of Tauri.`)
  }
  return tauriInvoke<T>(cmd, args)
}

// ============================================================================
// Configuration API
// ============================================================================

export const configApi = {
  /**
   * Get the current merged configuration
   */
  get: async (): Promise<RalphConfig> => {
    return await invoke('get_config')
  },

  /**
   * Set the project path and reload configuration
   */
  setProjectPath: async (projectPath?: string): Promise<RalphConfig> => {
    return await invoke('set_config_project_path', { projectPath })
  },

  /**
   * Get configuration file paths
   */
  getPaths: async (): Promise<ConfigPaths> => {
    return await invoke('get_config_paths_cmd')
  },

  /**
   * Update execution configuration
   */
  updateExecution: async (config: Partial<RalphExecutionConfig>): Promise<RalphExecutionConfig> => {
    return await invoke('update_execution_config', {
      maxParallel: config.maxParallel,
      maxIterations: config.maxIterations,
      maxRetries: config.maxRetries,
      agentType: config.agentType,
      strategy: config.strategy,
      model: config.model,
    })
  },

  /**
   * Update git configuration
   */
  updateGit: async (config: Partial<RalphGitConfig>): Promise<RalphGitConfig> => {
    return await invoke('update_git_config', {
      autoCreatePrs: config.autoCreatePrs,
      draftPrs: config.draftPrs,
      branchPattern: config.branchPattern,
    })
  },

  /**
   * Update validation configuration
   */
  updateValidation: async (config: Partial<RalphValidationConfig>): Promise<RalphValidationConfig> => {
    return await invoke('update_validation_config', {
      runTests: config.runTests,
      runLint: config.runLint,
      testCommand: config.testCommand,
      lintCommand: config.lintCommand,
    })
  },

  /**
   * Update fallback configuration
   */
  updateFallback: async (config: Partial<RalphFallbackSettings>): Promise<RalphFallbackSettings> => {
    return await invoke('update_fallback_config', {
      enabled: config.enabled,
      baseBackoffMs: config.baseBackoffMs,
      maxBackoffMs: config.maxBackoffMs,
      fallbackAgent: config.fallbackAgent,
      fallbackModel: config.fallbackModel,
    })
  },

  /**
   * Reload configuration from files
   */
  reload: async (): Promise<RalphConfig> => {
    return await invoke('reload_config')
  },

  /**
   * Save configuration to file
   * Saves to project config if project path is set, otherwise global config
   */
  save: async (): Promise<void> => {
    return await invoke('save_config')
  },
}

// ============================================================================
// Template API
// ============================================================================

export const templateApi = {
  /**
   * List all available templates
   */
  list: async (projectPath?: string): Promise<TemplateInfo[]> => {
    return await invoke('list_templates', { projectPath })
  },

  /**
   * List builtin template names
   */
  listBuiltin: async (): Promise<string[]> => {
    return await invoke('list_builtin_templates')
  },

  /**
   * Render a template with context
   */
  render: async (request: RenderRequest): Promise<string> => {
    return await invoke('render_template', { request })
  },

  /**
   * Render task prompt using template system
   */
  renderTaskPrompt: async (taskId: string, templateName?: string): Promise<string> => {
    return await invoke('render_task_prompt', { taskId, templateName })
  },

  /**
   * Get template content by name
   */
  getContent: async (name: string, projectPath?: string): Promise<string> => {
    return await invoke('get_template_content', { name, projectPath })
  },
}

// ============================================================================
// Recovery API
// ============================================================================

export const recoveryApi = {
  /**
   * Check for stale sessions that need recovery
   */
  checkStaleSessions: async (projectPath: string): Promise<StaleLockInfo[]> => {
    return await invoke('check_stale_sessions', { projectPath })
  },

  /**
   * Recover a single stale session
   */
  recoverSession: async (projectPath: string, sessionId: string): Promise<RecoveryResult> => {
    return await invoke('recover_stale_session', { projectPath, sessionId })
  },

  /**
   * Recover all stale sessions
   */
  recoverAll: async (projectPath: string): Promise<RecoveryResult[]> => {
    return await invoke('recover_all_stale_sessions', { projectPath })
  },

  /**
   * Acquire session lock
   */
  acquireLock: async (projectPath: string, sessionId: string): Promise<boolean> => {
    return await invoke('acquire_session_lock', { projectPath, sessionId })
  },

  /**
   * Release session lock
   */
  releaseLock: async (projectPath: string, sessionId: string): Promise<void> => {
    return await invoke('release_session_lock', { projectPath, sessionId })
  },

  /**
   * Get session lock info
   */
  getLockInfo: async (projectPath: string, sessionId: string): Promise<StaleLockInfo | null> => {
    return await invoke('get_session_lock_info', { projectPath, sessionId })
  },

  /**
   * Refresh session lock (heartbeat)
   */
  refreshLock: async (projectPath: string, sessionId: string): Promise<void> => {
    return await invoke('refresh_session_lock', { projectPath, sessionId })
  },
}

// ============================================================================
// Subagent Trace API
// ============================================================================

export const traceApi = {
  /**
   * Initialize trace parser for an agent
   */
  init: async (agentId: string): Promise<void> => {
    return await invoke('init_trace_parser', { agentId })
  },

  /**
   * Parse agent output for subagent events
   */
  parseOutput: async (agentId: string, output: string): Promise<SubagentEvent[]> => {
    return await invoke('parse_agent_output', { agentId, output })
  },

  /**
   * Get subagent tree for an agent
   */
  getTree: async (agentId: string): Promise<SubagentTree | null> => {
    return await invoke('get_subagent_tree', { agentId })
  },

  /**
   * Get subagent tree summary
   */
  getSummary: async (agentId: string): Promise<SubagentTreeSummary | null> => {
    return await invoke('get_subagent_summary', { agentId })
  },

  /**
   * Get events for a specific subagent
   */
  getSubagentEvents: async (agentId: string, subagentId: string): Promise<SubagentEvent[]> => {
    return await invoke('get_subagent_events', { agentId, subagentId })
  },

  /**
   * Clear trace data for an agent
   */
  clear: async (agentId: string): Promise<void> => {
    return await invoke('clear_trace_data', { agentId })
  },

  /**
   * Check if a subagent is active
   */
  isSubagentActive: async (agentId: string, subagentId: string): Promise<boolean> => {
    return await invoke('is_subagent_active', { agentId, subagentId })
  },
}
