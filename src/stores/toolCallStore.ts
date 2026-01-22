// Tool Call store using Zustand
// Manages tool call state for collapsible tool call display

import { create } from 'zustand'
import type { ToolCall, ToolCallStartedPayload, ToolCallCompletedPayload } from '@/types'

interface ToolCallStore {
  // Map of agentId -> toolCalls for that agent
  toolCalls: Map<string, ToolCall[]>
  // Start a new tool call
  addToolCall: (payload: ToolCallStartedPayload) => void
  // Complete a tool call with results
  completeToolCall: (payload: ToolCallCompletedPayload) => void
  // Get tool calls for an agent
  getToolCallsForAgent: (agentId: string) => ToolCall[]
  // Clear tool calls for an agent
  clearToolCalls: (agentId: string) => void
  // Clear all tool calls
  clearAllToolCalls: () => void
}

export const useToolCallStore = create<ToolCallStore>((set, get) => ({
  toolCalls: new Map(),

  addToolCall: (payload: ToolCallStartedPayload) => {
    set((state) => {
      const newMap = new Map(state.toolCalls)
      const agentCalls = newMap.get(payload.agentId) || []

      // Create new tool call
      const toolCall: ToolCall = {
        id: payload.toolId,
        agentId: payload.agentId,
        toolName: payload.toolName,
        input: payload.input,
        startedAt: payload.timestamp,
        status: 'running',
      }

      // Add to the beginning (most recent first)
      newMap.set(payload.agentId, [toolCall, ...agentCalls])

      return { toolCalls: newMap }
    })
  },

  completeToolCall: (payload: ToolCallCompletedPayload) => {
    set((state) => {
      const newMap = new Map(state.toolCalls)
      const agentCalls = newMap.get(payload.agentId) || []

      // Find and update the tool call
      const updatedCalls = agentCalls.map((call) => {
        if (call.id === payload.toolId) {
          // Calculate duration from start time
          const startTime = new Date(call.startedAt).getTime()
          const endTime = new Date(payload.timestamp).getTime()
          const durationMs = payload.durationMs ?? endTime - startTime

          return {
            ...call,
            output: payload.output,
            completedAt: payload.timestamp,
            durationMs,
            status: payload.isError ? ('failed' as const) : ('completed' as const),
          }
        }
        return call
      })

      newMap.set(payload.agentId, updatedCalls)

      return { toolCalls: newMap }
    })
  },

  getToolCallsForAgent: (agentId: string) => {
    return get().toolCalls.get(agentId) || []
  },

  clearToolCalls: (agentId: string) => {
    set((state) => {
      const newMap = new Map(state.toolCalls)
      newMap.delete(agentId)
      return { toolCalls: newMap }
    })
  },

  clearAllToolCalls: () => {
    set({ toolCalls: new Map() })
  },
}))

// Hook to listen for tool call events from Tauri
export function setupToolCallEventListeners() {
  // Only import Tauri on client side
  if (typeof window === 'undefined') return

  import('@tauri-apps/api/event').then(({ listen }) => {
    const store = useToolCallStore.getState()

    // Listen for tool call started events
    listen<ToolCallStartedPayload>('tool:started', (event) => {
      store.addToolCall(event.payload)
    })

    // Listen for tool call completed events
    listen<ToolCallCompletedPayload>('tool:completed', (event) => {
      store.completeToolCall(event.payload)
    })
  })
}
