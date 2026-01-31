import { Button } from '@/components/ui/button'
import { GitBranch, FileDiff, GitMerge, Code2, Terminal, Loader2 } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

export interface WorktreeActionsCompactProps {
  worktreePath: string | null
  effectiveWorktreePath: string
  allPass: boolean
  diffLoading: boolean
  mergeLoading: boolean
  onViewDiff: () => void
  onMergeToMain: () => void
  onOpenInEditor: () => void
  onOpenTerminal: () => void
}

export function WorktreeActionsCompact({
  worktreePath,
  effectiveWorktreePath,
  allPass,
  diffLoading,
  mergeLoading,
  onViewDiff,
  onMergeToMain,
  onOpenInEditor,
  onOpenTerminal,
}: WorktreeActionsCompactProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 mt-2 py-1.5 px-2 rounded bg-green-500/5 border border-green-500/20">
      {/* Worktree indicator */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <GitBranch className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
        <span
          className="text-[10px] font-mono text-muted-foreground truncate"
          title={effectiveWorktreePath}
        >
          {worktreePath ? 'Worktree' : 'Available'}:{' '}
          {effectiveWorktreePath.split('/').slice(-2).join('/')}
        </span>
      </div>

      {/* Action buttons - icon only with tooltips */}
      <div className="flex items-center gap-0.5">
        <Tooltip content="View diff" side="bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewDiff}
            disabled={diffLoading}
            className="h-6 w-6 p-0"
          >
            {diffLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDiff className="h-3.5 w-3.5" />
            )}
          </Button>
        </Tooltip>

        <Tooltip content={allPass ? 'Merge to main' : 'Complete all stories first'} side="bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMergeToMain}
            disabled={mergeLoading || !allPass}
            className="h-6 w-6 p-0"
          >
            {mergeLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitMerge className="h-3.5 w-3.5" />
            )}
          </Button>
        </Tooltip>

        <Tooltip content="Open in editor" side="bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenInEditor}
            className="h-6 w-6 p-0"
          >
            <Code2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>

        <Tooltip content="Open terminal" side="bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTerminal}
            className="h-6 w-6 p-0"
          >
            <Terminal className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}
