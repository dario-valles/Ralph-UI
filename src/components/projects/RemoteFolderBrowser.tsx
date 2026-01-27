import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invoke } from '@/lib/invoke'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronUp,
  Home,
  RefreshCw,
  Check,
  X,
  Eye,
  EyeOff,
} from 'lucide-react'
import { FolderPicker } from './FolderPicker'
import type { ProjectFolder } from '@/types'

interface DirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
  isHidden: boolean
}

interface RemoteFolderBrowserProps {
  onSelect: (path: string, folderId?: string | null) => void
  onCancel: () => void
  initialPath?: string
  folders?: ProjectFolder[]
  onCreateFolder?: (name: string) => Promise<ProjectFolder>
  showFolderSelector?: boolean
}

export function RemoteFolderBrowser({
  onSelect,
  onCancel,
  initialPath,
  folders = [],
  onCreateFolder,
  showFolderSelector = false,
}: RemoteFolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '')
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // Load directory contents
  const loadDirectory = async (path?: string) => {
    setLoading(true)
    setError(null)
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
    if (showFolderSelector) {
      onSelect(currentPath, selectedFolderId)
    } else {
      onSelect(currentPath)
    }
  }

  // Filter entries based on showHidden
  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.isHidden)

  return (
    <div className="flex flex-col h-[400px] w-full">
      {/* Header with path input */}
      <div className="p-3 border-b space-y-2">
        <div className="text-sm font-medium">Browse Server Folders</div>
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
            {showHidden
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

        {/* Folder selector (shown when enabled) */}
        {showFolderSelector && onCreateFolder && (
          <FolderPicker
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onCreateFolder={onCreateFolder}
          />
        )}

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
    </div>
  )
}
