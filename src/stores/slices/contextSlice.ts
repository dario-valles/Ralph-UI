/**
 * Context Slice for PRD Chat Store
 *
 * Manages context injection state for PRD Chat, including:
 * - Loading context configuration for the current project
 * - Toggling context injection on/off
 * - Providing context preview for the UI
 */
import { invoke } from '@/lib/invoke'
import type { ContextConfig, ProjectContextState } from '@/types'
import type { SetState } from './prdChatTypes'

// ============================================================================
// Slice State Interface
// ============================================================================

/**
 * Context slice state and actions
 */
export interface ContextSlice {
  // State
  /** Context configuration for the current project */
  contextConfig: ContextConfig | null
  /** Whether context files exist for the project */
  hasProjectContext: boolean
  /** Preview of context content (first 200 chars) */
  contextPreview: string | null
  /** Loading state for context operations */
  contextLoading: boolean

  // Actions
  /** Load context config for a project */
  loadContextConfig: (projectPath: string) => Promise<void>
  /** Toggle context injection for PRD Chat */
  toggleContextInjection: (projectPath: string, enabled: boolean) => Promise<void>
  /** Clear context state */
  clearContextState: () => void
}

// ============================================================================
// Initial State
// ============================================================================

export const contextSliceInitialState = {
  contextConfig: null as ContextConfig | null,
  hasProjectContext: false,
  contextPreview: null as string | null,
  contextLoading: false,
}

// ============================================================================
// Slice Implementation
// ============================================================================

export const createContextSlice = (set: SetState): ContextSlice => ({
  ...contextSliceInitialState,

  loadContextConfig: async (projectPath: string) => {
    set({ contextLoading: true })
    try {
      const context = await invoke<ProjectContextState>('get_project_context', { projectPath })
      const hasFiles = context.files.length > 0

      // Generate preview from context content
      let preview: string | null = null
      if (hasFiles) {
        const content = context.files
          .map((f) => f.content)
          .join('\n')
          .trim()
        if (content.length > 0) {
          preview = content.length > 200 ? content.slice(0, 200) + '...' : content
        }
      }

      set({
        contextConfig: context.config,
        hasProjectContext: hasFiles,
        contextPreview: preview,
        contextLoading: false,
      })
    } catch (err) {
      console.error('[contextSlice] Failed to load context config:', err)
      set({
        contextConfig: null,
        hasProjectContext: false,
        contextPreview: null,
        contextLoading: false,
      })
    }
  },

  toggleContextInjection: async (projectPath: string, enabled: boolean) => {
    set({ contextLoading: true })
    try {
      // Get current config
      const context = await invoke<ProjectContextState>('get_project_context', { projectPath })
      const newConfig: ContextConfig = {
        ...context.config,
        enabled,
        includeInPrdChat: enabled,
      }

      // Save updated config
      await invoke('save_context_config', { projectPath, config: newConfig })

      set({
        contextConfig: newConfig,
        contextLoading: false,
      })
    } catch (err) {
      console.error('[contextSlice] Failed to toggle context injection:', err)
      set({ contextLoading: false })
      throw err
    }
  },

  clearContextState: () => {
    set({
      contextConfig: null,
      hasProjectContext: false,
      contextPreview: null,
      contextLoading: false,
    })
  },
})
