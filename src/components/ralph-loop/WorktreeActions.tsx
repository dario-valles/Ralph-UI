import { Button } from '@/components/ui/button'
import { GitBranch, FileDiff, GitMerge, Code2, Terminal, Loader2 } from 'lucide-react'

export interface WorktreeActionsProps {
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

export function WorktreeActions({
  worktreePath,
  effectiveWorktreePath,
  allPass,
  diffLoading,
  mergeLoading,
  onViewDiff,
  onMergeToMain,
  onOpenInEditor,
  onOpenTerminal,
}: WorktreeActionsProps): React.JSX.Element {
  return (
    <div className="mt-2 sm:mt-3 p-2 rounded-md border border-dashed border-green-500/50 bg-green-500/5">
      <div className="flex flex-col gap-2">
        {/* Worktree status */}
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-xs font-medium">
              {worktreePath ? 'Worktree Active' : 'Worktree Available'}
            </span>
            <p
              className="text-[9px] sm:text-[10px] text-muted-foreground font-mono truncate"
              title={effectiveWorktreePath}
            >
              {effectiveWorktreePath}
            </p>
          </div>
        </div>
        {/* Action buttons - grid layout on mobile */}
        <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1 sm:gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewDiff}
            disabled={diffLoading}
            title="View changes compared to main branch"
            className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
          >
            {diffLoading ? (
              <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin sm:mr-1.5" />
            ) : (
              <FileDiff className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
            )}
            <span className="hidden sm:inline">Diff</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onMergeToMain}
            disabled={mergeLoading || !allPass}
            title={
              allPass
                ? 'Merge worktree changes to main branch'
                : 'Complete all stories before merging'
            }
            className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
          >
            {mergeLoading ? (
              <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin sm:mr-1.5" />
            ) : (
              <GitMerge className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
            )}
            <span className="hidden sm:inline">Merge</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenInEditor}
            title="Open worktree in code editor"
            className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
          >
            <Code2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Editor</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenTerminal}
            title="Open terminal in worktree directory"
            className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
          >
            <Terminal className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Term</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
