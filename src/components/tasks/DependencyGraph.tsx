import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/stores/taskStore'
import { ArrowRight, AlertTriangle } from 'lucide-react'
import type { Task } from '@/types'

interface DependencyGraphProps {
  sessionId: string
  onTaskClick?: (taskId: string) => void
}

export function DependencyGraph({ sessionId: _sessionId, onTaskClick }: DependencyGraphProps) {
  const { tasks } = useTaskStore()

  // Build dependency map
  const dependencyMap = new Map<string, Task[]>()
  const taskMap = new Map<string, Task>()

  tasks.forEach((task) => {
    taskMap.set(task.id, task)
  })

  tasks.forEach((task) => {
    task.dependencies.forEach((depId) => {
      if (!dependencyMap.has(depId)) {
        dependencyMap.set(depId, [])
      }
      dependencyMap.get(depId)!.push(task)
    })
  })

  // Detect cycles (simple detection)
  const hasCycle = (taskId: string, visited = new Set<string>(), recStack = new Set<string>()): boolean => {
    visited.add(taskId)
    recStack.add(taskId)

    const task = taskMap.get(taskId)
    if (task) {
      for (const depId of task.dependencies) {
        if (!visited.has(depId)) {
          if (hasCycle(depId, visited, recStack)) {
            return true
          }
        } else if (recStack.has(depId)) {
          return true
        }
      }
    }

    recStack.delete(taskId)
    return false
  }

  const cycleDetected = tasks.some((task) => hasCycle(task.id))

  // Get root tasks (no dependencies)
  const rootTasks = tasks.filter((task) => task.dependencies.length === 0)

  // Get orphaned dependencies (referenced but don't exist)
  const orphanedDeps = new Set<string>()
  tasks.forEach((task) => {
    task.dependencies.forEach((depId) => {
      if (!taskMap.has(depId)) {
        orphanedDeps.add(depId)
      }
    })
  })

  const renderTaskNode = (task: Task, level = 0) => {
    const dependents = dependencyMap.get(task.id) || []

    return (
      <div key={task.id} className="space-y-2">
        <div
          className="flex items-center gap-2"
          style={{ paddingLeft: `${level * 2}rem` }}
        >
          {level > 0 && (
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          )}
          <button
            onClick={() => onTaskClick?.(task.id)}
            className="flex flex-1 items-center gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent"
          >
            <Badge variant="outline">P{task.priority}</Badge>
            <span className="flex-1 font-medium">{task.title}</span>
            <Badge
              variant={
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'failed'
                    ? 'destructive'
                    : task.status === 'in_progress'
                      ? 'info'
                      : 'secondary'
              }
            >
              {task.status}
            </Badge>
          </button>
        </div>

        {dependents.length > 0 && (
          <div className="space-y-2">
            {dependents.map((dependent) => renderTaskNode(dependent, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dependency Graph</CardTitle>
        <CardDescription>
          Visual representation of task dependencies
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Warnings */}
        {cycleDetected && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-500 bg-yellow-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <div className="flex-1 text-sm text-yellow-500">
              Circular dependency detected! This may cause issues during execution.
            </div>
          </div>
        )}

        {orphanedDeps.size > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-500 bg-yellow-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <div className="flex-1 text-sm text-yellow-500">
              Orphaned dependencies found: {Array.from(orphanedDeps).join(', ')}
            </div>
          </div>
        )}

        {/* Graph */}
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-center">
            <div>
              <p className="text-sm text-muted-foreground">
                No tasks to display. Import a PRD to see the dependency graph.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {rootTasks.length > 0 ? (
              rootTasks.map((task) => renderTaskNode(task))
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <button
                      onClick={() => onTaskClick?.(task.id)}
                      className="flex flex-1 items-center gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent"
                    >
                      <Badge variant="outline">P{task.priority}</Badge>
                      <span className="flex-1 font-medium">{task.title}</span>
                      <Badge
                        variant={
                          task.status === 'completed'
                            ? 'success'
                            : task.status === 'failed'
                              ? 'destructive'
                              : task.status === 'in_progress'
                                ? 'info'
                                : 'secondary'
                        }
                      >
                        {task.status}
                      </Badge>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4 rounded-md border bg-muted p-4 text-center text-sm">
          <div>
            <div className="font-semibold">{tasks.length}</div>
            <div className="text-muted-foreground">Total Tasks</div>
          </div>
          <div>
            <div className="font-semibold">{rootTasks.length}</div>
            <div className="text-muted-foreground">Root Tasks</div>
          </div>
          <div>
            <div className="font-semibold">
              {tasks.reduce((sum, task) => sum + task.dependencies.length, 0)}
            </div>
            <div className="text-muted-foreground">Dependencies</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
