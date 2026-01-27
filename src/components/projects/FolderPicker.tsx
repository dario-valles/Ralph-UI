import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Folder, FolderOpen, Plus } from 'lucide-react'
import type { ProjectFolder } from '@/types'

interface FolderPickerProps {
  folders: ProjectFolder[]
  selectedFolderId?: string | null
  onSelect: (folderId: string | null) => void
  onCreateFolder: (name: string) => Promise<ProjectFolder>
  disabled?: boolean
}

export function FolderPicker({
  folders,
  selectedFolderId,
  onSelect,
  onCreateFolder,
  disabled = false,
}: FolderPickerProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFolder = folders.find((f) => f.id === selectedFolderId)

  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim()
    if (!trimmedName) {
      setError('Folder name cannot be empty')
      return
    }

    // Check for duplicate names
    if (folders.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('Folder with this name already exists')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const folder = await onCreateFolder(trimmedName)
      // Auto-select the newly created folder
      onSelect(folder.id)
      setNewFolderName('')
      setShowCreateDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Folder:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2 flex-1 max-w-[200px]"
            disabled={disabled}
          >
            {selectedFolder ? (
              <>
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="truncate">{selectedFolder.name}</span>
              </>
            ) : (
              <>
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Uncategorized</span>
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <DropdownMenuItem onClick={() => onSelect(null)}>
            <Folder className="h-4 w-4 mr-2 text-muted-foreground" />
            <span>Uncategorized</span>
          </DropdownMenuItem>

          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => onSelect(folder.id)}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{folder.name}</div>
                {folder.projectCount !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    {folder.projectCount} {folder.projectCount === 1 ? 'project' : 'projects'}
                  </div>
                )}
              </div>
            </DropdownMenuItem>
          ))}

          <DropdownMenuItem
            onClick={() => {
              setShowCreateDialog(true)
              setError(null)
            }}
            className="gap-2 text-primary"
          >
            <Plus className="h-4 w-4" />
            <span>Create new folder...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Folder Dialog (inline) */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border rounded-lg shadow-lg max-w-md w-full p-4 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Create New Folder</h3>
              <p className="text-sm text-muted-foreground">
                Enter a name for the new folder
              </p>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') setShowCreateDialog(false)
                }}
                placeholder="e.g., Work Projects"
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  error && 'border-destructive'
                )}
                autoFocus
                disabled={isCreating}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateDialog(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleCreateFolder}
                disabled={isCreating || !newFolderName.trim()}
              >
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
