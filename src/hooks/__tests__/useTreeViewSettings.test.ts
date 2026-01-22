import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTreeViewSettings } from '../useTreeViewSettings'

const TREE_VIEW_SETTINGS_KEY = 'ralph-ui-tree-view-settings'

describe('useTreeViewSettings', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns default settings when localStorage is empty', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    expect(result.current.isTreeVisible).toBe(true)
    expect(result.current.panelHeight).toBe(30)
  })

  it('loads settings from localStorage', () => {
    localStorage.setItem(
      TREE_VIEW_SETTINGS_KEY,
      JSON.stringify({ isVisible: false, panelHeight: 50 })
    )

    const { result } = renderHook(() => useTreeViewSettings())

    expect(result.current.isTreeVisible).toBe(false)
    expect(result.current.panelHeight).toBe(50)
  })

  it('toggles tree visibility', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    expect(result.current.isTreeVisible).toBe(true)

    act(() => {
      result.current.toggleTreeView()
    })

    expect(result.current.isTreeVisible).toBe(false)

    act(() => {
      result.current.toggleTreeView()
    })

    expect(result.current.isTreeVisible).toBe(true)
  })

  it('sets tree visibility directly', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    act(() => {
      result.current.setTreeVisible(false)
    })

    expect(result.current.isTreeVisible).toBe(false)

    act(() => {
      result.current.setTreeVisible(true)
    })

    expect(result.current.isTreeVisible).toBe(true)
  })

  it('sets panel height', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    act(() => {
      result.current.setPanelHeight(60)
    })

    expect(result.current.panelHeight).toBe(60)
  })

  it('clamps panel height to minimum of 20%', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    act(() => {
      result.current.setPanelHeight(10)
    })

    expect(result.current.panelHeight).toBe(20)
  })

  it('clamps panel height to maximum of 80%', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    act(() => {
      result.current.setPanelHeight(90)
    })

    expect(result.current.panelHeight).toBe(80)
  })

  it('persists settings to localStorage', () => {
    const { result } = renderHook(() => useTreeViewSettings())

    act(() => {
      result.current.toggleTreeView()
      result.current.setPanelHeight(45)
    })

    const stored = JSON.parse(localStorage.getItem(TREE_VIEW_SETTINGS_KEY)!)
    expect(stored.isVisible).toBe(false)
    expect(stored.panelHeight).toBe(45)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(TREE_VIEW_SETTINGS_KEY, 'not valid json')

    const { result } = renderHook(() => useTreeViewSettings())

    // Should fall back to defaults
    expect(result.current.isTreeVisible).toBe(true)
    expect(result.current.panelHeight).toBe(30)
  })

  it('clamps loaded panel height from localStorage', () => {
    localStorage.setItem(
      TREE_VIEW_SETTINGS_KEY,
      JSON.stringify({ isVisible: true, panelHeight: 95 })
    )

    const { result } = renderHook(() => useTreeViewSettings())

    // Should clamp to 80%
    expect(result.current.panelHeight).toBe(80)
  })
})
