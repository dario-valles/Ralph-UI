import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  GitMerge,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bot,
} from 'lucide-react'
import {
  gitApi,
  ConflictInfo,
  MergeResolutionResult,
  ConflictResolverAgent,
} from '@/lib/git-api'

interface ConflictResolutionDialogProps {
  repoPath: string
  conflicts: ConflictInfo[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (result: MergeResolutionResult) => void
  onCancel?: () => void
}

export function ConflictResolutionDialog({
  repoPath,
  conflicts,
  open,
  onOpenChange,
  onSuccess,
  onCancel,
}: ConflictResolutionDialogProps): React.JSX.Element {
  const [resolving, setResolving] = useState(false)
  const [agentType, setAgentType] = useState<ConflictResolverAgent>('claude')
  const [result, setResult] = useState<MergeResolutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const handleResolve = async () => {
    setResolving(true)
    setError(null)
    setResult(null)
    setProgress(0)

    try {
      // Start progress animation
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          // Slow down as we approach 90%
          const increment = Math.max(1, (90 - prev) / 10)
          return Math.min(90, prev + increment)
        })
      }, 500)

      const resolutionResult = await gitApi.resolveConflictsWithAI(
        repoPath,
        agentType,
        undefined, // model - use default
        120 // timeout per conflict in seconds
      )

      clearInterval(progressInterval)
      setProgress(100)
      setResult(resolutionResult)

      if (resolutionResult.failedCount === 0) {
        // All conflicts resolved successfully
        setTimeout(() => {
          onSuccess?.(resolutionResult)
        }, 1500) // Brief delay to show success state
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress(0)
    } finally {
      setResolving(false)
    }
  }

  const handleAbort = async () => {
    try {
      await gitApi.mergeAbort(repoPath)
      onCancel?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleClose = () => {
    if (!resolving) {
      setResult(null)
      setError(null)
      setProgress(0)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Resolve Merge Conflicts with AI
          </DialogTitle>
          <DialogDescription>
            {conflicts.length} file{conflicts.length !== 1 ? 's' : ''} have
            merge conflicts. Use AI to automatically resolve them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Conflict Files List */}
          <div className="space-y-2">
            <Label>Conflicted Files</Label>
            <div className="max-h-40 overflow-y-auto rounded border bg-muted/50 p-2">
              {conflicts.map((conflict, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 py-1 text-sm"
                >
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                  <code className="text-xs">{conflict.path}</code>
                  {result?.resolutions[index]?.success === true && (
                    <CheckCircle2 className="ml-auto h-4 w-4 text-green-500" />
                  )}
                  {result?.resolutions[index]?.success === false && (
                    <XCircle className="ml-auto h-4 w-4 text-red-500" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Agent Selection */}
          {!result && (
            <div className="space-y-2">
              <Label htmlFor="agent-type">AI Agent</Label>
              <Select
                id="agent-type"
                value={agentType}
                onChange={(e) =>
                  setAgentType(e.target.value as ConflictResolverAgent)
                }
                disabled={resolving}
              >
                <option value="claude">Claude Code</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor Agent</option>
                <option value="codex">Codex CLI</option>
                <option value="qwen">Qwen</option>
                <option value="droid">Droid</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the AI agent to use for conflict resolution. Ensure the
                agent CLI is installed.
              </p>
            </div>
          )}

          {/* Progress */}
          {resolving && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 animate-pulse text-blue-500" />
                <span className="text-sm">Resolving conflicts...</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                AI is analyzing and resolving each conflict. This may take a few
                minutes.
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-2 rounded border p-3">
              <div className="flex items-center gap-2">
                {result.failedCount === 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-green-700">
                      All conflicts resolved!
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <span className="font-medium text-yellow-700">
                      {result.resolvedCount} of {result.resolutions.length}{' '}
                      resolved
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Completed in {result.totalDurationSecs.toFixed(1)}s
              </p>
              {result.failedCount > 0 && (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs">Failed files:</Label>
                  {result.resolutions
                    .filter((r) => !r.success)
                    .map((r, i) => (
                      <div key={i} className="text-xs text-red-600">
                        {r.path}: {r.error}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-700">Error</span>
              </div>
              <p className="mt-1 text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {!result && (
            <>
              <Button
                variant="outline"
                onClick={handleAbort}
                disabled={resolving}
              >
                Abort Merge
              </Button>
              <Button onClick={handleResolve} disabled={resolving}>
                {resolving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <Bot className="mr-2 h-4 w-4" />
                    Resolve with AI
                  </>
                )}
              </Button>
            </>
          )}
          {result && (
            <>
              {result.failedCount > 0 && (
                <Button variant="outline" onClick={handleAbort}>
                  Abort Merge
                </Button>
              )}
              <Button
                onClick={() => {
                  onSuccess?.(result)
                  handleClose()
                }}
                disabled={result.failedCount > 0}
              >
                {result.failedCount === 0 ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete Merge
                  </>
                ) : (
                  'Resolve Remaining Manually'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
