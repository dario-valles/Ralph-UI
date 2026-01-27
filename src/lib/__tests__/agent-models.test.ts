import { describe, it, expect } from 'vitest'
import { MODELS_BY_AGENT, getDefaultModel, getModelLabel } from '../fallback-models'
import type { AgentType } from '@/types'

describe('fallback-models', () => {
  describe('MODELS_BY_AGENT', () => {
    it('has models for all agent types', () => {
      const agentTypes: AgentType[] = ['claude', 'opencode', 'cursor', 'codex']

      agentTypes.forEach((agentType) => {
        expect(MODELS_BY_AGENT[agentType]).toBeDefined()
        expect(MODELS_BY_AGENT[agentType].length).toBeGreaterThan(0)
      })
    })

    it('has valid model structure for each entry', () => {
      Object.values(MODELS_BY_AGENT).forEach((models) => {
        models.forEach((model) => {
          expect(model).toHaveProperty('value')
          expect(model).toHaveProperty('label')
          expect(typeof model.value).toBe('string')
          expect(typeof model.label).toBe('string')
          expect(model.value.length).toBeGreaterThan(0)
          expect(model.label.length).toBeGreaterThan(0)
        })
      })
    })

    it('has Claude models for claude agent', () => {
      const claudeModels = MODELS_BY_AGENT.claude
      expect(claudeModels.some((m) => m.value.includes('claude'))).toBe(true)
    })

    it('has OpenAI models for opencode agent', () => {
      const opencodeModels = MODELS_BY_AGENT.opencode
      // OpenCode uses anthropic/ prefix for Claude models
      expect(opencodeModels.some((m) => m.value.includes('anthropic/'))).toBe(true)
    })

    it('has GPT models for codex agent', () => {
      const codexModels = MODELS_BY_AGENT.codex
      expect(codexModels.some((m) => m.value.includes('gpt'))).toBe(true)
    })
  })

  describe('getDefaultModel', () => {
    it('returns the first model for each agent type', () => {
      const agentTypes: AgentType[] = ['claude', 'opencode', 'cursor', 'codex']

      agentTypes.forEach((agentType) => {
        const defaultModel = getDefaultModel(agentType)
        const firstModel = MODELS_BY_AGENT[agentType][0]

        expect(defaultModel).toBe(firstModel.value)
      })
    })

    it('returns claude-sonnet-4-5 for claude agent', () => {
      expect(getDefaultModel('claude')).toBe('claude-sonnet-4-5')
    })

    it('returns anthropic/claude-sonnet-4-5 for opencode agent', () => {
      expect(getDefaultModel('opencode')).toBe('anthropic/claude-sonnet-4-5')
    })

    it('returns claude-sonnet-4-5 for cursor agent', () => {
      expect(getDefaultModel('cursor')).toBe('claude-sonnet-4-5')
    })

    it('returns gpt-5.2-codex for codex agent', () => {
      expect(getDefaultModel('codex')).toBe('gpt-5.2-codex')
    })

    it('returns gemini-2.5-pro for gemini agent', () => {
      expect(getDefaultModel('gemini')).toBe('gemini-2.5-pro')
    })
  })

  describe('getModelLabel', () => {
    it('returns correct label for known models', () => {
      expect(getModelLabel('claude', 'claude-sonnet-4-5')).toBe('Claude Sonnet 4.5')
      expect(getModelLabel('claude', 'claude-opus-4-5')).toBe('Claude Opus 4.5')
      expect(getModelLabel('opencode', 'anthropic/claude-sonnet-4-5')).toBe('Claude Sonnet 4.5')
      expect(getModelLabel('opencode', 'openai/gpt-4o')).toBe('GPT-4o')
      expect(getModelLabel('codex', 'gpt-5.2-codex')).toBe('GPT-5.2 Codex')
      expect(getModelLabel('gemini', 'gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
    })

    it('returns the value itself for unknown models', () => {
      expect(getModelLabel('claude', 'unknown-model')).toBe('unknown-model')
      expect(getModelLabel('opencode', 'some/custom-model')).toBe('some/custom-model')
    })

    it('returns empty string for empty model value', () => {
      expect(getModelLabel('claude', '')).toBe('')
    })

    it('handles model lookups for different agent types correctly', () => {
      // Same model value might exist in different formats for different agents
      // Claude uses 'claude-sonnet-4-5' directly
      expect(getModelLabel('claude', 'claude-sonnet-4-5')).toBe('Claude Sonnet 4.5')

      // OpenCode uses 'anthropic/' prefix
      expect(getModelLabel('opencode', 'anthropic/claude-sonnet-4-5')).toBe('Claude Sonnet 4.5')

      // Cross-agent lookup should return the raw value if not found
      expect(getModelLabel('claude', 'anthropic/claude-sonnet-4-5')).toBe(
        'anthropic/claude-sonnet-4-5'
      )
    })
  })
})
