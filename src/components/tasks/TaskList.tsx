import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/stores/taskStore'
import { taskStatusConfig } from '@/lib/status-config'
import type { TaskStatus } from '@/types'
import { Circle, Search } from 'lucide-react'

interface TaskListProps {
  sessionId: string
  onTaskClick?: (taskId: string) => void
}

export function TaskList({ sessionId: _sessionId, onTaskClick }: TaskListProps) {
  void _sessionId // Mark as intentionally unused
  const { getFilteredTasks, setFilter, filter } = useTaskStore()
  const [searchQuery, setSearchQuery] = useState('')

  const tasks = getFilteredTasks()

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    setFilter({ searchQuery: value })
  }

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setFilter({ status: value ? (value as TaskStatus) : undefined })
  }

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'priority' | 'title' | 'status'
    setFilter({ sortBy: value })
  }

  const handleSortOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'asc' | 'desc'
    setFilter({ sortOrder: value })
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter and sort your tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={filter.status || ''} onChange={handleStatusFilterChange}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </Select>

            {/* Sort By */}
            <Select value={filter.sortBy || 'priority'} onChange={handleSortChange}>
              <option value="priority">Sort by Priority</option>
              <option value="title">Sort by Title</option>
              <option value="status">Sort by Status</option>
            </Select>

            {/* Sort Order */}
            <Select value={filter.sortOrder || 'asc'} onChange={handleSortOrderChange}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Task List */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center p-12">
              <div className="text-center">
                <Circle className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No tasks found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchQuery || filter.status
                    ? 'Try adjusting your filters'
                    : 'Import a PRD to get started'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => {
            const statusInfo = taskStatusConfig[task.status]
            const StatusIcon = statusInfo.icon

            return (
              <Card
                key={task.id}
                className="cursor-pointer transition-colors hover:bg-accent"
                onClick={() => onTaskClick?.(task.id)}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  {/* Priority Badge */}
                  <div className="flex items-center justify-center">
                    <Badge variant="outline" className="min-w-[3rem]">
                      P{task.priority}
                    </Badge>
                  </div>

                  {/* Task Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <Badge variant={statusInfo.variant}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {task.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {task.dependencies.length > 0 && (
                        <span>
                          Dependencies: {task.dependencies.length}
                        </span>
                      )}
                      {task.estimatedTokens && (
                        <span>
                          Est. {task.estimatedTokens.toLocaleString()} tokens
                        </span>
                      )}
                      {task.actualTokens && (
                        <span>
                          Used {task.actualTokens.toLocaleString()} tokens
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
