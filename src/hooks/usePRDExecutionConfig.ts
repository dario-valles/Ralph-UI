// Hook for managing PRD execution configuration state

import { useState, useEffect, useCallback, useRef } from 'react'
import { configApi } from '@/lib/config-api'
import type { ExecutionConfig, AgentType, SchedulingStrategy, RalphConfig } from '@/types'

/** Default execution config values */
const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  sessionName: undefined,
  agentType: 'claude' as AgentType,
  strategy: 'dependency_first',
  maxParallel: 3,
  maxIterations: 10,
  maxRetries: 3,
  autoCreatePRs: true,
  draftPRs: true,
  runTests: true,
  runLint: true,
  dryRun: false,
  model: undefined,
  reuseSession: false,
}

interface UsePRDExecutionConfigReturn {
  /** Current execution configuration */
  config: ExecutionConfig
  /** Update the configuration */
  setConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>
  /** Whether config is currently loading from saved settings */
  configLoading: boolean
  /** Handler for changing agent type (resets model) */
  handleAgentTypeChange: (newAgentType: AgentType) => void
}

/**
 * Merge saved config with defaults
 */
function mergeWithSavedConfig(
  prev: ExecutionConfig,
  savedConfig: RalphConfig
): ExecutionConfig {
  return {
    ...prev,
    agentType: (savedConfig.execution.agentType as AgentType) || prev.agentType,
    strategy: (savedConfig.execution.strategy as SchedulingStrategy) || prev.strategy,
    maxParallel: savedConfig.execution.maxParallel || prev.maxParallel,
    maxIterations: savedConfig.execution.maxIterations || prev.maxIterations,
    maxRetries: savedConfig.execution.maxRetries || prev.maxRetries,
    model: savedConfig.execution.model, // Don't fallback to prev - let useAvailableModels handle default
    autoCreatePRs: savedConfig.git.autoCreatePrs ?? prev.autoCreatePRs,
    draftPRs: savedConfig.git.draftPrs ?? prev.draftPRs,
    runTests: savedConfig.validation.runTests ?? prev.runTests,
    runLint: savedConfig.validation.runLint ?? prev.runLint,
  }
}

/**
 * Hook to manage PRD execution configuration
 *
 * Loads saved configuration from the backend when the dialog opens,
 * and provides handlers for updating configuration values.
 *
 * @param open - Whether the dialog is open (triggers config load)
 * @param defaultModelId - The default model ID from useAvailableModels
 * @returns Configuration state and handlers
 *
 * @example
 * ```tsx
 * function ExecutionDialog({ open }: { open: boolean }) {
 *   const { models, defaultModelId } = useAvailableModels(config.agentType)
 *   const { config, setConfig, configLoading, handleAgentTypeChange } =
 *     usePRDExecutionConfig(open, defaultModelId)
 *
 *   return (
 *     <Select value={config.agentType} onChange={(e) => handleAgentTypeChange(e.target.value)}>
 *       ...
 *     </Select>
 *   )
 * }
 * ```
 */
export function usePRDExecutionConfig(
  open: boolean,
  defaultModelId: string
): UsePRDExecutionConfigReturn {
  const [config, setConfig] = useState<ExecutionConfig>(DEFAULT_EXECUTION_CONFIG)
  const [configLoading, setConfigLoading] = useState(false)

  // Track if we've already loaded config for current open state
  const loadedRef = useRef(false)
  const prevOpenRef = useRef(open)

  // Load saved config when dialog opens
  useEffect(() => {
    // Reset loaded state when dialog closes
    if (!open && prevOpenRef.current) {
      loadedRef.current = false
      setConfigLoading(false)
    }
    prevOpenRef.current = open

    // Only load if dialog is open and we haven't loaded yet
    if (!open || loadedRef.current) {
      return
    }

    loadedRef.current = true
    setConfigLoading(true)
    let cancelled = false

    const loadConfig = async (): Promise<void> => {
      try {
        const savedConfig = await configApi.get()
        if (!cancelled) {
          setConfig((prev) => mergeWithSavedConfig(prev, savedConfig))
        }
      } catch (err) {
        console.error('Failed to load config:', err)
      } finally {
        if (!cancelled) {
          setConfigLoading(false)
        }
      }
    }

    loadConfig()

    return () => {
      cancelled = true
    }
  }, [open])

  // Track previous defaultModelId to detect changes
  const prevDefaultModelIdRef = useRef(defaultModelId)

  // Update model to default when models load - only if no model is set AND config is done loading
  // This ensures saved config model is respected (avoid race condition)
  useEffect(() => {
    // Only update if defaultModelId actually changed (external trigger)
    const modelIdChanged = prevDefaultModelIdRef.current !== defaultModelId
    prevDefaultModelIdRef.current = defaultModelId

    // Only set model if:
    // 1. Config is done loading (to respect saved config)
    // 2. No model is currently set
    // 3. We have a valid default model
    // 4. The defaultModelId actually changed (to avoid cascading)
    if (!configLoading && defaultModelId && !config.model && modelIdChanged) {
      setConfig((prev) => ({ ...prev, model: defaultModelId }))
    }
  }, [configLoading, defaultModelId, config.model])

  // Update model when agent type changes
  const handleAgentTypeChange = useCallback((newAgentType: AgentType): void => {
    setConfig((prev) => ({
      ...prev,
      agentType: newAgentType,
      // Model will be updated by useEffect when models load for the new agent type
      model: undefined,
    }))
  }, [])

  return {
    config,
    setConfig,
    configLoading,
    handleAgentTypeChange,
  }
}
