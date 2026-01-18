// SessionDetailPage - Displays session details with empty state experience for new sessions

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Plus,
  FileText,
  Loader2,
  Target,
  Sparkles,
  Settings,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
} from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useTaskStore } from '@/stores/taskStore'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskDetail } from '@/components/tasks/TaskDetail'
import { PRDImport } from '@/components/tasks/PRDImport'
import { DependencyGraph } from '@/components/tasks/DependencyGraph'
import type { Task, SessionStatus } from '@/types'

const statusConfig = {
  active: { icon: Play, variant: 'default' as const, label: 'Active' },
  paused: { icon: Pause, variant: 'secondary' as const, label: 'Paused' },
  completed: { icon: CheckCircle2, variant: 'outline' as const, label: 'Completed' },
  failed: { icon: XCircle, variant: 'destructive' as const, label: 'Failed' },
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const {
    currentSession,
    fetchSession,
    updateSessionStatus,
    loading: sessionLoading,
    error: sessionError,
  } = useSessionStore()
  const { tasks, fetchTasks, createTask, loading: tasksLoading } = useTaskStore()

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)

  // Quick task creation state
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickTaskDescription, setQuickTaskDescription] = useState('')
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  // Load session and tasks on mount
  useEffect(() => {
    if (id) {
      fetchSession(id)
      fetchTasks(id)
    }
  }, [id, fetchSession, fetchTasks])

  const handleStatusToggle = async () => {
    if (!currentSession) return
    const newStatus: SessionStatus =
      currentSession.status === 'active' ? 'paused' : 'active'
    await updateSessionStatus(currentSession.id, newStatus)
  }

  const handleQuickTaskCreate = async () => {
    if (!quickTaskTitle.trim() || !currentSession) return

    setIsCreatingTask(true)
    try {
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: quickTaskTitle.trim(),
        description: quickTaskDescription.trim(),
        status: 'pending',
        priority: tasks.length + 1,
        dependencies: [],
      }
      await createTask(currentSession.id, newTask)
      setQuickTaskTitle('')
      setQuickTaskDescription('')
      setShowAddTask(false)
    } finally {
      setIsCreatingTask(false)
    }
  }

  // Loading state
  if (sessionLoading && !currentSession) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (sessionError && !currentSession) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Mission Control
            </Button>
          </Link>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{sessionError}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Session not found
  if (!currentSession) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Mission Control
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Session Not Found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The session you're looking for doesn't exist or has been deleted.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const StatusIcon = statusConfig[currentSession.status]?.icon || Circle
  const statusInfo = statusConfig[currentSession.status] || statusConfig.active
  const hasTasks = tasks.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Mission Control
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold tracking-tight">{currentSession.name}</h1>
            <Badge variant={statusInfo.variant}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{currentSession.projectPath}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleStatusToggle}>
            {currentSession.status === 'active' ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume
              </>
            )}
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Empty State - New Session Experience */}
      {!hasTasks && !tasksLoading && (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="max-w-lg mx-auto text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <Target className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">What would you like to work on?</h2>
                <p className="text-muted-foreground">
                  This session has no tasks yet. Add tasks manually or import from a PRD.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => setShowAddTask(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Task Manually
                </Button>
                <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
                  <FileText className="h-4 w-4" />
                  Import PRD
                </Button>
              </div>

              <div className="mt-8 pt-6 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center mb-3">
                  <Sparkles className="h-4 w-4" />
                  <span>Tip: Tasks define the work for AI agents to complete.</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks Statistics (when there are tasks) */}
      {hasTasks && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tasks.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Circle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tasks.filter((t) => t.status === 'pending').length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tasks.filter((t) => t.status === 'in_progress').length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tasks.filter((t) => t.status === 'completed').length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex gap-2">
            <Button onClick={() => setShowAddTask(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Import PRD
            </Button>
            <Button variant="outline" onClick={() => setShowGraph(!showGraph)}>
              {showGraph ? 'Hide' : 'Show'} Graph
            </Button>
          </div>

          {/* Dependency Graph */}
          {showGraph && (
            <DependencyGraph
              sessionId={currentSession.id}
              onTaskClick={setSelectedTaskId}
            />
          )}

          {/* Task List */}
          <TaskList sessionId={currentSession.id} onTaskClick={setSelectedTaskId} />
        </>
      )}

      {/* Add Task Modal */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Create a task for AI agents to work on. Tasks define specific pieces of work.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Task Title</Label>
              <Input
                id="task-title"
                placeholder="e.g., Implement user authentication"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleQuickTaskCreate()
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">
                Description <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                id="task-description"
                placeholder="Describe what this task should accomplish..."
                value={quickTaskDescription}
                onChange={(e) => setQuickTaskDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTask(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickTaskCreate}
              disabled={!quickTaskTitle.trim() || isCreatingTask}
            >
              {isCreatingTask ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PRD Import Modal */}
      <PRDImport
        open={showImport}
        onOpenChange={setShowImport}
        sessionId={currentSession.id}
      />

      {/* Task Detail Modal */}
      <TaskDetail
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        taskId={selectedTaskId}
      />
    </div>
  )
}
