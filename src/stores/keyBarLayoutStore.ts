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
