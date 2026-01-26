/**
 * Requirements Scope Sheet/Modal Component
 *
 * Responsive wrapper for RequirementScoper that shows as a Sheet on mobile
 * and a Dialog on desktop. Can be triggered from chat interface.
 */

import { useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { RequirementScoper } from './RequirementScoper'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { RequirementsDoc, ScopeSelection, Requirement, RequirementCategory } from '@/types/planning'
import type { GeneratedRequirement, GenerateRequirementsResult } from '@/types/gsd'
import { X } from 'lucide-react'

interface RequirementsScopeSheetProps {
  /** Whether the sheet/modal is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Requirements document */
  requirements: RequirementsDoc | null
  /** Callback when scope selections are applied */
  onApplyScope: (selections: ScopeSelection) => Promise<void>
  /** Callback when a new requirement is added */
  onAddRequirement?: (
    category: RequirementCategory,
    title: string,
    description: string
  ) => Promise<Requirement | null>
  /** Callback when scoping is complete (optional: receives the scoped requirements) */
  onComplete?: (scopedRequirements?: RequirementsDoc) => void
  /** Whether the component is in loading state */
  isLoading?: boolean
  /** Callback to generate requirements from prompt */
  onGenerateRequirements?: (prompt: string, count?: number) => Promise<GenerateRequirementsResult>
  /** Callback when generated requirements are accepted */
  onAcceptGeneratedRequirements?: (requirements: GeneratedRequirement[]) => Promise<void>
  /** Whether AI generation is in progress */
  isGenerating?: boolean
}

export function RequirementsScopeSheet({
  open,
  onOpenChange,
  requirements,
  onApplyScope,
  onAddRequirement,
  onComplete,
  isLoading = false,
  onGenerateRequirements,
  onAcceptGeneratedRequirements,
  isGenerating = false,
}: RequirementsScopeSheetProps) {
  const isMobile = useIsMobile()
  const [localRequirements, setLocalRequirements] = useState<RequirementsDoc | null>(requirements)

  // Update local requirements when props change
  if (requirements && requirements !== localRequirements) {
    setLocalRequirements(requirements)
  }

  // Handle scope application and track local changes
  const handleApplyScope = useCallback(
    async (selections: ScopeSelection) => {
      await onApplyScope(selections)
      // Update local state optimistically
      if (localRequirements) {
        const updated = { ...localRequirements.requirements }
        selections.v1.forEach((id) => {
          if (updated[id]) updated[id] = { ...updated[id], scope: 'v1' }
        })
        selections.v2.forEach((id) => {
          if (updated[id]) updated[id] = { ...updated[id], scope: 'v2' }
        })
        selections.outOfScope.forEach((id) => {
          if (updated[id]) updated[id] = { ...updated[id], scope: 'out_of_scope' }
        })
        setLocalRequirements({ requirements: updated })
      }
    },
    [onApplyScope, localRequirements]
  )

  // Handle completion - close and notify
  const handleProceed = useCallback(() => {
    if (localRequirements) {
      onComplete?.(localRequirements)
    }
    onOpenChange(false)
  }, [localRequirements, onComplete, onOpenChange])

  // Handle close without completing
  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Content to render in both Sheet and Dialog
  const content = (
    <>
      {localRequirements ? (
        <div className="flex-1 overflow-y-auto -mx-6 px-2 sm:px-6">
          <RequirementScoper
            requirements={localRequirements}
            onApplyScope={handleApplyScope}
            onAddRequirement={onAddRequirement}
            onProceed={handleProceed}
            isLoading={isLoading}
            onGenerateRequirements={onGenerateRequirements}
            onAcceptGeneratedRequirements={onAcceptGeneratedRequirements}
            isGenerating={isGenerating}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          No requirements to scope. Generate requirements first.
        </div>
      )}
    </>
  )

  // Render Sheet on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-base">Scope Requirements</SheetTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag requirements to categorize V1, V2, or out-of-scope
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Scope Requirements</DialogTitle>
              <DialogDescription>
                Drag requirements between columns to categorize as V1, V2, or out-of-scope
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  )
}
