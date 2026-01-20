// Auto-Merge Panel - Merge completed task branches back to main
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  GitMerge,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings2,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Terminal,
  Copy,
} from 'lucide-react'
import {
  autoMergeCompletedBranches,
  getMergeableBranches,
  createDefaultAutoMergeConfig,
  type AutoMergeConfig,
  type AutoMergeResult,
  type MergeBranchResult,
  type SchedulerStats,
} from '@/lib/parallel-api'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface AutoMergePanelProps {
  sessionId: string
  repoPath: string
  schedulerStats: SchedulerStats | null
  onMergeComplete?: () => void
}

export function AutoMergePanel({
  sessionId,
  repoPath,
  schedulerStats,
  onMergeComplete,
}: AutoMergePanelProps) {
  const [config, setConfig] = useState<AutoMergeConfig>(createDefaultAutoMergeConfig())
  const [mergeableBranches, setMergeableBranches] = useState<
    { taskId: string; branch: string; completedAt: string }[]
  >([])
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState<AutoMergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [showResults, setShowResults] = useState(true)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [showManualCommands, setShowManualCommands] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  // Check if all tasks are complete (or failed)
  const allTasksFinished = useMemo(() => {
    if (!schedulerStats) return false
    const finished = schedulerStats.completed + schedulerStats.failed
    return finished === schedulerStats.total && schedulerStats.total > 0
  }, [schedulerStats])

  // Check if there are completed tasks (not just failed)
  const hasCompletedTasks = useMemo(() => {
    return schedulerStats && schedulerStats.completed > 0
  }, [schedulerStats])

  // Load mergeable branches when component mounts or session changes
  useEffect(() => {
    const loadBranches = async () => {
      if (!sessionId || !repoPath) return
      setLoadingBranches(true)
      try {
        const branches = await getMergeableBranches(sessionId, repoPath)
        setMergeableBranches(branches)
      } catch (err) {
        console.error('Failed to load mergeable branches:', err)
      } finally {
        setLoadingBranches(false)
      }
    }

    loadBranches()
  }, [sessionId, repoPath, schedulerStats?.completed])

  const handleMerge = async () => {
    setMerging(true)
    setError(null)
    setResult(null)

    try {
      const mergeResult = await autoMergeCompletedBranches(sessionId, repoPath, config)
      setResult(mergeResult)

      // Refresh mergeable branches after merge
      const branches = await getMergeableBranches(sessionId, repoPath)
      setMergeableBranches(branches)

      onMergeComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge branches')
    } finally {
      setMerging(false)
    }
  }

  const handleRefreshBranches = async () => {
    setLoadingBranches(true)
    try {
      const branches = await getMergeableBranches(sessionId, repoPath)
      setMergeableBranches(branches)
    } catch (err) {
      console.error('Failed to refresh branches:', err)
    } finally {
      setLoadingBranches(false)
    }
  }

  const getResultIcon = (branchResult: MergeBranchResult) => {
    if (branchResult.success) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    }
    if (branchResult.conflictFiles && branchResult.conflictFiles.length > 0) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    }
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  // Generate git commands for manual merge
  const generateMergeCommands = useMemo(() => {
    if (mergeableBranches.length === 0) return ''

    const commands = [
      `# Manual merge commands for ${mergeableBranches.length} branch(es)`,
      `cd "${repoPath}"`,
      '',
      '# Ensure clean working directory',
      'git stash',
      '',
      `# Checkout target branch`,
      `git checkout ${config.targetBranch}`,
      '',
      '# Merge each completed branch',
      ...mergeableBranches.flatMap((branch) => [
        `git merge ${branch.branch} --no-edit  # Task: ${branch.taskId}`,
      ]),
      '',
      '# Cleanup merged branches (optional)',
      ...mergeableBranches.map((branch) => `git branch -d ${branch.branch}`),
      '',
      '# Push changes (if desired)',
      `# git push origin ${config.targetBranch}`,
    ]

    return commands.join('\n')
  }, [mergeableBranches, repoPath, config.targetBranch])

  const handleCopyAllCommands = () => {
    navigator.clipboard.writeText(generateMergeCommands)
    setCopiedCommand('all')
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            <CardTitle>Auto-Merge</CardTitle>
            {config.useAiConflictResolution && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Conflict Resolution
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="h-8"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Merge completed task branches back to {config.targetBranch}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Section */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Ready to merge: </span>
              <span className="font-medium">{mergeableBranches.length} branches</span>
            </div>
            {schedulerStats && (
              <div className="text-sm">
                <span className="text-muted-foreground">Tasks: </span>
                <span className="font-medium text-green-600">{schedulerStats.completed} completed</span>
                {schedulerStats.failed > 0 && (
                  <span className="font-medium text-red-600 ml-1">
                    / {schedulerStats.failed} failed
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshBranches}
            disabled={loadingBranches}
            className="h-8"
          >
            <RefreshCw className={`h-4 w-4 ${loadingBranches ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Configuration Panel */}
        <Collapsible open={showConfig} onOpenChange={setShowConfig}>
          <CollapsibleContent>
            <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
              <h4 className="font-medium text-sm">Merge Configuration</h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="target-branch" className="text-sm">
                    Target Branch
                  </Label>
                  <Input
                    id="target-branch"
                    value={config.targetBranch}
                    onChange={(e) =>
                      setConfig({ ...config, targetBranch: e.target.value })
                    }
                    placeholder="main"
                    className="h-8"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-resolution" className="text-sm">
                    AI Conflict Resolution
                  </Label>
                  <Switch
                    id="ai-resolution"
                    checked={config.useAiConflictResolution}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, useAiConflictResolution: checked })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use AI to automatically resolve merge conflicts when detected
                </p>

                <div className="flex items-center justify-between">
                  <Label htmlFor="delete-branches" className="text-sm">
                    Delete branches after merge
                  </Label>
                  <Switch
                    id="delete-branches"
                    checked={config.deleteBranches}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, deleteBranches: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="cleanup-worktrees" className="text-sm">
                    Cleanup worktrees after merge
                  </Label>
                  <Switch
                    id="cleanup-worktrees"
                    checked={config.cleanupWorktrees}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, cleanupWorktrees: checked })
                    }
                  />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Merge Results */}
        {result && (
          <Collapsible open={showResults} onOpenChange={setShowResults}>
            <div className="border rounded-lg overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-sm">Merge Results</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {result.merged} merged
                      </Badge>
                      {result.failed > 0 && (
                        <Badge variant="secondary" className="bg-red-100 text-red-700">
                          {result.failed} failed
                        </Badge>
                      )}
                      {result.skipped > 0 && (
                        <Badge variant="secondary">
                          {result.skipped} skipped
                        </Badge>
                      )}
                    </div>
                  </div>
                  {showResults ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                  {result.results.map((branchResult, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {getResultIcon(branchResult)}
                        <span className="font-mono text-xs">{branchResult.branch}</span>
                      </div>
                      <span
                        className={`text-xs ${
                          branchResult.success
                            ? 'text-green-600'
                            : branchResult.conflictFiles
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {branchResult.message}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}

        {/* Merge Button */}
        <Button
          onClick={handleMerge}
          disabled={merging || mergeableBranches.length === 0}
          className="w-full"
          size="lg"
        >
          {merging ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Merging {mergeableBranches.length} branches...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Merge {mergeableBranches.length} Completed Branches
            </>
          )}
        </Button>

        {/* Manual Fallback - Git Commands */}
        {mergeableBranches.length > 0 && (
          <Collapsible open={showManualCommands} onOpenChange={setShowManualCommands}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Manual Commands (Terminal)
                </span>
                {showManualCommands ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">
                    Copy and paste these commands in your terminal
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-gray-400 hover:text-white hover:bg-gray-800"
                    onClick={handleCopyAllCommands}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {copiedCommand === 'all' ? 'Copied!' : 'Copy All'}
                  </Button>
                </div>
                <pre className="text-xs text-gray-100 font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {generateMergeCommands}
                </pre>
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-xs text-gray-400">
                    Use this if auto-merge fails or you prefer to review changes manually.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Hint for when to use */}
        {!allTasksFinished && hasCompletedTasks && (
          <p className="text-xs text-muted-foreground text-center">
            You can merge completed branches now, or wait for all tasks to finish.
          </p>
        )}
        {allTasksFinished && mergeableBranches.length > 0 && (
          <p className="text-xs text-green-600 text-center">
            All tasks finished! Click above to merge all branches to {config.targetBranch}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
