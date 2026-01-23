import { useState, useCallback, useEffect } from 'react'

const TREE_VIEW_SETTINGS_KEY = 'ralph-ui-tree-view-settings'

export interface TreeViewSettings {
  /** Whether the tree view is visible */
  isVisible: boolean
  /** Height of the tree panel as a percentage of the container (20-80) */
  panelHeight: number
}

const defaultTreeViewSettings: TreeViewSettings = {
  isVisible: true,
  panelHeight: 30, // 30% of container by default
}

/**
 * Get tree view settings from localStorage
 */
function getTreeViewSettings(): TreeViewSettings {
  try {
    const stored = localStorage.getItem(TREE_VIEW_SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        isVisible: parsed.isVisible ?? true,
        panelHeight: Math.min(80, Math.max(20, parsed.panelHeight ?? 30)),
      }
    }
  } catch {
    // Ignore parse errors
  }
  return defaultTreeViewSettings
}

/**
 * Save tree view settings to localStorage
 */
function saveTreeViewSettings(settings: TreeViewSettings): void {
  try {
    localStorage.setItem(TREE_VIEW_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing tree view visibility and size settings
 *
 * Settings persist across dashboard reopens via localStorage.
 * Provides toggle and resize functions for the tree panel.
 */
export function useTreeViewSettings() {
  const [settings, setSettings] = useState<TreeViewSettings>(() => getTreeViewSettings())

  // Sync to localStorage when settings change
  useEffect(() => {
    saveTreeViewSettings(settings)
  }, [settings])

  const toggleTreeView = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      isVisible: !prev.isVisible,
    }))
  }, [])

  const setTreeVisible = useCallback((visible: boolean) => {
    setSettings((prev) => ({
      ...prev,
      isVisible: visible,
    }))
  }, [])

  const setPanelHeight = useCallback((height: number) => {
    // Clamp to valid range (20-80%)
    const clampedHeight = Math.min(80, Math.max(20, height))
    setSettings((prev) => ({
      ...prev,
      panelHeight: clampedHeight,
    }))
  }, [])

  return {
    isTreeVisible: settings.isVisible,
    panelHeight: settings.panelHeight,
    toggleTreeView,
    setTreeVisible,
    setPanelHeight,
  }
}
