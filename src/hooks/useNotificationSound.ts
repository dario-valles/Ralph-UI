import { useCallback } from 'react'
import {
  type SoundMode,
  type NotificationType,
  playNotificationSound,
  resumeAudioContext,
} from '@/lib/audio'

const UI_SETTINGS_KEY = 'ralph-ui-settings'

// Notification type toggles (matches SettingsPage)
interface NotificationToggles {
  completion: boolean
  error: boolean
  maxIterations: boolean
  storyComplete: boolean
}

interface NotificationSoundSettings {
  soundMode: SoundMode
  soundVolume: number
  notificationsEnabled: boolean
  notificationToggles: NotificationToggles
}

const defaultNotificationToggles: NotificationToggles = {
  completion: true,
  error: true,
  maxIterations: true,
  storyComplete: false,
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
        notificationsEnabled: parsed.notificationsEnabled ?? true,
        notificationToggles: {
          ...defaultNotificationToggles,
          ...parsed.notificationToggles,
        },
      }
    }
  } catch {
    // Ignore parse errors
  }
  return {
    soundMode: 'system',
    soundVolume: 50,
    notificationsEnabled: true,
    notificationToggles: defaultNotificationToggles,
  }
}

/**
 * Check if a notification type is enabled based on settings
 */
function isNotificationTypeEnabled(
  notificationType: NotificationType,
  settings: NotificationSoundSettings
): boolean {
  if (!settings.notificationsEnabled) return false

  switch (notificationType) {
    case 'completion':
      return settings.notificationToggles.completion
    case 'error':
      return settings.notificationToggles.error
    case 'max_iterations':
      return settings.notificationToggles.maxIterations
    default:
      return true
  }
}

/**
 * Hook for playing notification sounds
 *
 * Reads sound settings from localStorage (UISettings) and provides
 * a function to play sounds based on notification type.
 * Respects both sound mode and notification type toggles.
 */
export function useNotificationSound() {
  const playSound = useCallback((notificationType: NotificationType) => {
    const settings = getNotificationSoundSettings()

    // Check if this notification type is enabled
    if (!isNotificationTypeEnabled(notificationType, settings)) return

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
 * Respects both sound mode and notification type toggles.
 */
export function triggerNotificationSound(notificationType: NotificationType): void {
  const settings = getNotificationSoundSettings()

  // Check if this notification type is enabled
  if (!isNotificationTypeEnabled(notificationType, settings)) return

  if (settings.soundMode === 'off') return

  // Resume audio context and play
  resumeAudioContext()
  playNotificationSound(settings.soundMode, notificationType, settings.soundVolume)
}

/**
 * Check if notifications are enabled for a given type
 * Useful for checking before sending desktop notifications
 */
export function isNotificationEnabled(notificationType: NotificationType): boolean {
  const settings = getNotificationSoundSettings()
  return isNotificationTypeEnabled(notificationType, settings)
}
