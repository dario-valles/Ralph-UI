import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Folder, FolderOpen, Plus, Search } from 'lucide-react'
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
  const [filterQuery, setFilterQuery] = useState('')

  const selectedFolder = folders.find((f) => f.id === selectedFolderId)
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(filterQuery.toLowerCase())
  )

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
          {/* Search input for filtering folders */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Filter folders..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            <DropdownMenuItem onClick={() => onSelect(null)}>
              <Folder className="h-4 w-4 mr-2 text-muted-foreground" />
              <span>Uncategorized</span>
            </DropdownMenuItem>

            {filteredFolders.map((folder) => (
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
                setFilterQuery('') // Clear filter when opening create dialog
              }}
              className="gap-2 text-primary"
            >
              <Plus className="h-4 w-4" />
              <span>Create new folder...</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Input
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
