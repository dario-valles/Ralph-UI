import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles } from 'lucide-react'
import { ConflictResolutionDialog } from '@/components/git/ConflictResolutionDialog'
import type { DiffInfo, ConflictInfo } from '@/lib/api/git-api'

export interface ExecutionDialogsProps {
  // Regenerate dialog
  regenerateConfirmOpen: boolean
  setRegenerateConfirmOpen: (open: boolean) => void
  onRegenerateStories: () => void

  // Diff dialog
  diffDialogOpen: boolean
  setDiffDialogOpen: (open: boolean) => void
  diffInfo: DiffInfo | null

  // Conflict dialog
  conflictDialogOpen: boolean
  setConflictDialogOpen: (open: boolean) => void
  conflicts: ConflictInfo[]
  setConflicts: React.Dispatch<React.SetStateAction<ConflictInfo[]>>
  projectPath: string
  onMergeComplete: () => void
}

export function ExecutionDialogs({
  regenerateConfirmOpen,
  setRegenerateConfirmOpen,
  onRegenerateStories,
  diffDialogOpen,
  setDiffDialogOpen,
  diffInfo,
  conflictDialogOpen,
  setConflictDialogOpen,
  conflicts,
  setConflicts,
  projectPath,
  onMergeComplete,
}: ExecutionDialogsProps): React.JSX.Element {
  return (
    <>
      {/* Regenerate Stories Confirm Dialog */}
      <Dialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Regenerate Stories
            </DialogTitle>
            <DialogDescription>
              This will use AI to re-extract user stories from the PRD markdown. Any manual changes
              to stories will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRegenerateConfirmOpen(false)}
              className="min-h-11 sm:min-h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setRegenerateConfirmOpen(false)
                onRegenerateStories()
              }}
              className="min-h-11 sm:min-h-9"
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff Dialog - Bottom sheet on mobile */}
      <ResponsiveModal
        open={diffDialogOpen}
        onOpenChange={setDiffDialogOpen}
        title="Changes in Worktree"
        description="Comparing worktree branch to main branch"
        size="3xl"
        fullPageOnMobile={false}
        drawerHeight="max-h-[80vh]"
      >
        {diffInfo && (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
              <span className="font-medium">
                {diffInfo.files_changed} file{diffInfo.files_changed !== 1 ? 's' : ''} changed
              </span>
              <span className="text-green-600 dark:text-green-400">
                +{diffInfo.insertions} insertions
              </span>
              <span className="text-red-600 dark:text-red-400">-{diffInfo.deletions} deletions</span>
            </div>

            {/* File List */}
            <ScrollArea className="max-h-[300px] sm:max-h-[400px]">
              <div className="space-y-2 pr-4">
                {diffInfo.files.map((file, index) => (
                  <div
                    key={index}
                    className="p-2 rounded border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                          file.status === 'added'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : file.status === 'deleted'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                        }`}
                      >
                        {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                      </span>
                      <span className="font-mono text-sm truncate">
                        {file.new_path || file.old_path}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-shrink-0 pl-6 sm:pl-0">
                      {file.insertions > 0 && (
                        <span className="text-green-600 dark:text-green-400">
                          +{file.insertions}
                        </span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {diffInfo.files.length === 0 && (
              <div className="text-center text-muted-foreground py-8">No changes detected</div>
            )}
          </div>
        )}
      </ResponsiveModal>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        repoPath={projectPath}
        conflicts={conflicts}
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        onSuccess={onMergeComplete}
        onCancel={() => {
          setConflictDialogOpen(false)
          setConflicts([])
        }}
      />
    </>
  )
}
