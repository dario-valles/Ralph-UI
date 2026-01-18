import { useState, useMemo } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { useTaskStore } from '@/stores/taskStore'
import { formatBackendDateTime } from '@/lib/date-utils'
import type { Task, TaskStatus } from '@/types'
import { CheckCircle2, Circle, XCircle, Clock, AlertCircle } from 'lucide-react'

interface TaskDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string | null
}

const statusConfig = {
  pending: { icon: Circle, variant: 'secondary' as const, label: 'Pending' },
  in_progress: { icon: Clock, variant: 'info' as const, label: 'In Progress' },
  completed: { icon: CheckCircle2, variant: 'success' as const, label: 'Completed' },
  failed: { icon: XCircle, variant: 'destructive' as const, label: 'Failed' },
}

export function TaskDetail({ open, onOpenChange, taskId }: TaskDetailProps) {
  const { tasks, updateTask, updateTaskStatus, loading, error } = useTaskStore()
  const [editedTask, setEditedTask] = useState<Task | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const task = useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId])

  // Initialize editedTask when entering edit mode
  const startEditing = () => {
    if (task) {
      setEditedTask({ ...task })
      setIsEditing(true)
    }
  }

  // Use task data directly for display, editedTask only for editing
  const displayTask = isEditing && editedTask ? editedTask : task

  if (!task || !displayTask) return null

  const statusInfo = statusConfig[task.status]
  const StatusIcon = statusInfo.icon

  const handleSave = async () => {
    if (editedTask) {
      await updateTask(editedTask)
      if (!error) {
        setIsEditing(false)
      }
    }
  }

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (task) {
      await updateTaskStatus(task.id, newStatus)
    }
  }

  const handleClose = () => {
    setIsEditing(false)
    setEditedTask(task ? { ...task } : null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {isEditing && editedTask ? (
                  <Input
                    value={editedTask.title}
                    onChange={(e) =>
                      setEditedTask({ ...editedTask, title: e.target.value })
                    }
                    className="text-lg font-semibold"
                  />
                ) : (
                  task.title
                )}
              </DialogTitle>
              <DialogDescription>Task Details and Management</DialogDescription>
            </div>
            <Badge variant={statusInfo.variant}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {statusInfo.label}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            {isEditing && editedTask ? (
              <textarea
                value={editedTask.description}
                onChange={(e) =>
                  setEditedTask({ ...editedTask, description: e.target.value })
                }
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {task.description || 'No description provided'}
              </p>
            )}
          </div>

          {/* Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              {isEditing && editedTask ? (
                <Input
                  type="number"
                  min="1"
                  value={editedTask.priority}
                  onChange={(e) =>
                    setEditedTask({ ...editedTask, priority: parseInt(e.target.value) || 1 })
                  }
                />
              ) : (
                <p className="text-sm">Priority {task.priority}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              {isEditing && editedTask ? (
                <Select
                  value={editedTask.status}
                  onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                  disabled={loading}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </Select>
              ) : (
                <p className="text-sm">{statusInfo.label}</p>
              )}
            </div>
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Dependencies</label>
            {task.dependencies.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {task.dependencies.map((depId) => (
                  <Badge key={depId} variant="outline">
                    {depId}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No dependencies</p>
            )}
          </div>

          {/* Token Estimates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estimated Tokens</label>
              {isEditing && editedTask ? (
                <Input
                  type="number"
                  min="0"
                  value={editedTask.estimatedTokens || ''}
                  onChange={(e) =>
                    setEditedTask({
                      ...editedTask,
                      estimatedTokens: parseInt(e.target.value) || undefined,
                    })
                  }
                />
              ) : (
                <p className="text-sm">
                  {task.estimatedTokens?.toLocaleString() || 'Not specified'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Actual Tokens Used</label>
              <p className="text-sm">{task.actualTokens?.toLocaleString() || 'N/A'}</p>
            </div>
          </div>

          {/* Agent Assignment */}
          {task.assignedAgent && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Assigned Agent</label>
              <p className="text-sm">{task.assignedAgent}</p>
            </div>
          )}

          {/* Branch Info */}
          {task.branch && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Branch</label>
              <p className="font-mono text-sm">{task.branch}</p>
            </div>
          )}

          {/* Error Info */}
          {task.error && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">Error</label>
              <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm text-destructive">{task.error}</p>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            {task.startedAt && (
              <div>
                <span className="font-medium">Started:</span>{' '}
                {formatBackendDateTime(task.startedAt)}
              </div>
            )}
            {task.completedAt && (
              <div>
                <span className="font-medium">Completed:</span>{' '}
                {formatBackendDateTime(task.completedAt)}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <div className="flex-1 text-sm text-destructive">{error}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Close
          </Button>
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditedTask(task ? { ...task } : null)
                  setIsEditing(false)
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button onClick={startEditing}>Edit Task</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
