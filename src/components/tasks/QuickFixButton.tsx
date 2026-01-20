// Quick Fix Button - Create single-task micro-sessions from errors or context
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Zap, Wrench } from 'lucide-react'
import { sessionApi, taskApi } from '@/lib/tauri-api'
import { useSessionStore } from '@/stores/sessionStore'
import { useProjectStore } from '@/stores/projectStore'
import type { Task } from '@/types'

interface QuickFixButtonProps {
  /** Error message or context to fix */
  errorContext?: string
  /** Optional file path related to the error */
  filePath?: string
  /** Optional line number */
  lineNumber?: number
  /** Optional task ID this fix is related to */
  relatedTaskId?: string
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  /** Button size */
  size?: 'default' | 'sm' | 'icon'
  /** Custom button text */
  buttonText?: string
  /** Whether to show dialog or create directly */
  skipDialog?: boolean
  /** Class name for the button */
  className?: string
}

export function QuickFixButton({
  errorContext,
  filePath,
  lineNumber,
  relatedTaskId,
  variant = 'outline',
  size = 'sm',
  buttonText = 'Quick Fix',
  skipDialog = false,
  className,
}: QuickFixButtonProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')

  const { currentSession, setCurrentSession } = useSessionStore()
  const { getActiveProject } = useProjectStore()
  const activeProject = getActiveProject()

  // Generate default task description from error context
  const generateDescription = () => {
    const parts: string[] = []

    if (errorContext) {
      parts.push(`Fix the following error:\n\n\`\`\`\n${errorContext}\n\`\`\``)
    }

    if (filePath) {
      const location = lineNumber ? `${filePath}:${lineNumber}` : filePath
      parts.push(`\nLocation: \`${location}\``)
    }

    if (relatedTaskId) {
      parts.push(`\nRelated to task: ${relatedTaskId}`)
    }

    return parts.join('\n')
  }

  const handleOpenDialog = () => {
    // Pre-populate fields
    setTaskTitle(filePath ? `Fix error in ${filePath.split('/').pop()}` : 'Fix error')
    setTaskDescription(generateDescription())
    setOpen(true)
  }

  const handleQuickFix = async () => {
    if (skipDialog) {
      // Create directly without dialog
      await createQuickFixTask(
        filePath ? `Fix error in ${filePath.split('/').pop()}` : 'Fix error',
        generateDescription()
      )
    } else {
      handleOpenDialog()
    }
  }

  const createQuickFixTask = async (title: string, description: string) => {
    if (!activeProject) {
      console.error('No active project')
      return
    }

    setCreating(true)

    try {
      // Create a micro-session if no current session
      let sessionId = currentSession?.id

      if (!sessionId) {
        const session = await sessionApi.create(`Quick Fix - ${new Date().toLocaleString()}`, activeProject.path)
        sessionId = session.id
        setCurrentSession(session)
      }

      // Create the task
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        description,
        status: 'pending',
        priority: 1, // High priority for quick fixes
        dependencies: [],
      }

      await taskApi.create(sessionId, task)

      // Navigate to parallel execution to start the fix
      navigate(`/parallel?sessionId=${sessionId}&autoStart=true`)

      setOpen(false)
    } catch (error) {
      console.error('Failed to create quick fix task:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleSubmit = async () => {
    if (!taskTitle.trim()) return
    await createQuickFixTask(taskTitle, taskDescription)
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleQuickFix}
        className={className}
        disabled={!activeProject}
        title={!activeProject ? 'Select a project first' : undefined}
      >
        {size === 'icon' ? (
          <Zap className="h-4 w-4" />
        ) : (
          <>
            <Wrench className="h-3 w-3 mr-1" />
            {buttonText}
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Quick Fix Task
            </DialogTitle>
            <DialogDescription>
              Create a single task to fix this issue. An AI agent will be spawned immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Task Title</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Fix error in..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe what needs to be fixed..."
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            {currentSession ? (
              <p className="text-xs text-muted-foreground">
                Task will be added to current session: {currentSession.name}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                A new micro-session will be created for this quick fix.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={creating || !taskTitle.trim()}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Create & Start
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
