import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
        <p className="text-muted-foreground">Monitor your AI agents</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Monitoring</CardTitle>
          <CardDescription>Coming in Phase 3</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Agent integration and monitoring will be implemented in Phase 3, including:
          </p>
          <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Claude Code CLI integration</li>
            <li>Real-time log streaming</li>
            <li>Terminal emulator UI</li>
            <li>Agent status tracking</li>
            <li>Token and cost monitoring</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
