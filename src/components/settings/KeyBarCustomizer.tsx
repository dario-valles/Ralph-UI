// Key bar customizer component - allows rearranging and resetting key layout

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RotateCcw, GripVertical } from 'lucide-react'
import { useKeyBarLayoutStore, DEFAULT_LAYOUT, type KeyDefinition } from '@/stores/keyBarLayoutStore'
import { cn } from '@/lib/utils'

export function KeyBarCustomizer() {
  const { getLayout, setCustomLayout, resetToDefault } = useKeyBarLayoutStore()
  const currentLayout = getLayout()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [layout, setLayout] = useState<KeyDefinition[]>(currentLayout)
  const [hasChanges, setHasChanges] = useState(false)

  // Handle drag start
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  // Handle drag over
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // Handle drop
  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      return
    }

    const newLayout = [...layout]
    const [draggedItem] = newLayout.splice(draggedIndex, 1)
    newLayout.splice(targetIndex, 0, draggedItem)

    setLayout(newLayout)
    setDraggedIndex(null)
    setHasChanges(true)
  }

  // Save changes
  const handleSave = () => {
    setCustomLayout(layout)
    setHasChanges(false)
  }

  // Reset to default
  const handleReset = () => {
    setLayout(DEFAULT_LAYOUT)
    resetToDefault()
    setHasChanges(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Bar Layout</CardTitle>
        <CardDescription>Customize the order of keys in the mobile terminal key bar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key layout preview */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Current Layout</p>
          <div className="bg-muted rounded-lg p-3 flex flex-wrap gap-2">
            {layout.map((key) => (
              <div
                key={key.label}
                className="px-2 py-1.5 text-xs font-medium bg-background rounded border border-border"
              >
                {key.label}
              </div>
            ))}
          </div>
        </div>

        {/* Draggable key editor */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Rearrange Keys</p>
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            {layout.map((key, index) => (
              <div
                key={`${key.label}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={cn(
                  'flex items-center gap-3 p-3 border-b border-border last:border-b-0 cursor-move',
                  'hover:bg-muted/50 transition-colors',
                  draggedIndex === index && 'bg-muted opacity-50'
                )}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{key.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {key.ariaLabel || 'Terminal key'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison with default */}
        {hasChanges && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              You have unsaved changes. Click Save to apply your changes.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex-1"
            variant={hasChanges ? 'default' : 'secondary'}
          >
            Save Layout
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex-1"
            title="Reset to default key layout"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Default
          </Button>
        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground">
          Drag keys to reorder them. The new layout will appear on your next terminal session.
        </p>
      </CardContent>
    </Card>
  )
}
