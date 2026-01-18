// NewSessionModal - Dialog for creating a new session from Mission Control

import { useState, useEffect } from 'react'
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
import { Select } from '@/components/ui/select'
import { Loader2, Plus } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useProjectStore } from '@/stores/projectStore'

interface NewSessionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewSessionModal({ open, onOpenChange }: NewSessionModalProps) {
  const navigate = useNavigate()
  const { createSession, loading: sessionLoading } = useSessionStore()
  const { projects, loadProjects, loading: projectsLoading } = useProjectStore()

  const [sessionName, setSessionName] = useState('')
  const [selectedProjectPath, setSelectedProjectPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load projects when modal opens
  useEffect(() => {
    if (open && projects.length === 0) {
      loadProjects()
    }
  }, [open, projects.length, loadProjects])

  // Set default project when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectPath) {
      setSelectedProjectPath(projects[0].path)
    }
  }, [projects, selectedProjectPath])

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setSessionName('')
      setSelectedProjectPath(projects.length > 0 ? projects[0].path : '')
      setError(null)
    }
  }, [open, projects])

  const handleCreate = async () => {
    if (!sessionName.trim()) {
      setError('Session name is required')
      return
    }

    if (!selectedProjectPath) {
      setError('Please select a project')
      return
    }

    setError(null)

    try {
      const session = await createSession(sessionName.trim(), selectedProjectPath)
      if (session) {
        onOpenChange(false)
        // Navigate to the new session
        navigate(`/sessions/${session.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !sessionLoading) {
      handleCreate()
    }
  }

  const isLoading = sessionLoading || projectsLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Create a new coding session for a project. Sessions help organize your work and track
            agent activity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Session Name */}
          <div className="space-y-2">
            <Label htmlFor="session-name">Session Name</Label>
            <Input
              id="session-name"
              placeholder="e.g., Feature: User Authentication"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* Project Selection */}
          <div className="space-y-2">
            <Label htmlFor="project">Project</Label>
            {projectsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects found. Open a project folder first.
              </p>
            ) : (
              <Select
                id="project"
                value={selectedProjectPath}
                onChange={(e) => setSelectedProjectPath(e.target.value)}
                disabled={isLoading}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.path}>
                    {project.name} ({project.path})
                  </option>
                ))}
              </Select>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isLoading || projects.length === 0}
          >
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
