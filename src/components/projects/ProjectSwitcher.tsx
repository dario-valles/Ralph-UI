import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderOpen, ChevronDown, Star, Clock, Plus, Check, X, Pencil, Trash2 } from 'lucide-react'
import { RemoteFolderBrowser } from './RemoteFolderBrowser'

// Hook to detect mobile viewport
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < breakpoint)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [breakpoint])

  return isMobile
}

interface ProjectSwitcherProps {
  collapsed?: boolean
  compact?: boolean
  className?: string
}

export function ProjectSwitcher({
  collapsed = false,
  compact = false,
  className,
}: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const {
    projects,
    activeProjectId,
    setActiveProject,
    registerProject,
    toggleFavorite,
    updateProjectName,
    deleteProject,
    getRecentProjects,
    getFavoriteProjects,
  } = useProjectStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const favoriteProjects = getFavoriteProjects()
  const recentProjects = getRecentProjects(5)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setEditingProjectId(null)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelectFolder = async () => {
    // Show folder browser
    setShowBrowser(true)
  }

  const handleBrowserSelect = async (path: string) => {
    try {
      const project = await registerProject(path)
      setActiveProject(project.id)
      setShowBrowser(false)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to register project:', error)
    }
  }

  const handleBrowserCancel = () => {
    setShowBrowser(false)
  }

  const handleSelectProject = (project: Project) => {
    setActiveProject(project.id)
    setIsOpen(false)
  }

  const handleClearProject = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveProject(null)
  }

  const handleStartEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation()
    setEditingProjectId(project.id)
    setEditingName(project.name)
  }

  const handleSaveEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    if (editingProjectId && editingName.trim()) {
      updateProjectName(editingProjectId, editingName.trim())
    }
    setEditingProjectId(null)
  }

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProjectId(null)
  }

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (confirm('Remove this project from the list?')) {
      deleteProject(projectId)
    }
  }

  const handleToggleFavorite = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    toggleFavorite(projectId)
  }

  // Get display name
  const getDisplayName = (project: Project) => {
    return project.name
  }

  // Collapsed view - just show folder icon with tooltip behavior handled by parent
  if (collapsed) {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-center w-full p-2 rounded-lg transition-colors',
          activeProject ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
          className
        )}
      >
        <FolderOpen className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(!isOpen)
          }
        }}
        className={cn(
          'flex items-center w-full border transition-colors cursor-pointer',
          'hover:bg-accent text-left',
          activeProject ? 'bg-accent/50' : 'bg-background',
          compact ? 'gap-1.5 px-2.5 py-1 rounded-full text-xs' : 'gap-2 px-3 py-2 rounded-lg'
        )}
      >
        <FolderOpen
          className={cn('shrink-0 text-muted-foreground', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        />
        <span className={cn('flex-1 truncate', compact ? 'text-xs' : 'text-sm')}>
          {activeProject ? getDisplayName(activeProject) : 'Select Project'}
        </span>
        {activeProject && (
          <button onClick={handleClearProject} className="p-0.5 rounded hover:bg-background">
            <X className={cn('text-muted-foreground', compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
          </button>
        )}
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            compact ? 'h-3 w-3' : 'h-4 w-4',
            isOpen && 'rotate-180'
          )}
        />
      </div>

      {/* Mobile Folder Browser Modal */}
      {isOpen &&
        showBrowser &&
        isMobile &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={handleBrowserCancel}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-lg bg-popover border rounded-lg shadow-lg overflow-hidden">
              <RemoteFolderBrowser onSelect={handleBrowserSelect} onCancel={handleBrowserCancel} />
            </div>
          </div>,
          document.body
        )}

      {/* Dropdown */}
      {isOpen && !(showBrowser && isMobile) && (
        <div
          className={cn(
            'absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden',
            showBrowser ? 'min-w-[min(400px,calc(100vw-2rem))]' : 'min-w-[min(300px,calc(100vw-2rem))]'
          )}
        >
          {/* Folder Browser or Add Button */}
          {showBrowser ? (
            <RemoteFolderBrowser onSelect={handleBrowserSelect} onCancel={handleBrowserCancel} />
          ) : (
            <button
              onClick={handleSelectFolder}
              className="flex items-center w-full gap-2 px-3 py-2 hover:bg-accent transition-colors border-b"
            >
              <Plus className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Add Project Folder</span>
            </button>
          )}

          {/* Project list - hidden when browser is shown */}
          {!showBrowser && (
            <div className="max-h-64 overflow-y-auto">
              {/* Favorites Section */}
              {favoriteProjects.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Favorites
                  </div>
                  {favoriteProjects.map((project) => (
                    <ProjectItem
                      key={project.id}
                      project={project}
                      isActive={project.id === activeProjectId}
                      isEditing={editingProjectId === project.id}
                      editingName={editingName}
                      onSelect={() => handleSelectProject(project)}
                      onToggleFavorite={(e) => handleToggleFavorite(e, project.id)}
                      onStartEdit={(e) => handleStartEdit(e, project)}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onDelete={(e) => handleDeleteProject(e, project.id)}
                      onEditNameChange={setEditingName}
                    />
                  ))}
                </div>
              )}

              {/* Recent Section */}
              {recentProjects.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Recent
                  </div>
                  {recentProjects
                    .filter((p) => !p.isFavorite)
                    .map((project) => (
                      <ProjectItem
                        key={project.id}
                        project={project}
                        isActive={project.id === activeProjectId}
                        isEditing={editingProjectId === project.id}
                        editingName={editingName}
                        onSelect={() => handleSelectProject(project)}
                        onToggleFavorite={(e) => handleToggleFavorite(e, project.id)}
                        onStartEdit={(e) => handleStartEdit(e, project)}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        onDelete={(e) => handleDeleteProject(e, project.id)}
                        onEditNameChange={setEditingName}
                      />
                    ))}
                </div>
              )}

              {/* Empty State */}
              {projects.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No projects yet. Add a folder to get started.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ProjectItemProps {
  project: Project
  isActive: boolean
  isEditing: boolean
  editingName: string
  onSelect: () => void
  onToggleFavorite: (e: React.MouseEvent) => void
  onStartEdit: (e: React.MouseEvent) => void
  onSaveEdit: (e: React.MouseEvent | React.KeyboardEvent) => void
  onCancelEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onEditNameChange: (name: string) => void
}

function ProjectItem({
  project,
  isActive,
  isEditing,
  editingName,
  onSelect,
  onToggleFavorite,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditNameChange,
}: ProjectItemProps) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <Input
          value={editingName}
          onChange={(e) => onEditNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit(e)
            if (e.key === 'Escape') onCancelEdit(e as unknown as React.MouseEvent)
          }}
          className="h-7 text-sm flex-1"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:h-6 sm:w-6 sm:min-h-0 sm:min-w-0" onClick={onSaveEdit}>
          <Check className="h-4 w-4 sm:h-3 sm:w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:h-6 sm:w-6 sm:min-h-0 sm:min-w-0" onClick={onCancelEdit}>
          <X className="h-4 w-4 sm:h-3 sm:w-3" />
        </Button>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group flex items-center w-full gap-2 px-2 py-1.5 rounded-md transition-colors text-left cursor-pointer',
        isActive ? 'bg-accent' : 'hover:bg-accent/50'
      )}
    >
      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{project.name}</div>
        <div className="text-xs text-muted-foreground truncate">{project.path}</div>
      </div>
      {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}

      {/* Actions (shown on hover) */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          onClick={onToggleFavorite}
          className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 sm:p-1 rounded hover:bg-background flex items-center justify-center"
          title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className={cn(
              'h-4 w-4 sm:h-3 sm:w-3',
              project.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
            )}
          />
        </button>
        <button onClick={onStartEdit} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 sm:p-1 rounded hover:bg-background flex items-center justify-center" title="Rename">
          <Pencil className="h-4 w-4 sm:h-3 sm:w-3 text-muted-foreground" />
        </button>
        <button onClick={onDelete} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 sm:p-1 rounded hover:bg-background flex items-center justify-center" title="Remove">
          <Trash2 className="h-4 w-4 sm:h-3 sm:w-3 text-destructive" />
        </button>
      </div>
    </div>
  )
}
