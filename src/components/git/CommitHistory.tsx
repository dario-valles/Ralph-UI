import React, { useEffect, useState } from 'react'
import { CommitInfo, gitApi, gitHelpers } from '../../lib/api/git-api'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { RefreshCw, GitCommit, User } from 'lucide-react'

interface CommitHistoryProps {
  repoPath: string
  maxCount?: number
  onCommitSelect?: (commit: CommitInfo) => void
}

export const CommitHistory: React.FC<CommitHistoryProps> = ({
  repoPath,
  maxCount = 50,
  onCommitSelect,
}) => {
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  const loadCommits = async () => {
    setLoading(true)
    setError(null)

    try {
      const history = await gitApi.getCommitHistory(repoPath, maxCount)
      setCommits(history)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (repoPath) {
      loadCommits()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Load on mount and prop changes only
  }, [repoPath, maxCount])

  const handleCommitClick = (commit: CommitInfo) => {
    setSelectedCommit(commit.id)
    if (onCommitSelect) {
      onCommitSelect(commit)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-bold">Commit History</CardTitle>
        <Button variant="outline" size="sm" onClick={loadCommits} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && !commits.length && (
          <div className="text-center py-8 text-gray-500">Loading commits...</div>
        )}

        {!loading && !error && commits.length === 0 && (
          <div className="text-center py-8 text-gray-500">No commits found</div>
        )}

        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {commits.map((commit) => (
            <div
              key={commit.id}
              className={`
                border rounded-lg p-4 cursor-pointer transition-all
                ${
                  selectedCommit === commit.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }
              `}
              onClick={() => handleCommitClick(commit)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <GitCommit className="h-4 w-4 text-gray-500" />
                  <Badge variant="outline" className="font-mono text-xs">
                    {commit.short_id}
                  </Badge>
                </div>
                <span className="text-xs text-gray-500">
                  {gitHelpers.formatTimestamp(commit.timestamp)}
                </span>
              </div>

              <div className="mb-2">
                <p className="font-medium text-gray-900">
                  {gitHelpers.formatCommitMessage(commit, 80)}
                </p>
                {commit.message.split('\n').length > 1 && (
                  <p className="text-xs text-gray-500 mt-1">
                    (+ {commit.message.split('\n').length - 1} more lines)
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <User className="h-3 w-3" />
                  <span>{commit.author}</span>
                </div>
                <span className="text-gray-400">{commit.email}</span>
              </div>

              {commit.parent_ids.length > 1 && (
                <div className="mt-2">
                  <Badge variant="secondary" className="text-xs">
                    Merge commit ({commit.parent_ids.length} parents)
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>

        {commits.length === maxCount && (
          <div className="text-center mt-4 text-sm text-gray-500">
            Showing first {maxCount} commits
          </div>
        )}
      </CardContent>
    </Card>
  )
}
