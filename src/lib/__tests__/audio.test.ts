import { describe, it, expect } from 'vitest'
import { playNotificationSound, playPreviewSound, isAudioAvailable } from '../audio'

describe('audio utilities', () => {
  describe('playNotificationSound', () => {
    it('does not throw when soundMode is off', () => {
      expect(() => playNotificationSound('off', 'completion', 50)).not.toThrow()
    })

    it('does not throw when soundMode is system', () => {
      // May fail silently in test environment without AudioContext
      expect(() => playNotificationSound('system', 'completion', 50)).not.toThrow()
    })

    it('does not throw when soundMode is ralph', () => {
      expect(() => playNotificationSound('ralph', 'completion', 50)).not.toThrow()
    })

    it('handles all notification types without throwing', () => {
      expect(() => playNotificationSound('system', 'error', 50)).not.toThrow()
      expect(() => playNotificationSound('system', 'max_iterations', 50)).not.toThrow()
    })

    it('handles volume edge cases', () => {
      expect(() => playNotificationSound('system', 'completion', 0)).not.toThrow()
      expect(() => playNotificationSound('system', 'completion', 100)).not.toThrow()
      expect(() => playNotificationSound('system', 'completion', -10)).not.toThrow()
      expect(() => playNotificationSound('system', 'completion', 150)).not.toThrow()
    })
  })

  describe('playPreviewSound', () => {
    it('does not throw for any sound mode', () => {
      expect(() => playPreviewSound('off', 50)).not.toThrow()
      expect(() => playPreviewSound('system', 50)).not.toThrow()
      expect(() => playPreviewSound('ralph', 50)).not.toThrow()
    })
  })

  describe('isAudioAvailable', () => {
    it('returns a boolean', () => {
      const result = isAudioAvailable()
      expect(typeof result).toBe('boolean')
    })
  })
})
