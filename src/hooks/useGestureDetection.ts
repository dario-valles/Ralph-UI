// Custom hook for detecting swipe gestures on touch devices

import { useEffect, useRef, useState } from 'react'

export interface GestureState {
  isDetecting: boolean
  direction: 'up' | 'down' | 'left' | 'right' | null
  distance: number
}

interface TouchPoint {
  x: number
  y: number
  timestamp: number
}

export interface UseGestureDetectionOptions {
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onTwoFingerSwipeUp?: () => void
  onTwoFingerSwipeDown?: () => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  threshold?: number // Minimum distance to register as swipe (pixels)
  enabled?: boolean
}

export function useGestureDetection(
  elementRef: React.RefObject<HTMLElement>,
  options: UseGestureDetectionOptions = {}
) {
  const {
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    onTwoFingerSwipeUp,
    onTwoFingerSwipeDown,
    onGestureStart,
    onGestureEnd,
    threshold = 30,
    enabled = true,
  } = options

  const [gestureState, setGestureState] = useState<GestureState>({
    isDetecting: false,
    direction: null,
    distance: 0,
  })

  const touchStartRef = useRef<TouchPoint | null>(null)
  const touchCurrentRef = useRef<TouchPoint | null>(null)

  useEffect(() => {
    if (!enabled || !elementRef.current) return

    const element = elementRef.current

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 && e.touches.length !== 2) return // Handle single or two finger touches

      const touch = e.touches[0]
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      }
      touchCurrentRef.current = { ...touchStartRef.current }

      setGestureState({
        isDetecting: true,
        direction: null,
        distance: 0,
      })

      onGestureStart?.()
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || (e.touches.length !== 1 && e.touches.length !== 2)) return

      const touch = e.touches[0]
      touchCurrentRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      }

      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y

      // Calculate distance from start point
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Determine swipe direction based on which component is larger
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      let direction: 'up' | 'down' | 'left' | 'right' | null = null
      if (absDy > absDx) {
        // Vertical swipe
        direction = dy < 0 ? 'up' : 'down'
      } else {
        // Horizontal swipe
        direction = dx < 0 ? 'left' : 'right'
      }

      setGestureState({
        isDetecting: true,
        direction,
        distance,
      })
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || !touchCurrentRef.current) return

      const dx = touchCurrentRef.current.x - touchStartRef.current.x
      const dy = touchCurrentRef.current.y - touchStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Check if this was a two-finger gesture
      const isTwoFinger = e.touches.length > 0 && (e.touches.length === 2 || e.changedTouches.length === 2)

      // Only trigger callback if swipe exceeded threshold
      if (distance >= threshold) {
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)

        if (absDy > absDx) {
          // Vertical swipe
          if (isTwoFinger) {
            // Two-finger swipe
            if (dy < 0 && distance >= threshold) {
              onTwoFingerSwipeUp?.()
            } else if (dy > 0 && distance >= threshold) {
              onTwoFingerSwipeDown?.()
            }
          } else {
            // Single-finger swipe
            if (dy < 0 && distance >= threshold) {
              onSwipeUp?.()
            } else if (dy > 0 && distance >= threshold) {
              onSwipeDown?.()
            }
          }
        } else {
          // Horizontal swipe
          if (!isTwoFinger) {
            // Only handle single-finger horizontal swipes
            if (dx < 0 && distance >= threshold) {
              onSwipeLeft?.()
            } else if (dx > 0 && distance >= threshold) {
              onSwipeRight?.()
            }
          }
        }
      }

      setGestureState({
        isDetecting: false,
        direction: null,
        distance: 0,
      })

      onGestureEnd?.()

      touchStartRef.current = null
      touchCurrentRef.current = null
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [
    enabled,
    elementRef,
    threshold,
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    onTwoFingerSwipeUp,
    onTwoFingerSwipeDown,
    onGestureStart,
    onGestureEnd,
  ])

  return gestureState
}
