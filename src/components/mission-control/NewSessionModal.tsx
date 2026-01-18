// NewSessionModal - Dialog for creating a new session from Mission Control

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, AlertTriangle, FolderOpen } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectPicker } from '@/components/projects/ProjectPicker'

interface NewSessionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional default project path to pre-select */
  defaultProjectPath?: string
}

// Compute initial project path based on props and store state
function getInitialProjectPath(
  defaultProjectPath: string | undefined,
  getRecentProjects: (limit?: number) => { path: string }[],
  projects: { path: string }[]
): string {
  if (defaultProjectPath) return defaultProjectPath
  const recentProjects = getRecentProjects(1)
  if (recentProjects.length > 0) return recentProjects[0].path
  if (projects.length > 0) return projects[0].path
  return ''
}

export function NewSessionModal({ open, onOpenChange, defaultProjectPath }: NewSessionModalProps) {
  const navigate = useNavigate()
  const { sessions, createSession, loading: sessionLoading } = useSessionStore()
  const { projects, loadProjects, getRecentProjects, loading: projectsLoading } = useProjectStore()
  const inputRef = useRef<HTMLInputElement>(null)

  // State for form fields
  const [sessionName, setSessionName] = useState('')
  const [selectedProjectPath, setSelectedProjectPath] = useState(() =>
    getInitialProjectPath(defaultProjectPath, getRecentProjects, projects)
  )
  const [error, setError] = useState<string | null>(null)

  // Generate auto-name for sessions
  const generateAutoName = () => {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }
    return `Session - ${now.toLocaleString('en-US', options)}`
  }

  // Check for duplicate session names
  const duplicateSession = sessions.find(
    (s) => s.name.toLowerCase() === sessionName.trim().toLowerCase()
  )

  // Load projects when modal opens
  useEffect(() => {
    if (open && projects.length === 0) {
      loadProjects()
    }
  }, [open, projects.length, loadProjects])

  // Auto-focus input and set initial project when modal opens
  useEffect(() => {
    if (open) {
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100)
      // Set initial project if not already set
      if (!selectedProjectPath) {
        const initialPath = getInitialProjectPath(defaultProjectPath, getRecentProjects, projects)
        if (initialPath) {
          setSelectedProjectPath(initialPath)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run when modal opens
  }, [open])

  // Handle dialog state change with form reset
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset form when closing
      setSessionName('')
      setSelectedProjectPath('')
      setError(null)
    }
    onOpenChange(isOpen)
  }

  const handleCreate = async () => {
    if (!selectedProjectPath) {
      setError('Please select a project')
      return
    }

    setError(null)

    // Use provided name or generate auto-name
    const finalName = sessionName.trim() || generateAutoName()

    try {
      const session = await createSession(finalName, selectedProjectPath)
      if (session) {
        handleOpenChange(false)
        // Navigate to the new session
        navigate(`/sessions/${session.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !sessionLoading && !projectsLoading) {
      handleCreate()
    }
  }

  const isLoading = sessionLoading || projectsLoading
  const hasProjects = projects.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Create a new coding session for a project. Sessions help organize your work and track
            agent activity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Session Name (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="session-name">
              Session Name <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              ref={inputRef}
              id="session-name"
              placeholder="Leave blank for auto-generated name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            {/* Duplicate Name Warning */}
            {duplicateSession && sessionName.trim() && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  A session named "{duplicateSession.name}" already exists. Consider using a
                  different name.
                </span>
              </div>
            )}
          </div>

          {/* Project Selection */}
          {projectsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects...
            </div>
          ) : !hasProjects ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <h4 className="font-medium mb-1">No Projects Found</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Select a folder to get started with your first project.
              </p>
              <ProjectPicker
                value={selectedProjectPath}
                onChange={setSelectedProjectPath}
                label=""
                placeholder="Select a project folder"
              />
            </div>
          ) : (
            <ProjectPicker
              value={selectedProjectPath}
              onChange={setSelectedProjectPath}
              label="Project"
              placeholder="Select a project folder"
              disabled={isLoading}
            />
          )}

          {/* Error Message */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading || !selectedProjectPath}>
            {sessionLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
