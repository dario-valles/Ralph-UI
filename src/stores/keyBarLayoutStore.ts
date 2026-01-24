// Key bar layout customization store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface KeyDefinition {
  label: string
  value: string
  icon?: string // Icon name from lucide-react (stored as string for serialization)
  ariaLabel?: string
  isModifier?: boolean
}

interface KeyBarLayoutStore {
  // State
  customLayout: KeyDefinition[] | null

  // Actions
  setCustomLayout: (layout: KeyDefinition[]) => void
  resetToDefault: () => void
  getLayout: () => KeyDefinition[]
}

// Default key layout for mobile terminals
const DEFAULT_LAYOUT: KeyDefinition[] = [
  { label: 'Tab', value: '\t', ariaLabel: 'Tab key' },
  { label: '↑', value: '\x1b[A', icon: 'ArrowUp', ariaLabel: 'Up arrow' },
  { label: '↓', value: '\x1b[B', icon: 'ArrowDown', ariaLabel: 'Down arrow' },
  { label: '←', value: '\x1b[D', icon: 'ArrowLeft', ariaLabel: 'Left arrow' },
  { label: '→', value: '\x1b[C', icon: 'ArrowRight', ariaLabel: 'Right arrow' },
  { label: 'Home', value: '\x1b[H', ariaLabel: 'Home key' },
  { label: 'End', value: '\x1b[F', ariaLabel: 'End key' },
  { label: 'Enter', value: '\r', ariaLabel: 'Enter key' },
  { label: 'Backspace', value: '\x7f', icon: 'Delete', ariaLabel: 'Backspace key' },
  { label: 'CTRL', value: '\x00', ariaLabel: 'Control modifier', isModifier: true },
  { label: 'ALT', value: '\x1b', ariaLabel: 'Alt modifier', isModifier: true },
  { label: '^C', value: '\x03', ariaLabel: 'Interrupt (Ctrl+C)' },
]

// Comprehensive list of all available keys for the palette
// Includes default keys plus additional useful terminal keys
export const AVAILABLE_KEYS: KeyDefinition[] = [
  // Navigation keys
  { label: '↑', value: '\x1b[A', icon: 'ArrowUp', ariaLabel: 'Up arrow' },
  { label: '↓', value: '\x1b[B', icon: 'ArrowDown', ariaLabel: 'Down arrow' },
  { label: '←', value: '\x1b[D', icon: 'ArrowLeft', ariaLabel: 'Left arrow' },
  { label: '→', value: '\x1b[C', icon: 'ArrowRight', ariaLabel: 'Right arrow' },
  { label: 'Home', value: '\x1b[H', ariaLabel: 'Home key' },
  { label: 'End', value: '\x1b[F', ariaLabel: 'End key' },
  { label: 'Page↑', value: '\x1b[5~', ariaLabel: 'Page Up' },
  { label: 'Page↓', value: '\x1b[6~', ariaLabel: 'Page Down' },

  // Editing keys
  { label: 'Enter', value: '\r', ariaLabel: 'Enter key' },
  { label: 'Tab', value: '\t', ariaLabel: 'Tab key' },
  { label: 'Backspace', value: '\x7f', icon: 'Delete', ariaLabel: 'Backspace key' },
  { label: 'Delete', value: '\x1b[3~', ariaLabel: 'Delete key' },
  { label: 'Space', value: ' ', ariaLabel: 'Space' },

  // Modifiers
  { label: 'CTRL', value: '\x00', ariaLabel: 'Control modifier', isModifier: true },
  { label: 'ALT', value: '\x1b', ariaLabel: 'Alt modifier', isModifier: true },
  { label: 'SHIFT', value: '\x00', ariaLabel: 'Shift modifier', isModifier: true },

  // Common control sequences
  { label: '^C', value: '\x03', ariaLabel: 'Interrupt (Ctrl+C)' },
  { label: '^D', value: '\x04', ariaLabel: 'EOF (Ctrl+D)' },
  { label: '^Z', value: '\x1a', ariaLabel: 'Suspend (Ctrl+Z)' },
  { label: '^L', value: '\x0c', ariaLabel: 'Clear screen (Ctrl+L)' },
  { label: '^U', value: '\x15', ariaLabel: 'Clear line (Ctrl+U)' },
  { label: '^W', value: '\x17', ariaLabel: 'Delete word (Ctrl+W)' },
  { label: '^A', value: '\x01', ariaLabel: 'Home (Ctrl+A)' },
  { label: '^E', value: '\x05', ariaLabel: 'End (Ctrl+E)' },
  { label: '^R', value: '\x12', ariaLabel: 'Reverse search (Ctrl+R)' },

  // Function keys
  { label: 'F1', value: '\x1bOP', ariaLabel: 'Function key F1' },
  { label: 'F2', value: '\x1bOQ', ariaLabel: 'Function key F2' },
  { label: 'F3', value: '\x1bOR', ariaLabel: 'Function key F3' },
  { label: 'F4', value: '\x1bOS', ariaLabel: 'Function key F4' },
  { label: 'F5', value: '\x1b[15~', ariaLabel: 'Function key F5' },
  { label: 'F6', value: '\x1b[17~', ariaLabel: 'Function key F6' },
  { label: 'F7', value: '\x1b[18~', ariaLabel: 'Function key F7' },
  { label: 'F8', value: '\x1b[19~', ariaLabel: 'Function key F8' },
  { label: 'F9', value: '\x1b[20~', ariaLabel: 'Function key F9' },
  { label: 'F10', value: '\x1b[21~', ariaLabel: 'Function key F10' },
  { label: 'F11', value: '\x1b[23~', ariaLabel: 'Function key F11' },
  { label: 'F12', value: '\x1b[24~', ariaLabel: 'Function key F12' },

  // Common characters
  { label: '/', value: '/', ariaLabel: 'Slash' },
  { label: '|', value: '|', ariaLabel: 'Pipe' },
  { label: '&', value: '&', ariaLabel: 'Ampersand' },
  { label: ';', value: ';', ariaLabel: 'Semicolon' },
  { label: ':', value: ':', ariaLabel: 'Colon' },
  { label: '-', value: '-', ariaLabel: 'Hyphen' },
  { label: '_', value: '_', ariaLabel: 'Underscore' },
  { label: '.', value: '.', ariaLabel: 'Dot' },
  { label: '~', value: '~', ariaLabel: 'Tilde' },
  { label: '`', value: '`', ariaLabel: 'Backtick' },
]

export const useKeyBarLayoutStore = create<KeyBarLayoutStore>()(
  persist(
    (set, get) => ({
      // Initial state
      customLayout: null,

      setCustomLayout: (layout: KeyDefinition[]) => {
        set({ customLayout: layout })
      },

      resetToDefault: () => {
        set({ customLayout: null })
      },

      getLayout: () => {
        const { customLayout } = get()
        return customLayout || DEFAULT_LAYOUT
      },
    }),
    {
      name: 'ralph-keybar-layout',
    }
  )
)

export { DEFAULT_LAYOUT }
