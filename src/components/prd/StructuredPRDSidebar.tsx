import { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Target,
  User,
  CheckSquare,
  ListTodo,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExtractedPRDStructure, StructuredPRDItem } from '@/types'

interface StructuredPRDSidebarProps {
  structure: ExtractedPRDStructure | null
  onClear?: () => void
  className?: string
}

interface ItemGroupProps {
  title: string
  icon: React.ReactNode
  items: StructuredPRDItem[]
  defaultOpen?: boolean
  color: string
}

function getPriorityBadge(priority?: number) {
  if (!priority) return null
  const colors = {
    1: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    2: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    4: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    5: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  }
  return (
    <Badge variant="outline" className={cn('text-xs px-1.5 py-0', colors[priority as keyof typeof colors])}>
      P{priority}
    </Badge>
  )
}

function getEffortBadge(effort?: string) {
  if (!effort) return null
  const colors = {
    small: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    large: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }
  const labels = { small: 'S', medium: 'M', large: 'L' }
  return (
    <Badge variant="outline" className={cn('text-xs px-1.5 py-0', colors[effort as keyof typeof colors])}>
      {labels[effort as keyof typeof labels]}
    </Badge>
  )
}

function ItemGroup({ title, icon, items, defaultOpen = true, color }: ItemGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (items.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span className={cn('flex items-center gap-1.5', color)}>
          {icon}
          {title}
        </span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {items.length}
        </Badge>
      </button>
      {isOpen && (
        <div className="ml-4 space-y-1 py-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <span className="shrink-0 text-xs text-muted-foreground font-mono">{item.id}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="truncate font-medium">{item.title}</span>
                  {getPriorityBadge(item.priority)}
                  {getEffortBadge(item.estimatedEffort)}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {item.description}
                  </p>
                )}
                {item.acceptanceCriteria && item.acceptanceCriteria.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <CheckSquare className="h-3 w-3" />
                    {item.acceptanceCriteria.length} AC
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function StructuredPRDSidebar({ structure, onClear, className }: StructuredPRDSidebarProps) {
  const counts = useMemo(() => {
    if (!structure) return { total: 0, epics: 0, userStories: 0, tasks: 0, acceptanceCriteria: 0 }
    return {
      total: structure.epics.length + structure.userStories.length + structure.tasks.length + structure.acceptanceCriteria.length,
      epics: structure.epics.length,
      userStories: structure.userStories.length,
      tasks: structure.tasks.length,
      acceptanceCriteria: structure.acceptanceCriteria.length,
    }
  }, [structure])

  if (!structure || counts.total === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Extracted Items</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No items extracted yet</p>
            <p className="text-xs mt-1">
              Enable structured mode and ask the AI to output PRD items in JSON format
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Extracted Items</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {counts.total} items
            </Badge>
            {onClear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-6 w-6 p-0"
                title="Clear extracted items"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-2 space-y-1">
            <ItemGroup
              title="Epics"
              icon={<Target className="h-4 w-4" />}
              items={structure.epics}
              color="text-purple-600 dark:text-purple-400"
            />
            <ItemGroup
              title="User Stories"
              icon={<User className="h-4 w-4" />}
              items={structure.userStories}
              color="text-blue-600 dark:text-blue-400"
            />
            <ItemGroup
              title="Tasks"
              icon={<ListTodo className="h-4 w-4" />}
              items={structure.tasks}
              color="text-green-600 dark:text-green-400"
            />
            <ItemGroup
              title="Acceptance Criteria"
              icon={<CheckSquare className="h-4 w-4" />}
              items={structure.acceptanceCriteria}
              defaultOpen={false}
              color="text-orange-600 dark:text-orange-400"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
