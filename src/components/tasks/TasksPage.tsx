import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TaskList } from './TaskList'
import { TaskDetail } from './TaskDetail'
import { PRDImport } from './PRDImport'
import { DependencyGraph } from './DependencyGraph'
import { useSessionStore } from '@/stores/sessionStore'
import { useTaskStore } from '@/stores/taskStore'
import { Upload, Network } from 'lucide-react'

export function TasksPage() {
  const { currentSession } = useSessionStore()
  const { fetchTasks, tasks } = useTaskStore()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showGraph, setShowGraph] = useState(false)

  useEffect(() => {
    if (currentSession) {
      fetchTasks(currentSession.id)
    }
  }, [currentSession, fetchTasks])

  if (!currentSession) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Manage your AI agent tasks</p>
        </div>

        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold">No Session Selected</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Please create or select a session first to manage tasks
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Manage tasks for session: {currentSession.name}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowGraph(!showGraph)}
          >
            <Network className="mr-2 h-4 w-4" />
            {showGraph ? 'Hide' : 'Show'} Graph
          </Button>
          <Button onClick={() => setShowImport(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import PRD
          </Button>
        </div>
      </div>

      {/* Statistics */}
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
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tasks.filter((t) => t.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dependency Graph (conditional) */}
      {showGraph && (
        <DependencyGraph
          sessionId={currentSession.id}
          onTaskClick={setSelectedTaskId}
        />
      )}

      {/* Task List */}
      <TaskList
        sessionId={currentSession.id}
        onTaskClick={setSelectedTaskId}
      />

      {/* Modals */}
      <PRDImport
        open={showImport}
        onOpenChange={setShowImport}
        sessionId={currentSession.id}
      />

      <TaskDetail
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        taskId={selectedTaskId}
      />
    </div>
  )
}
