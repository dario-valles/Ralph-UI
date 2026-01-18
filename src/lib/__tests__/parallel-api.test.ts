import { describe, it, expect, vi } from 'vitest'
import {
  getSchedulingStrategyLabel,
  getConflictTypeLabel,
  getConflictTypeColor,
  getResolutionStrategyLabel,
  createDefaultResourceLimits,
  createDefaultSchedulerConfig,
  formatPoolStats,
  calculateUtilization,
  type SchedulingStrategy,
  type ConflictType,
  type ConflictResolutionStrategy,
  type PoolStats,
} from '../parallel-api'

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('parallel-api', () => {
  describe('getSchedulingStrategyLabel', () => {
    it('returns correct label for sequential strategy', () => {
      expect(getSchedulingStrategyLabel('sequential')).toBe('Sequential')
    })

    it('returns correct label for dependency_first strategy', () => {
      expect(getSchedulingStrategyLabel('dependency_first')).toBe('Dependency First')
    })

    it('returns correct label for priority strategy', () => {
      expect(getSchedulingStrategyLabel('priority')).toBe('Priority Order')
    })

    it('returns correct label for fifo strategy', () => {
      expect(getSchedulingStrategyLabel('fifo')).toBe('First In First Out')
    })

    it('returns correct label for cost_first strategy', () => {
      expect(getSchedulingStrategyLabel('cost_first')).toBe('Highest Cost First')
    })

    it('handles all strategy types', () => {
      const strategies: SchedulingStrategy[] = [
        'sequential',
        'dependency_first',
        'priority',
        'fifo',
        'cost_first',
      ]

      strategies.forEach((strategy) => {
        const label = getSchedulingStrategyLabel(strategy)
        expect(label).toBeTruthy()
        expect(typeof label).toBe('string')
      })
    })
  })

  describe('getConflictTypeLabel', () => {
    it('returns correct label for file_modification', () => {
      expect(getConflictTypeLabel('file_modification')).toBe('File Modified')
    })

    it('returns correct label for delete_modify', () => {
      expect(getConflictTypeLabel('delete_modify')).toBe('Delete/Modify')
    })

    it('returns correct label for file_creation', () => {
      expect(getConflictTypeLabel('file_creation')).toBe('File Created')
    })

    it('returns correct label for directory_conflict', () => {
      expect(getConflictTypeLabel('directory_conflict')).toBe('Directory Conflict')
    })
  })

  describe('getConflictTypeColor', () => {
    it('returns yellow for file_modification', () => {
      expect(getConflictTypeColor('file_modification')).toBe('yellow')
    })

    it('returns red for delete_modify', () => {
      expect(getConflictTypeColor('delete_modify')).toBe('red')
    })

    it('returns orange for file_creation', () => {
      expect(getConflictTypeColor('file_creation')).toBe('orange')
    })

    it('returns purple for directory_conflict', () => {
      expect(getConflictTypeColor('directory_conflict')).toBe('purple')
    })
  })

  describe('getResolutionStrategyLabel', () => {
    it('returns correct labels for all resolution strategies', () => {
      const strategies: { value: ConflictResolutionStrategy; expected: string }[] = [
        { value: 'use_first', expected: 'Use First' },
        { value: 'use_last', expected: 'Use Last' },
        { value: 'use_priority', expected: 'Use Priority' },
        { value: 'auto_merge', expected: 'Auto Merge' },
        { value: 'manual', expected: 'Manual Resolution' },
      ]

      strategies.forEach(({ value, expected }) => {
        expect(getResolutionStrategyLabel(value)).toBe(expected)
      })
    })
  })

  describe('createDefaultResourceLimits', () => {
    it('creates resource limits with expected default values', () => {
      const limits = createDefaultResourceLimits()

      expect(limits.maxAgents).toBe(5)
      expect(limits.maxCpuPerAgent).toBe(50.0)
      expect(limits.maxMemoryMbPerAgent).toBe(2048)
      expect(limits.maxTotalCpu).toBe(80.0)
      expect(limits.maxTotalMemoryMb).toBe(8192)
      expect(limits.maxRuntimeSecs).toBe(3600)
    })
  })

  describe('createDefaultSchedulerConfig', () => {
    it('creates scheduler config with default agent type', () => {
      const config = createDefaultSchedulerConfig()

      expect(config.agentType).toBe('claude')
      expect(config.maxParallel).toBe(3)
      expect(config.maxIterations).toBe(10)
      expect(config.maxRetries).toBe(2)
      expect(config.strategy).toBe('dependency_first')
      expect(config.resourceLimits).toBeDefined()
      expect(config.model).toBeUndefined()
    })

    it('creates scheduler config with custom agent type', () => {
      const config = createDefaultSchedulerConfig('opencode')

      expect(config.agentType).toBe('opencode')
    })

    it('creates scheduler config with custom model', () => {
      const config = createDefaultSchedulerConfig('claude', 'claude-sonnet-4-5')

      expect(config.agentType).toBe('claude')
      expect(config.model).toBe('claude-sonnet-4-5')
    })
  })

  describe('formatPoolStats', () => {
    it('formats pool stats correctly', () => {
      const stats: PoolStats = {
        runningAgents: 2,
        maxAgents: 5,
        totalCpuUsage: 45.5,
        maxTotalCpu: 80,
        totalMemoryMb: 4096,
        maxTotalMemoryMb: 8192,
      }

      const formatted = formatPoolStats(stats)

      expect(formatted).toBe('Agents: 2/5 | CPU: 45.5% | Memory: 4096MB')
    })

    it('handles zero values', () => {
      const stats: PoolStats = {
        runningAgents: 0,
        maxAgents: 5,
        totalCpuUsage: 0,
        maxTotalCpu: 80,
        totalMemoryMb: 0,
        maxTotalMemoryMb: 8192,
      }

      const formatted = formatPoolStats(stats)

      expect(formatted).toBe('Agents: 0/5 | CPU: 0.0% | Memory: 0MB')
    })
  })

  describe('calculateUtilization', () => {
    it('calculates utilization percentages correctly', () => {
      const stats: PoolStats = {
        runningAgents: 2,
        maxAgents: 4,
        totalCpuUsage: 40,
        maxTotalCpu: 80,
        totalMemoryMb: 2048,
        maxTotalMemoryMb: 8192,
      }

      const utilization = calculateUtilization(stats)

      expect(utilization.agents).toBe(50) // 2/4 = 50%
      expect(utilization.cpu).toBe(50) // 40/80 = 50%
      expect(utilization.memory).toBe(25) // 2048/8192 = 25%
    })

    it('handles full utilization', () => {
      const stats: PoolStats = {
        runningAgents: 5,
        maxAgents: 5,
        totalCpuUsage: 80,
        maxTotalCpu: 80,
        totalMemoryMb: 8192,
        maxTotalMemoryMb: 8192,
      }

      const utilization = calculateUtilization(stats)

      expect(utilization.agents).toBe(100)
      expect(utilization.cpu).toBe(100)
      expect(utilization.memory).toBe(100)
    })

    it('handles zero utilization', () => {
      const stats: PoolStats = {
        runningAgents: 0,
        maxAgents: 5,
        totalCpuUsage: 0,
        maxTotalCpu: 80,
        totalMemoryMb: 0,
        maxTotalMemoryMb: 8192,
      }

      const utilization = calculateUtilization(stats)

      expect(utilization.agents).toBe(0)
      expect(utilization.cpu).toBe(0)
      expect(utilization.memory).toBe(0)
    })
  })
})
