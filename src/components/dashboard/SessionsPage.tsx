import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SessionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground">View and manage your work sessions</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Management</CardTitle>
          <CardDescription>Coming in Phase 6</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Session management features will be implemented in Phase 6, including:
          </p>
          <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Session save/load functionality</li>
            <li>Session history browser</li>
            <li>Session export (JSON, PDF report)</li>
            <li>Session templates</li>
            <li>Crash recovery</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
