import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock } from 'lucide-react'

interface PRDHistoryTabProps {
  projectPath: string
  prdName: string
}

/**
 * Displays execution history for a PRD.
 *
 * Note: Execution history is currently stored by execution ID, not PRD name.
 * A future enhancement could add a backend API to query executions by PRD.
 * For now, this shows an empty state directing users to the Ralph Loop page.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PRDHistoryTab(_props: PRDHistoryTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution History</CardTitle>
        <CardDescription>Past executions of this PRD</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No History Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Execution history will appear here after you run the PRD. View active executions on the
            Ralph Loop page.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
