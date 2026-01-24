// Custom hook for detecting swipe gestures on touch devices

import { useEffect, useRef, useState } from 'react'

export interface GestureState {
  isDetecting: boolean
  direction: 'up' | 'down' | 'left' | 'right' | null
  distance: number
  scale?: number // For pinch gestures (1.0 = no change, >1.0 = pinch out, <1.0 = pinch in)
}

interface TouchPoint {
  x: number
  y: number
  timestamp: number
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

export interface UseGestureDetectionOptions {
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onTwoFingerSwipeUp?: () => void
  onTwoFingerSwipeDown?: () => void
  onPinchIn?: (scale: number) => void
  onPinchOut?: (scale: number) => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  threshold?: number // Minimum distance to register as swipe (pixels)
  pinchThreshold?: number // Minimum scale change to register as pinch (0.1 = 10%)
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
    onPinchIn,
    onPinchOut,
    onGestureStart,
    onGestureEnd,
    threshold = 30,
    pinchThreshold = 0.1,
    enabled = true,
  } = options

  const [gestureState, setGestureState] = useState<GestureState>({
    isDetecting: false,
    direction: null,
    distance: 0,
    scale: 1,
  })

  const touchStartRef = useRef<TouchPoint | null>(null)
  const touchSecondStartRef = useRef<TouchPoint | null>(null)
  const touchCurrentRef = useRef<TouchPoint | null>(null)
  const touchSecondCurrentRef = useRef<TouchPoint | null>(null)
  const initialPinchDistanceRef = useRef<number | null>(null)

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

      // Track second touch point for pinch detection
      if (e.touches.length === 2) {
        const touch2 = e.touches[1]
        touchSecondStartRef.current = {
          x: touch2.clientX,
          y: touch2.clientY,
          timestamp: Date.now(),
        }
        touchSecondCurrentRef.current = { ...touchSecondStartRef.current }
        initialPinchDistanceRef.current = getDistance(
          touchStartRef.current.x,
          touchStartRef.current.y,
          touch2.clientX,
          touch2.clientY
        )
      } else {
        touchSecondStartRef.current = null
        touchSecondCurrentRef.current = null
        initialPinchDistanceRef.current = null
      }

      setGestureState({
        isDetecting: true,
        direction: null,
        distance: 0,
        scale: 1,
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

      // Handle two-finger pinch
      if (e.touches.length === 2 && touchSecondStartRef.current && initialPinchDistanceRef.current !== null) {
        const touch2 = e.touches[1]
        touchSecondCurrentRef.current = {
          x: touch2.clientX,
          y: touch2.clientY,
          timestamp: Date.now(),
        }

        const currentDistance = getDistance(
          touchCurrentRef.current.x,
          touchCurrentRef.current.y,
          touch2.clientX,
          touch2.clientY
        )

        const scale = currentDistance / initialPinchDistanceRef.current

        setGestureState({
          isDetecting: true,
          direction: null,
          distance: 0,
          scale,
        })
        return
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
        scale: 1,
      })
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || !touchCurrentRef.current) return

      // Check if this was a pinch gesture (ended with scale change)
      if (touchSecondStartRef.current && touchSecondCurrentRef.current && initialPinchDistanceRef.current !== null) {
        const currentDistance = getDistance(
          touchCurrentRef.current.x,
          touchCurrentRef.current.y,
          touchSecondCurrentRef.current.x,
          touchSecondCurrentRef.current.y
        )
        const scale = currentDistance / initialPinchDistanceRef.current

        // Trigger pinch callback if scale changed beyond threshold
        if (Math.abs(scale - 1) >= pinchThreshold) {
          if (scale < 1) {
            // Pinch in (zoom out)
            onPinchIn?.(scale)
          } else {
            // Pinch out (zoom in)
            onPinchOut?.(scale)
          }
        }

        setGestureState({
          isDetecting: false,
          direction: null,
          distance: 0,
          scale: 1,
        })

        onGestureEnd?.()
        touchStartRef.current = null
        touchCurrentRef.current = null
        touchSecondStartRef.current = null
        touchSecondCurrentRef.current = null
        initialPinchDistanceRef.current = null
        return
      }

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
        scale: 1,
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
    pinchThreshold,
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    onTwoFingerSwipeUp,
    onTwoFingerSwipeDown,
    onPinchIn,
    onPinchOut,
    onGestureStart,
    onGestureEnd,
  ])

  return gestureState
}
