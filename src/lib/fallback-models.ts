// Agent model configuration - shared across components
import type { AgentType } from '@/types'

export interface ModelOption {
  value: string
  label: string
}

// Available models per agent type
export const MODELS_BY_AGENT: Record<AgentType, ModelOption[]> = {
  opencode: [
    { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/o1', label: 'OpenAI o1' },
  ],
  claude: [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  ],
  cursor: [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
  codex: [
    { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  ],
  qwen: [
    { value: 'qwen-coder-32b', label: 'Qwen Coder 32B' },
    { value: 'qwen-coder-7b', label: 'Qwen Coder 7B' },
  ],
  droid: [{ value: 'default', label: 'Default' }],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
}

// Get default model for an agent type
export function getDefaultModel(agentType: AgentType): string {
  const models = MODELS_BY_AGENT[agentType]
  return models?.[0]?.value || ''
}

// Get model label by value
export function getModelLabel(agentType: AgentType, modelValue: string): string {
  const model = MODELS_BY_AGENT[agentType]?.find((m) => m.value === modelValue)
  return model?.label || modelValue
}
