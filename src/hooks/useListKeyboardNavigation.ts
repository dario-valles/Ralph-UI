import { useCallback, useEffect, useRef, useState } from 'react'

interface UseListKeyboardNavigationOptions<T> {
  items: T[]
  onSelect?: (item: T, index: number) => void
  onEscape?: () => void
  enabled?: boolean
  loop?: boolean
  initialIndex?: number
}

interface UseListKeyboardNavigationReturn {
  activeIndex: number
  setActiveIndex: (index: number) => void
  getItemProps: (index: number) => {
    tabIndex: number
    'aria-selected': boolean
    onKeyDown: (e: React.KeyboardEvent) => void
    onFocus: () => void
  }
  containerProps: {
    role: string
    'aria-activedescendant': string | undefined
    onKeyDown: (e: React.KeyboardEvent) => void
  }
}

/**
 * Hook for keyboard navigation in lists.
 * Supports arrow key navigation, Enter for selection, and Escape to close.
 *
 * Usage:
 * ```tsx
 * const { activeIndex, getItemProps, containerProps } = useListKeyboardNavigation({
 *   items: sessions,
 *   onSelect: (session) => handleSelect(session),
 *   onEscape: () => closeDropdown(),
 * })
 *
 * return (
 *   <ul {...containerProps}>
 *     {sessions.map((session, i) => (
 *       <li key={session.id} {...getItemProps(i)}>
 *         {session.title}
 *       </li>
 *     ))}
 *   </ul>
 * )
 * ```
 */
export function useListKeyboardNavigation<T>({
  items,
  onSelect,
  onEscape,
  enabled = true,
  loop = true,
  initialIndex = -1,
}: UseListKeyboardNavigationOptions<T>): UseListKeyboardNavigationReturn {
  const [activeIndex, setActiveIndexState] = useState(initialIndex)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  // Compute clamped active index based on items length
  const clampedActiveIndex =
    items.length === 0 ? -1 : activeIndex >= items.length ? items.length - 1 : activeIndex

  // Wrapper to set active index with bounds checking
  const setActiveIndex = (index: number) => {
    if (items.length === 0) {
      setActiveIndexState(-1)
    } else if (index < 0) {
      setActiveIndexState(0)
    } else if (index >= items.length) {
      setActiveIndexState(items.length - 1)
    } else {
      setActiveIndexState(index)
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || items.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
        case 'j': // vim-style
          e.preventDefault()
          setActiveIndexState((prev) => {
            if (prev === -1) return 0
            if (prev >= items.length - 1) {
              return loop ? 0 : prev
            }
            return prev + 1
          })
          break

        case 'ArrowUp':
        case 'k': // vim-style
          e.preventDefault()
          setActiveIndexState((prev) => {
            if (prev <= 0) {
              return loop ? items.length - 1 : 0
            }
            return prev - 1
          })
          break

        case 'Home':
          e.preventDefault()
          setActiveIndexState(0)
          break

        case 'End':
          e.preventDefault()
          setActiveIndexState(items.length - 1)
          break

        case 'Enter':
        case ' ':
          e.preventDefault()
          if (clampedActiveIndex >= 0 && clampedActiveIndex < items.length) {
            onSelect?.(items[clampedActiveIndex], clampedActiveIndex)
          }
          break

        case 'Escape':
          e.preventDefault()
          onEscape?.()
          break
      }
    },
    [enabled, items, clampedActiveIndex, onSelect, onEscape, loop]
  )

  // Focus the active item when index changes
  useEffect(() => {
    if (clampedActiveIndex >= 0) {
      const element = itemRefs.current.get(clampedActiveIndex)
      element?.focus()
    }
  }, [clampedActiveIndex])

  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex: index === clampedActiveIndex ? 0 : -1,
      'aria-selected': index === clampedActiveIndex,
      ref: (el: HTMLElement | null) => {
        if (el) {
          itemRefs.current.set(index, el)
        } else {
          itemRefs.current.delete(index)
        }
      },
      onKeyDown: handleKeyDown,
      onFocus: () => setActiveIndexState(index),
    }),
    [clampedActiveIndex, handleKeyDown]
  )

  const containerProps = {
    role: 'listbox',
    'aria-activedescendant':
      clampedActiveIndex >= 0 ? `list-item-${clampedActiveIndex}` : undefined,
    onKeyDown: handleKeyDown,
  }

  return {
    activeIndex: clampedActiveIndex,
    setActiveIndex,
    getItemProps,
    containerProps,
  }
}
