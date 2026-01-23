import { BookOpen, CheckCircle2, Clock, XCircle } from 'lucide-react'

export interface ProgressViewerProps {
  content: string
}

export function ProgressViewer({ content }: ProgressViewerProps): React.JSX.Element {
  if (!content) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No progress recorded yet</p>
        <p className="text-sm">Learnings will appear here as the agent works</p>
      </div>
    )
  }

  // Parse progress entries
  const lines = content.split('\n')

  return (
    <div className="space-y-2 font-mono text-sm">
      {lines.map((line, index) => {
        // Skip empty lines and comments
        if (!line.trim() || line.startsWith('#')) {
          return null
        }

        // Parse entry type from line
        const isLearning = line.includes('[LEARNING]')
        const isError = line.includes('[ERROR]')
        const isStart = line.includes('[START]')
        const isEnd = line.includes('[END]')
        const isCompleted = line.includes('[COMPLETED]')

        let bgColor = 'bg-muted/30'
        let icon = <Clock className="h-3 w-3 text-muted-foreground" />

        if (isLearning) {
          bgColor = 'bg-blue-50 dark:bg-blue-950/30'
          icon = <BookOpen className="h-3 w-3 text-blue-500" />
        } else if (isError) {
          bgColor = 'bg-red-50 dark:bg-red-950/30'
          icon = <XCircle className="h-3 w-3 text-red-500" />
        } else if (isCompleted) {
          bgColor = 'bg-green-50 dark:bg-green-950/30'
          icon = <CheckCircle2 className="h-3 w-3 text-green-500" />
        } else if (isStart || isEnd) {
          bgColor = 'bg-muted/50'
        }

        return (
          <div key={index} className={`p-2 rounded ${bgColor} flex items-start gap-2`}>
            <span className="flex-shrink-0 mt-0.5">{icon}</span>
            <span className="break-all">{line}</span>
          </div>
        )
      })}
    </div>
  )
}
