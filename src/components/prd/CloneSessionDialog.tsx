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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Copy, FileText, Search, ListChecks } from 'lucide-react'
import { gsdApi } from '@/lib/api/gsd-api'
import { toast } from '@/stores/toastStore'
import type { PlanningSessionInfo, GsdWorkflowState } from '@/types/gsd'

interface CloneSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: PlanningSessionInfo | null
  projectPath: string
  /** Called when clone completes successfully with the new session */
  onCloneComplete: (newState: GsdWorkflowState) => void
}

export function CloneSessionDialog({
  open,
  onOpenChange,
  session,
  projectPath,
  onCloneComplete,
}: CloneSessionDialogProps) {
  const [copyContext, setCopyContext] = useState(true)
  const [copyResearch, setCopyResearch] = useState(true)
  const [copyRequirements, setCopyRequirements] = useState(false)
  const [isCloning, setIsCloning] = useState(false)

  const handleClone = async () => {
    if (!session) return

    setIsCloning(true)
    try {
      const newState = await gsdApi.cloneSession(projectPath, session.sessionId, {
        copyContext,
        copyResearch,
        copyRequirements,
      })

      toast.success('Session Cloned', 'New planning session created from the selected session')
      onCloneComplete(newState)
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to clone session:', err)
      toast.error('Clone Failed', err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsCloning(false)
    }
  }

  // Reset state when dialog opens with a new session
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setCopyContext(true)
      setCopyResearch(true)
      setCopyRequirements(false)
    }
    onOpenChange(newOpen)
  }

  const getPhaseDisplay = (phase?: string) => {
    if (!phase) return 'Unknown'
    return phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clone Session
          </DialogTitle>
          <DialogDescription>
            Create a new planning session by copying data from an existing one.
          </DialogDescription>
        </DialogHeader>

        {session && (
          <div className="space-y-4 py-4">
            {/* Source session info */}
            <div className="p-3 rounded-md bg-muted/50 border border-border/30">
              <p className="text-sm font-medium">Source Session</p>
              <p className="text-xs text-muted-foreground mt-1">
                Phase: {getPhaseDisplay(session.phase)}
              </p>
              {session.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(session.updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Copy options */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">What to copy:</Label>

              <label className="flex items-start gap-3 p-3 rounded-md border border-border/30 cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={copyContext}
                  onCheckedChange={(checked) => setCopyContext(checked as boolean)}
                  disabled={isCloning}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Project Context</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    What/Why/Who/Done answers and PROJECT.md
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-md border border-border/30 cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={copyResearch}
                  onCheckedChange={(checked) => setCopyResearch(checked as boolean)}
                  disabled={isCloning}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Research Outputs</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Architecture, Codebase, Best Practices, and Risks analysis
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-md border border-border/30 cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={copyRequirements}
                  onCheckedChange={(checked) => setCopyRequirements(checked as boolean)}
                  disabled={isCloning}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Requirements</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generated requirements and scope selections
                  </p>
                </div>
              </label>
            </div>

            {/* Summary */}
            <p className="text-xs text-muted-foreground">
              The new session will start with the copied data. You can modify it without affecting
              the original session.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCloning}>
            Cancel
          </Button>
          <Button
            onClick={handleClone}
            disabled={!session || isCloning || (!copyContext && !copyResearch && !copyRequirements)}
          >
            {isCloning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Clone Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
