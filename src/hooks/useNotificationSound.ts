import { useCallback } from 'react'
import {
  type SoundMode,
  type NotificationType,
  playNotificationSound,
  resumeAudioContext,
} from '@/lib/audio'

const UI_SETTINGS_KEY = 'ralph-ui-settings'

interface NotificationSoundSettings {
  soundMode: SoundMode
  soundVolume: number
}

/**
 * Get notification sound settings from localStorage
 */
function getNotificationSoundSettings(): NotificationSoundSettings {
  try {
    const stored = localStorage.getItem(UI_SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        soundMode: parsed.soundMode || 'system',
        soundVolume: parsed.soundVolume ?? 50,
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { soundMode: 'system', soundVolume: 50 }
}

/**
 * Hook for playing notification sounds
 *
 * Reads sound settings from localStorage (UISettings) and provides
 * a function to play sounds based on notification type.
 */
export function useNotificationSound() {
  const playSound = useCallback((notificationType: NotificationType) => {
    const settings = getNotificationSoundSettings()

    if (settings.soundMode === 'off') return

    // Resume audio context in case it's suspended
    resumeAudioContext()

    // Play the sound
    playNotificationSound(settings.soundMode, notificationType, settings.soundVolume)
  }, [])

  return { playSound }
}

/**
 * Standalone function to play notification sounds (for use outside React components)
 */
export function triggerNotificationSound(notificationType: NotificationType): void {
  const settings = getNotificationSoundSettings()

  if (settings.soundMode === 'off') return

  // Resume audio context and play
  resumeAudioContext()
  playNotificationSound(settings.soundMode, notificationType, settings.soundVolume)
}
