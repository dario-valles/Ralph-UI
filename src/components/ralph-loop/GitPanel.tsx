import { GitCommit } from 'lucide-react'
import { CommitCard } from './CommitCard'
import type { CommitInfo } from '@/lib/git-api'

export interface GitPanelProps {
  commits: CommitInfo[]
}

export function GitPanel({ commits }: GitPanelProps): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-2">
        {commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <GitCommit className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
            <p className="text-muted-foreground">No commits found</p>
            <p className="text-sm text-muted-foreground">
              Commits will appear here as the agent works
            </p>
          </div>
        ) : (
          commits.map((commit) => <CommitCard key={commit.id} commit={commit} />)
        )}
      </div>
    </div>
  )
}
