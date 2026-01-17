import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground">Manage your AI agent tasks</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Management</CardTitle>
          <CardDescription>Coming in Phase 2</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Task management features will be implemented in Phase 2, including:
          </p>
          <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Import PRDs from markdown, YAML, GitHub Issues</li>
            <li>Visual task list with status indicators</li>
            <li>Dependency graph visualization</li>
            <li>Real-time progress tracking</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
