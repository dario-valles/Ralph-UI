// Resize handle for split terminal panes

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface SplitResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  className?: string
}

export function SplitResizeHandle({ direction, onResize, className }: SplitResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [startPos, setStartPos] = useState(0)

  const isVertical = direction === 'vertical'

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      setStartPos(isVertical ? e.clientY : e.clientX)
    },
    [isVertical]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const currentPos = isVertical ? e.clientY : e.clientX
      const delta = currentPos - startPos
      onResize(delta)
      setStartPos(currentPos)
    },
    [isDragging, startPos, onResize, isVertical]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = isVertical ? 'ns-resize' : 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp, isVertical])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'flex-shrink-0 bg-border hover:bg-primary/30 transition-colors',
        isVertical ? 'h-1 w-full cursor-ns-resize' : 'w-1 h-full cursor-ew-resize',
        isDragging && 'bg-primary/50',
        className
      )}
    />
  )
}
