import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'

interface PRDStoriesTabProps {
  projectPath: string
  prdName: string
}

/**
 * Displays user stories extracted from a PRD.
 *
 * Stories are extracted when the PRD is converted to Ralph Loop format.
 * This component will show extracted stories once they're available.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PRDStoriesTab(_props: PRDStoriesTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>PRD Stories</CardTitle>
        <CardDescription>Tasks and user stories extracted from this PRD</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Stories Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Execute the PRD to convert it to Ralph Loop format and extract stories.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
