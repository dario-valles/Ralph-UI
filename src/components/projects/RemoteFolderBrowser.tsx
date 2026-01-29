import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invoke } from '@/lib/invoke'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronUp,
  Home,
  RefreshCw,
  Check,
  X,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react'
import { projectApi } from '@/lib/api/project-api'
import type { DirectoryEntry } from '@/types'

interface RemoteFolderBrowserProps {
  onSelect: (path: string) => void
  onCancel: () => void
  initialPath?: string
}

export function RemoteFolderBrowser({
  onSelect,
  onCancel,
  initialPath,
}: RemoteFolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '')
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [pathInput, setPathInput] = useState('')

  // Filter state
  const [filterQuery, setFilterQuery] = useState('')

  // Create folder dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Load directory contents
  const loadDirectory = async (path?: string) => {
    setLoading(true)
    setError(null)
    setFilterQuery('') // Clear filter when navigating
    try {
      const result = await invoke<DirectoryEntry[]>('list_directory', { path: path || null })
      setEntries(result)

      // Update current path - if path was empty, get home directory
      if (!path) {
        const homePath = await invoke<string>('get_home_directory')
        setCurrentPath(homePath)
        setPathInput(homePath)
      } else {
        setCurrentPath(path)
        setPathInput(path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Load initial directory
  useEffect(() => {
    loadDirectory(initialPath)
  }, [initialPath])

  // Navigate to a directory
  const navigateTo = (path: string) => {
    loadDirectory(path)
  }

  // Navigate up one level
  const navigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
    loadDirectory(parentPath)
  }

  // Navigate to home
  const navigateHome = () => {
    loadDirectory()
  }

  // Handle path input submission
  const handlePathSubmit = () => {
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim())
    }
  }

  // Handle select button click
  const handleSelect = () => {
    onSelect(currentPath)
  }

  // Handle create folder
  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim()
    if (!trimmedName) {
      setCreateError('Folder name cannot be empty')
      return
    }

    // Validate no path separators
    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setCreateError('Folder name cannot contain / or \\')
      return
    }

    // Check for existing folder with same name
    const existingFolder = entries.find(
      (e) => e.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (existingFolder) {
      setCreateError('A folder with this name already exists')
      return
    }

    setIsCreating(true)
    setCreateError(null)

    try {
      const newPath = currentPath.endsWith('/')
        ? `${currentPath}${trimmedName}`
        : `${currentPath}/${trimmedName}`

      const newEntry = await projectApi.createFilesystemDirectory(newPath)

      // Refresh directory listing
      await loadDirectory(currentPath)

      // Navigate to the new folder
      navigateTo(newEntry.path)

      // Close dialog and reset state
      setShowCreateDialog(false)
      setNewFolderName('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  // Filter entries based on showHidden and filterQuery
  const visibleEntries = entries.filter((e) => {
    // Filter hidden folders
    if (!showHidden && e.isHidden) {
      return false
    }
    // Filter by search query
    if (filterQuery.trim()) {
      return e.name.toLowerCase().includes(filterQuery.toLowerCase())
    }
    return true
  })

  return (
    <div className="flex flex-col h-[400px] w-full">
      {/* Header with path input */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Browse Server Folders</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setShowCreateDialog(true)
              setCreateError(null)
              setNewFolderName('')
            }}
            title="Create new folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Folder</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={navigateHome}
            title="Home"
          >
            <Home className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={navigateUp}
            disabled={currentPath === '/'}
            title="Go up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePathSubmit()
            }}
            placeholder="/path/to/folder"
            className="h-8 text-sm flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => loadDirectory(currentPath)}
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setShowHidden(!showHidden)}
            title={showHidden ? 'Hide hidden folders' : 'Show hidden folders'}
          >
            {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>

        {/* Filter input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter folders..."
            className="h-8 text-sm pl-8"
          />
        </div>
      </div>

      {/* Directory listing */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive p-4 text-center">
            <div className="text-sm">{error}</div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => loadDirectory(currentPath)}
            >
              Retry
            </Button>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {filterQuery.trim()
              ? 'No folders match your filter'
              : showHidden
                ? 'No folders in this directory'
                : 'No visible folders (try showing hidden)'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {visibleEntries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => navigateTo(entry.path)}
                className={cn(
                  'flex items-center w-full gap-2 px-2 py-1.5 rounded-md transition-colors text-left',
                  'hover:bg-accent',
                  entry.isHidden && 'opacity-60'
                )}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm truncate flex-1">{entry.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with current selection and actions */}
      <div className="p-3 border-t space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate flex-1 text-muted-foreground">{currentPath}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1 sm:flex-none">
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSelect}
            disabled={!currentPath}
            className="flex-1 sm:flex-none"
          >
            <Check className="h-4 w-4 mr-1" />
            <span className="sm:hidden">Select</span>
            <span className="hidden sm:inline">Select This Folder</span>
          </Button>
        </div>
      </div>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a new folder in <span className="font-mono text-xs">{currentPath}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Input
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value)
                setCreateError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) handleCreateFolder()
                if (e.key === 'Escape') setShowCreateDialog(false)
              }}
              placeholder="e.g., my-new-project"
              autoFocus
              disabled={isCreating}
            />
            {createError && <p className="text-sm text-destructive">{createError}</p>}
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
