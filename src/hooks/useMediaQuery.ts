import { useSyncExternalStore, useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook to detect if a media query matches
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  // Use useSyncExternalStore for proper subscription pattern
  const subscribe = (callback: () => void) => {
    if (typeof window === 'undefined') return () => {}
    const mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', callback)
    return () => mediaQuery.removeEventListener('change', callback)
  }

  const getSnapshot = () => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  }

  const getServerSnapshot = () => false

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Hook to detect mobile viewport (< 640px)
 */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 640px)')
}

/**
 * Hook to detect tablet viewport (640px - 1023px)
 */
export function useIsTablet(): boolean {
  const isAboveMobile = useMediaQuery('(min-width: 640px)')
  const isBelowDesktop = !useMediaQuery('(min-width: 1024px)')
  return isAboveMobile && isBelowDesktop
}

/**
 * Hook to detect desktop viewport (>= 1024px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/**
 * Hook to detect if the device prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Hook to detect scroll direction within a scrollable container
 * Returns 'up' | 'down' | null based on scroll direction
 * Uses "sticky" behavior to prevent flickering - direction only changes
 * when scrolling significantly in the opposite direction.
 * @param ref - React ref to the scrollable container
 * @param threshold - Minimum scroll distance to trigger direction change (default: 50px)
 * @param minScrollPosition - Minimum scroll position before hiding kicks in (default: 100px)
 */
export function useScrollDirection(
  ref: React.RefObject<HTMLElement | null>,
  threshold: number = 50,
  minScrollPosition: number = 100
): 'up' | 'down' | null {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null)
  // Track the scroll position where direction last changed (for sticky behavior)
  const lastDirectionChangePosition = useRef(0)
  const ticking = useRef(false)

  const updateScrollDirection = useCallback(() => {
    const element = ref.current
    if (!element) {
      ticking.current = false
      return
    }

    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight
    const clientHeight = element.clientHeight
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    // Always show header when near top or near bottom (prevents flicker at chat end)
    if (scrollTop < minScrollPosition || distanceFromBottom < 50) {
      if (scrollDirection !== null) {
        setScrollDirection(null)
        lastDirectionChangePosition.current = scrollTop
      }
      ticking.current = false
      return
    }

    // Calculate distance from last direction change
    const distanceFromLastChange = scrollTop - lastDirectionChangePosition.current

    // Sticky behavior: only change direction if we've scrolled significantly
    // in the opposite direction from the last change point
    if (distanceFromLastChange > threshold && scrollDirection !== 'down') {
      // Scrolled down significantly - hide header
      setScrollDirection('down')
      lastDirectionChangePosition.current = scrollTop
    } else if (distanceFromLastChange < -threshold && scrollDirection !== 'up') {
      // Scrolled up significantly - show header
      setScrollDirection('up')
      lastDirectionChangePosition.current = scrollTop
    }

    ticking.current = false
  }, [ref, threshold, minScrollPosition, scrollDirection])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateScrollDirection)
        ticking.current = true
      }
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [ref, updateScrollDirection])

  return scrollDirection
}
