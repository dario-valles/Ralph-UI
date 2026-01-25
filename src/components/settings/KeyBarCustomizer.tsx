// Key bar customizer component - allows adding, removing, and rearranging keys

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  RotateCcw,
  GripVertical,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
} from 'lucide-react'
import {
  useKeyBarLayoutStore,
  DEFAULT_LAYOUT,
  AVAILABLE_KEYS,
  type KeyDefinition,
} from '@/stores/keyBarLayoutStore'
import { cn } from '@/lib/utils'

export function KeyBarCustomizer() {
  const {
    getLayout,
    setCustomLayout,
    resetToDefault,
    savePreset,
    switchPreset,
    deletePreset,
    getPresets,
    getActivePreset,
  } = useKeyBarLayoutStore()
  const currentLayout = getLayout()
  const presets = getPresets()
  const activePreset = getActivePreset()

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [layout, setLayout] = useState<KeyDefinition[]>(currentLayout)
  const [hasChanges, setHasChanges] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showPalette, setShowPalette] = useState(false)
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false)
  const [presetName, setPresetName] = useState('')

  const MIN_KEYS = 6
  const MAX_KEYS_PER_ROW = 10

  // Get keys that are available to add (not already in layout)
  const availableKeysToAdd = AVAILABLE_KEYS.filter(
    (availKey) => !layout.some((layoutKey) => layoutKey.label === availKey.label)
  )

  // Filter palette by search query
  const filteredAvailableKeys = availableKeysToAdd.filter(
    (key) =>
      key.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (key.ariaLabel?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  )

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

  // Add key from palette
  const handleAddKey = (key: KeyDefinition) => {
    if (layout.length < AVAILABLE_KEYS.length) {
      setLayout([...layout, key])
      setSearchQuery('')
      setHasChanges(true)
    }
  }

  // Remove key from layout
  const handleRemoveKey = (index: number) => {
    if (layout.length > MIN_KEYS) {
      const newLayout = layout.filter((_, i) => i !== index)
      setLayout(newLayout)
      setHasChanges(true)
    }
  }

  // Save changes
  const handleSave = () => {
    // Validate constraints before saving
    if (layout.length < MIN_KEYS) {
      alert(`You must have at least ${MIN_KEYS} keys in the bar`)
      return
    }
    setCustomLayout(layout)
    setHasChanges(false)
  }

  // Reset to default
  const handleReset = () => {
    setLayout(DEFAULT_LAYOUT)
    resetToDefault()
    setHasChanges(false)
  }

  // Handle switch preset
  const handleSwitchPreset = (presetId: string) => {
    switchPreset(presetId)
    const preset = presets.find((p) => p.id === presetId)
    if (preset) {
      setLayout(preset.layout)
      setHasChanges(false)
    }
  }

  // Handle save as preset
  const handleSaveAsPreset = () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name')
      return
    }
    savePreset(presetName, layout)
    setPresetName('')
    setShowSavePresetDialog(false)
  }

  // Handle delete preset
  const handleDeletePreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId)
    if (preset?.isBuiltin) {
      alert('Cannot delete built-in presets')
      return
    }
    if (confirm(`Delete preset "${preset?.name}"?`)) {
      deletePreset(presetId)
    }
  }

  // Calculate rows
  const rows: KeyDefinition[][] = []
  for (let i = 0; i < layout.length; i += MAX_KEYS_PER_ROW) {
    rows.push(layout.slice(i, i + MAX_KEYS_PER_ROW))
  }

  const canRemoveMore = layout.length > MIN_KEYS
  const isFull = layout.length >= AVAILABLE_KEYS.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Bar Layout</CardTitle>
        <CardDescription>
          Add, remove, and arrange keys in the mobile terminal key bar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Presets</p>
          <div className="space-y-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex gap-2 items-stretch">
                <button
                  onClick={() => handleSwitchPreset(preset.id)}
                  className={cn(
                    'flex-1 p-2 rounded-lg border-2 text-sm font-medium transition-colors',
                    activePreset?.id === preset.id
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-background hover:border-accent hover:bg-accent/5'
                  )}
                >
                  {preset.name}
                </button>
                {!preset.isBuiltin && (
                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="p-2 rounded-lg border-2 border-border hover:bg-destructive/10 text-destructive hover:text-destructive hover:border-destructive transition-colors"
                    title="Delete preset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save as preset dialog */}
        {showSavePresetDialog ? (
          <div className="space-y-2 p-3 bg-muted rounded-lg border border-border">
            <p className="text-sm font-medium">Save Current Layout as Preset</p>
            <Input
              placeholder="Enter preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveAsPreset()
                }
              }}
              className="h-8 text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveAsPreset} size="sm" className="flex-1" variant="default">
                <Save className="w-3 h-3 mr-1" />
                Save
              </Button>
              <Button
                onClick={() => {
                  setShowSavePresetDialog(false)
                  setPresetName('')
                }}
                size="sm"
                className="flex-1"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowSavePresetDialog(true)}
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!hasChanges}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Current Layout as Preset
          </Button>
        )}

        {/* Current layout preview with rows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Current Layout Preview</p>
            <p className="text-xs text-muted-foreground">
              {layout.length} keys ({Math.ceil(layout.length / MAX_KEYS_PER_ROW)} rows)
            </p>
          </div>
          <div className="bg-muted rounded-lg p-3 space-y-2">
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No keys selected</p>
            ) : (
              rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex flex-wrap gap-2">
                  {row.map((key, colIndex) => {
                    const globalIndex = rowIndex * MAX_KEYS_PER_ROW + colIndex
                    return (
                      <div
                        key={`${key.label}-preview-${globalIndex}`}
                        className="px-2 py-1 text-xs font-medium bg-background rounded border border-border"
                      >
                        {key.label}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Max {MAX_KEYS_PER_ROW} keys per row, minimum {MIN_KEYS} keys total
          </p>
        </div>

        {/* Draggable key editor */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Manage Keys</p>
          <div className="bg-background rounded-lg border border-border overflow-hidden max-h-80 overflow-y-auto">
            {layout.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No keys added</div>
            ) : (
              layout.map((key, index) => (
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
                  <button
                    onClick={() => handleRemoveKey(index)}
                    disabled={!canRemoveMore}
                    className={cn(
                      'p-1.5 rounded transition-colors',
                      canRemoveMore
                        ? 'hover:bg-destructive/10 text-destructive hover:text-destructive'
                        : 'text-muted-foreground cursor-not-allowed opacity-50'
                    )}
                    title={!canRemoveMore ? `Minimum ${MIN_KEYS} keys required` : 'Remove key'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Key palette */}
        <div className="space-y-2">
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="flex items-center gap-2 text-sm font-medium text-left w-full"
            disabled={isFull}
          >
            <span>
              {showPalette ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
            <span>Add Keys from Palette</span>
            {availableKeysToAdd.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {availableKeysToAdd.length} available
              </span>
            )}
          </button>

          {showPalette && !isFull && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <Input
                placeholder="Search keys..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {filteredAvailableKeys.length === 0 ? (
                  <div className="col-span-3 text-center text-xs text-muted-foreground py-4">
                    {searchQuery ? 'No keys match your search' : 'All available keys are in use'}
                  </div>
                ) : (
                  filteredAvailableKeys.map((key) => (
                    <button
                      key={key.label}
                      onClick={() => handleAddKey(key)}
                      className={cn(
                        'p-2 rounded border transition-colors text-xs font-medium',
                        'bg-background border-border hover:bg-accent hover:text-accent-foreground'
                      )}
                      title={key.ariaLabel}
                    >
                      <Plus className="w-3 h-3 inline-block mr-1" />
                      {key.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          {isFull && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              All available keys are in use
            </p>
          )}
        </div>

        {/* Unsaved changes warning */}
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
            disabled={!hasChanges || layout.length < MIN_KEYS}
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
          Drag to reorder, click + to add, click × to remove. The new layout appears on your next
          terminal session.
        </p>
      </CardContent>
    </Card>
  )
}
