// Resize handle for terminal panel

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  onResize: (deltaY: number) => void
  className?: string
}

export function ResizeHandle({ onResize, className }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setStartY(e.clientY)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const deltaY = startY - e.clientY
      onResize(deltaY)
      setStartY(e.clientY)
    },
    [isDragging, startY, onResize]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      // Change cursor globally while dragging
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'h-1 w-full cursor-ns-resize hover:bg-primary/30 transition-colors',
        'flex items-center justify-center',
        'group',
        isDragging && 'bg-primary/50',
        className
      )}
    >
      <div
        className={cn(
          'w-12 h-1 rounded-full bg-muted-foreground/20 group-hover:bg-muted-foreground/40 transition-colors',
          isDragging && 'bg-muted-foreground/60'
        )}
      />
    </div>
  )
}
