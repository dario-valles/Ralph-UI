import { GitCommit } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CommitInfo } from '@/lib/git-api'

export interface CommitCardProps {
  commit: CommitInfo
}

export function CommitCard({ commit }: CommitCardProps): React.JSX.Element {
  // Format timestamp to readable date
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get first line of commit message
  const firstLine = commit.message.split('\n')[0]
  const hasMoreLines = commit.message.split('\n').length > 1

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="font-mono text-xs">
                {commit.short_id}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(commit.timestamp)}
              </span>
            </div>
            <p className="font-medium text-sm">
              {firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine}
            </p>
            {hasMoreLines && (
              <p className="text-xs text-muted-foreground mt-0.5">
                (+ {commit.message.split('\n').length - 1} more lines)
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{commit.author}</span>
              {commit.parent_ids.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  Merge
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
