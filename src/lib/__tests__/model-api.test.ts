import { describe, it, expect } from 'vitest'
import { getDefaultModelId, getModelName, type ModelInfo } from '../model-api'

describe('model-api', () => {
  describe('getDefaultModelId', () => {
    it('returns the default model ID when one is marked as default', () => {
      const models: ModelInfo[] = [
        { id: 'model-1', name: 'Model 1', provider: 'test', isDefault: false },
        { id: 'model-2', name: 'Model 2', provider: 'test', isDefault: true },
        { id: 'model-3', name: 'Model 3', provider: 'test', isDefault: false },
      ]

      expect(getDefaultModelId(models)).toBe('model-2')
    })

    it('returns the first model ID when none is marked as default', () => {
      const models: ModelInfo[] = [
        { id: 'model-1', name: 'Model 1', provider: 'test', isDefault: false },
        { id: 'model-2', name: 'Model 2', provider: 'test', isDefault: false },
      ]

      expect(getDefaultModelId(models)).toBe('model-1')
    })

    it('returns empty string for empty array', () => {
      expect(getDefaultModelId([])).toBe('')
    })

    it('returns the first default if multiple are marked as default', () => {
      const models: ModelInfo[] = [
        { id: 'model-1', name: 'Model 1', provider: 'test', isDefault: true },
        { id: 'model-2', name: 'Model 2', provider: 'test', isDefault: true },
      ]

      expect(getDefaultModelId(models)).toBe('model-1')
    })
  })

  describe('getModelName', () => {
    const models: ModelInfo[] = [
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        isDefault: true,
      },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', isDefault: false },
    ]

    it('returns the model name when model is found', () => {
      expect(getModelName(models, 'claude-sonnet-4-5')).toBe('Claude Sonnet 4.5')
      expect(getModelName(models, 'gpt-4o')).toBe('GPT-4o')
    })

    it('returns the model ID when model is not found', () => {
      expect(getModelName(models, 'unknown-model')).toBe('unknown-model')
    })

    it('returns empty string for empty model ID with empty array', () => {
      expect(getModelName([], '')).toBe('')
    })

    it('returns the ID when searching in empty array', () => {
      expect(getModelName([], 'some-model')).toBe('some-model')
    })
  })
})
