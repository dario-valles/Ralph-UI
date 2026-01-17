import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your Ralph UI preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
          <CardDescription>Configuration options coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Settings configuration will include:</p>
          <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Agent configuration (API keys, models)</li>
            <li>Default limits (iterations, cost, retries)</li>
            <li>Git preferences (branch naming, commit messages)</li>
            <li>UI preferences (theme, terminal font)</li>
            <li>Integrations (GitHub, Jira, Linear)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
