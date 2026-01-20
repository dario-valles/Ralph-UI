import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TaskList } from './TaskList'
import { TaskDetail } from './TaskDetail'
import { PRDImport } from './PRDImport'
import { DependencyGraph } from './DependencyGraph'
import { NoSessionState } from '@/components/shared/EmptyState'
import { StatCard } from '@/components/shared/StatCard'
import { useSessionStore } from '@/stores/sessionStore'
import { useTaskStore } from '@/stores/taskStore'
import { Upload, Network } from 'lucide-react'

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionIdFromUrl = searchParams.get('sessionId')
  const taskIdFromUrl = searchParams.get('taskId')

  const { currentSession, fetchSession } = useSessionStore()
  const { fetchTasks, tasks } = useTaskStore()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showGraph, setShowGraph] = useState(false)

  // Track if we've handled the URL taskId param
  const handledTaskIdRef = useRef<string | null>(null)

  // Fetch session from URL param if currentSession is not set
  useEffect(() => {
    if (!currentSession && sessionIdFromUrl) {
      fetchSession(sessionIdFromUrl)
    }
  }, [currentSession, sessionIdFromUrl, fetchSession])

  // Memoized handler for task selection from URL
  const handleTaskIdFromUrl = useCallback(() => {
    if (taskIdFromUrl && tasks.length > 0 && handledTaskIdRef.current !== taskIdFromUrl) {
      const matchedTask = tasks.find(
        (t) => t.id === taskIdFromUrl || t.id.startsWith(taskIdFromUrl)
      )
      if (matchedTask) {
        handledTaskIdRef.current = taskIdFromUrl
        // Clear the taskId from URL
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('taskId')
        setSearchParams(newParams, { replace: true })
        return matchedTask.id
      }
    }
    return null
  }, [taskIdFromUrl, tasks, searchParams, setSearchParams])

  // Handle taskId from URL params once tasks are loaded
  useEffect(() => {
    const taskId = handleTaskIdFromUrl()
    if (taskId) {
      // Defer state update to avoid cascading renders
      const timer = setTimeout(() => setSelectedTaskId(taskId), 0)
      return () => clearTimeout(timer)
    }
  }, [handleTaskIdFromUrl])

  // Fetch tasks when session is available
  useEffect(() => {
    if (currentSession) {
      fetchTasks(currentSession.id)
    }
  }, [currentSession, fetchTasks])

  if (!currentSession) {
    return (
      <NoSessionState
        pageTitle="Tasks"
        pageDescription="Manage your AI agent tasks"
      />
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
        <StatCard title="Total Tasks" value={tasks.length} />
        <StatCard title="Pending" value={tasks.filter((t) => t.status === 'pending').length} />
        <StatCard title="In Progress" value={tasks.filter((t) => t.status === 'in_progress').length} />
        <StatCard title="Completed" value={tasks.filter((t) => t.status === 'completed').length} />
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
