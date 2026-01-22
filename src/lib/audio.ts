/**
 * Audio utilities for notification sounds
 *
 * Supports three sound modes:
 * - Off: No sounds
 * - System: Uses system notification sounds (via notification API or beep)
 * - Ralph: Plays themed Ralph Wiggum audio clips
 */

export type SoundMode = 'off' | 'system' | 'ralph'

export type NotificationType = 'completion' | 'error' | 'max_iterations'

// Ralph Wiggum themed audio clips (Base64 encoded short beeps for now)
// In a real implementation, these would be actual audio files
// For this implementation, we use synthesized sounds via Web Audio API

// Frequency presets for different notification types
const FREQUENCY_PRESETS = {
  completion: { frequency: 880, duration: 0.15, type: 'sine' as OscillatorType }, // High happy tone
  error: { frequency: 220, duration: 0.3, type: 'sawtooth' as OscillatorType }, // Low warning tone
  max_iterations: { frequency: 440, duration: 0.2, type: 'triangle' as OscillatorType }, // Medium attention tone
} as const

// Ralph mode uses fun variations
const RALPH_PRESETS = {
  completion: [
    { frequency: 523.25, duration: 0.1, type: 'sine' as OscillatorType }, // C5
    { frequency: 659.25, duration: 0.1, type: 'sine' as OscillatorType }, // E5
    { frequency: 783.99, duration: 0.15, type: 'sine' as OscillatorType }, // G5
  ],
  error: [
    { frequency: 311.13, duration: 0.15, type: 'sawtooth' as OscillatorType }, // Eb4
    { frequency: 261.63, duration: 0.2, type: 'sawtooth' as OscillatorType }, // C4
  ],
  max_iterations: [
    { frequency: 392.0, duration: 0.1, type: 'triangle' as OscillatorType }, // G4
    { frequency: 440.0, duration: 0.1, type: 'triangle' as OscillatorType }, // A4
    { frequency: 392.0, duration: 0.15, type: 'triangle' as OscillatorType }, // G4
  ],
} as const

// Audio context singleton
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch (e) {
      console.warn('[Audio] Failed to create AudioContext:', e)
      return null
    }
  }

  // Resume if suspended (browsers require user interaction)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {
      // Ignore - will be resumed on next user interaction
    })
  }

  return audioContext
}

/**
 * Play a single tone
 */
function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  startTime: number
): void {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)

  // Apply volume (0-100 scale to 0-1)
  const normalizedVolume = Math.max(0, Math.min(1, volume / 100))

  // Envelope: quick attack, sustain, quick release
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(normalizedVolume * 0.3, startTime + 0.01)
  gainNode.gain.setValueAtTime(normalizedVolume * 0.3, startTime + duration - 0.02)
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

/**
 * Play a system-style notification sound
 */
function playSystemSound(notificationType: NotificationType, volume: number): void {
  const ctx = getAudioContext()
  if (!ctx) return

  const preset = FREQUENCY_PRESETS[notificationType]
  playTone(ctx, preset.frequency, preset.duration, preset.type, volume, ctx.currentTime)
}

/**
 * Play a Ralph-themed notification sound (fun multi-tone sequences)
 */
function playRalphSound(notificationType: NotificationType, volume: number): void {
  const ctx = getAudioContext()
  if (!ctx) return

  const tones = RALPH_PRESETS[notificationType]
  let currentTime = ctx.currentTime

  for (const tone of tones) {
    playTone(ctx, tone.frequency, tone.duration, tone.type, volume, currentTime)
    currentTime += tone.duration + 0.02 // Small gap between tones
  }
}

/**
 * Play a notification sound based on the current sound mode
 */
export function playNotificationSound(
  soundMode: SoundMode,
  notificationType: NotificationType,
  volume: number = 50
): void {
  if (soundMode === 'off') return

  if (soundMode === 'system') {
    playSystemSound(notificationType, volume)
  } else if (soundMode === 'ralph') {
    playRalphSound(notificationType, volume)
  }
}

/**
 * Play a preview sound for the settings page
 */
export function playPreviewSound(soundMode: SoundMode, volume: number = 50): void {
  if (soundMode === 'off') return

  // Play completion sound as preview
  playNotificationSound(soundMode, 'completion', volume)
}

/**
 * Test if audio is available and working
 */
export function isAudioAvailable(): boolean {
  return getAudioContext() !== null
}

/**
 * Resume audio context after user interaction
 * (Required by browsers that suspend AudioContext until user gesture)
 */
export function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx) return Promise.resolve()

  if (ctx.state === 'suspended') {
    return ctx.resume()
  }
  return Promise.resolve()
}
