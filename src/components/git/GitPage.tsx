import React, { useState } from 'react'
import { CommitInfo } from '../../lib/git-api'
import { BranchManager } from './BranchManager'
import { CommitHistory } from './CommitHistory'
import { DiffViewer } from './DiffViewer'
import { WorktreeManager } from './WorktreeManager'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { FolderOpen } from 'lucide-react'

export const GitPage: React.FC = () => {
  const [repoPath, setRepoPath] = useState('')
  const [activeRepoPath, setActiveRepoPath] = useState('')
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null)
  const [diffFromCommit, setDiffFromCommit] = useState<string | undefined>(undefined)
  const [diffToCommit, setDiffToCommit] = useState<string | undefined>(undefined)

  const handleSetRepo = () => {
    if (repoPath.trim()) {
      setActiveRepoPath(repoPath.trim())
    }
  }

  const handleCommitSelect = (commit: CommitInfo) => {
    setSelectedCommit(commit)
    // Set diff to show changes from this commit's parent to this commit
    if (commit.parent_ids.length > 0) {
      setDiffFromCommit(commit.parent_ids[0])
      setDiffToCommit(commit.id)
    } else {
      // First commit, show all files as new
      setDiffFromCommit(undefined)
      setDiffToCommit(commit.id)
    }
  }

  return (
    <div className="container mx-auto py-4 md:py-8 px-4">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">Git Management</h1>

        {/* Repository Path Input */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <div className="flex-1 relative">
            <FolderOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Enter repository path (e.g., /path/to/repo)"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSetRepo()
                }
              }}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSetRepo} disabled={!repoPath.trim()} className="w-full sm:w-auto">
            Load Repository
          </Button>
        </div>

        {activeRepoPath && (
          <div className="bg-muted border px-4 py-2 rounded">
            <p className="text-sm">
              <strong>Active Repository:</strong>{' '}
              <code className="bg-muted-foreground/10 px-2 py-1 rounded text-xs sm:text-sm break-all">
                {activeRepoPath}
              </code>
            </p>
          </div>
        )}
      </div>

      {activeRepoPath && (
        <Tabs defaultValue="branches" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="branches" className="text-xs sm:text-sm">
              Branches
            </TabsTrigger>
            <TabsTrigger value="commits" className="text-xs sm:text-sm">
              Commits
            </TabsTrigger>
            <TabsTrigger value="diff" className="text-xs sm:text-sm">
              Diff
            </TabsTrigger>
            <TabsTrigger value="worktrees" className="text-xs sm:text-sm">
              Worktrees
            </TabsTrigger>
          </TabsList>

          <TabsContent value="branches" className="space-y-6">
            <BranchManager repoPath={activeRepoPath} />
          </TabsContent>

          <TabsContent value="commits" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CommitHistory repoPath={activeRepoPath} onCommitSelect={handleCommitSelect} />

              <div>
                {selectedCommit ? (
                  <div className="border rounded-lg p-6 bg-card">
                    <h3 className="text-lg font-bold mb-4">Commit Details</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">ID:</span>
                        <code className="ml-2 bg-muted px-2 py-1 rounded text-sm font-mono">
                          {selectedCommit.id}
                        </code>
                      </div>

                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Author:</span>
                        <span className="ml-2">{selectedCommit.author}</span>
                        <span className="text-muted-foreground ml-1">({selectedCommit.email})</span>
                      </div>

                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Date:</span>
                        <span className="ml-2">
                          {new Date(selectedCommit.timestamp * 1000).toLocaleString()}
                        </span>
                      </div>

                      <div>
                        <span className="text-sm font-medium text-muted-foreground block mb-1">
                          Message:
                        </span>
                        <pre className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">
                          {selectedCommit.message}
                        </pre>
                      </div>

                      {selectedCommit.parent_ids.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-muted-foreground block mb-1">
                            Parent{selectedCommit.parent_ids.length > 1 ? 's' : ''}:
                          </span>
                          {selectedCommit.parent_ids.map((parentId, i) => (
                            <code
                              key={i}
                              className="block bg-muted px-2 py-1 rounded text-sm font-mono mb-1"
                            >
                              {parentId}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-6 bg-muted text-center text-muted-foreground">
                    Select a commit to view details
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="diff" className="space-y-6">
            <DiffViewer
              repoPath={activeRepoPath}
              fromCommit={diffFromCommit}
              toCommit={diffToCommit}
              showWorkingDiff={!diffFromCommit && !diffToCommit}
            />
          </TabsContent>

          <TabsContent value="worktrees" className="space-y-6">
            <WorktreeManager repoPath={activeRepoPath} />
          </TabsContent>
        </Tabs>
      )}

      {!activeRepoPath && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Enter a repository path above to get started</p>
        </div>
      )}
    </div>
  )
}
