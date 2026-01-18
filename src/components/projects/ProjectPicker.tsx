import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, ChevronDown, Star, Clock, X } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'

interface ProjectPickerProps {
  value?: string
  onChange: (path: string) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ProjectPicker({
  value,
  onChange,
  label = 'Project Path',
  placeholder = 'Select a project folder',
  className,
  disabled = false,
}: ProjectPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { registerProject, getRecentProjects, getFavoriteProjects, getActiveProject } =
    useProjectStore()

  const favoriteProjects = getFavoriteProjects()
  const recentProjects = getRecentProjects(5)
  const activeProject = getActiveProject()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      })
      if (selected && typeof selected === 'string') {
        registerProject(selected)
        onChange(selected)
        setIsOpen(false)
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error)
    }
  }

  const handleSelectProject = (project: Project) => {
    registerProject(project.path) // Touch to update lastUsedAt
    onChange(project.path)
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange('')
  }

  const hasProjects = favoriteProjects.length > 0 || recentProjects.length > 0

  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label>{label}</Label>}
      <div className="relative" ref={dropdownRef}>
        {/* Input with dropdown trigger */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="pr-8"
            />
            {value && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent"
                disabled={disabled}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Quick select dropdown (only if projects exist) */}
          {hasProjects && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              disabled={disabled}
              className="shrink-0"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
              />
            </Button>
          )}

          {/* Browse button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleSelectFolder}
            disabled={disabled}
            className="shrink-0"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>

        {/* Dropdown with recent/favorite projects */}
        {isOpen && hasProjects && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
            <div className="max-h-48 overflow-y-auto">
              {/* Active project hint */}
              {activeProject && (
                <div className="px-3 py-2 bg-accent/30 border-b">
                  <div className="text-xs text-muted-foreground">Active project</div>
                  <button
                    onClick={() => handleSelectProject(activeProject)}
                    className="w-full text-left text-sm font-medium hover:text-primary truncate"
                  >
                    {activeProject.name}
                  </button>
                </div>
              )}

              {/* Favorites Section */}
              {favoriteProjects.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Favorites
                  </div>
                  {favoriteProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleSelectProject(project)}
                      className={cn(
                        'flex items-center w-full gap-2 px-2 py-1.5 rounded-md transition-colors text-left',
                        value === project.path ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{project.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Recent Section */}
              {recentProjects.filter((p) => !p.isFavorite).length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Recent
                  </div>
                  {recentProjects
                    .filter((p) => !p.isFavorite)
                    .map((project) => (
                      <button
                        key={project.id}
                        onClick={() => handleSelectProject(project)}
                        className={cn(
                          'flex items-center w-full gap-2 px-2 py-1.5 rounded-md transition-colors text-left',
                          value === project.path ? 'bg-accent' : 'hover:bg-accent/50'
                        )}
                      >
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{project.name}</div>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Show current path hint */}
      {value && (
        <div className="text-xs text-muted-foreground truncate" title={value}>
          {value}
        </div>
      )}
    </div>
  )
}
