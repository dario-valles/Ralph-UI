/**
 * Research Progress Modal Component
 *
 * Modal wrapper for the ResearchProgress component that can be triggered
 * from the PhaseActionBar within the chat interface.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ResearchProgress } from './ResearchProgress'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { gsdApi } from '@/lib/backend-api'
import type { ResearchStatus, ResearchSynthesis, ResearchResult } from '@/types/gsd'
import { X, CheckCircle2 } from 'lucide-react'

interface ResearchProgressModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Project path */
  projectPath: string
  /** Session ID */
  sessionId: string
  /** Callback when research completes and user wants to add summary to chat */
  onComplete?: (synthesis: ResearchSynthesis, results: ResearchResult[]) => void
  /** Optional context from chat conversation */
  conversationContext?: string
}

const INITIAL_RESEARCH_STATUS: ResearchStatus = {
  architecture: { running: false, complete: false },
  codebase: { running: false, complete: false },
  bestPractices: { running: false, complete: false },
  risks: { running: false, complete: false },
}

export function ResearchProgressModal({
  open,
  onOpenChange,
  projectPath,
  sessionId,
  onComplete,
  conversationContext = '',
}: ResearchProgressModalProps) {
  // Local state for research
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>(INITIAL_RESEARCH_STATUS)
  const [researchResults, setResearchResults] = useState<ResearchResult[]>([])
  const [synthesis, setSynthesis] = useState<ResearchSynthesis | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get agent selection and research status checker from store
  const { selectedResearchAgent, checkResearchStatus } = usePRDChatStore()

  // Check research status when modal opens (to reconnect to running research)
  useEffect(() => {
    if (open) {
      // First check if research is already running
      checkResearchStatus().then(() => {
        const { researchStatus: currentStatus, isResearchRunning: currentlyRunning } =
          usePRDChatStore.getState()

        if (currentlyRunning) {
          // Research is running - sync state from store
          setResearchStatus(currentStatus)
          setIsRunning(true)
          setError(null)
        } else {
          // No research running - reset to initial state
          setResearchStatus(INITIAL_RESEARCH_STATUS)
          setResearchResults([])
          setSynthesis(null)
          setError(null)
        }
      })
    }
  }, [open, checkResearchStatus])

  // Start research
  const handleStartResearch = useCallback(
    async (context: string, agentType?: string, model?: string) => {
      if (!projectPath || !sessionId) return

      setIsRunning(true)
      setError(null)

      // Mark all as running (local state + store)
      const runningStatus = {
        architecture: { running: true, complete: false },
        codebase: { running: true, complete: false },
        bestPractices: { running: true, complete: false },
        risks: { running: true, complete: false },
      }
      setResearchStatus(runningStatus)
      usePRDChatStore.setState({ isResearchRunning: true, researchStatus: runningStatus })

      try {
        const status = await gsdApi.startResearch(
          projectPath,
          sessionId,
          context || conversationContext,
          agentType || selectedResearchAgent || undefined,
          model
        )
        setResearchStatus(status)
        usePRDChatStore.setState({ researchStatus: status })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start research')
        setResearchStatus(INITIAL_RESEARCH_STATUS)
        usePRDChatStore.setState({ researchStatus: INITIAL_RESEARCH_STATUS })
      } finally {
        setIsRunning(false)
        usePRDChatStore.setState({ isResearchRunning: false })
      }
    },
    [projectPath, sessionId, conversationContext, selectedResearchAgent]
  )

  // Synthesize research results
  const handleSynthesize = useCallback(async () => {
    if (!projectPath || !sessionId) return

    setIsSynthesizing(true)
    setError(null)

    try {
      const result = await gsdApi.synthesizeResearch(projectPath, sessionId)
      setSynthesis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to synthesize research')
    } finally {
      setIsSynthesizing(false)
    }
  }, [projectPath, sessionId])

  // Handle completion - add to chat
  const handleAddToChat = useCallback(() => {
    if (synthesis) {
      onComplete?.(synthesis, researchResults)
      onOpenChange(false)
    }
  }, [synthesis, researchResults, onComplete, onOpenChange])

  // Handle close without adding
  function handleClose(): void {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Parallel Research</DialogTitle>
              <DialogDescription>
                Four AI agents are analyzing your project from different angles
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

        {/* Error display */}
        {error && (
          <div className="mx-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Research progress content */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <ResearchProgress
            status={researchStatus}
            results={researchResults}
            synthesis={synthesis}
            onStartResearch={handleStartResearch}
            onSynthesize={handleSynthesize}
            onProceed={handleAddToChat}
            isRunning={isRunning}
            isSynthesizing={isSynthesizing}
            questioningContext={conversationContext}
            sessionId={sessionId}
          />
        </div>

        {/* Footer actions */}
        {synthesis && (
          <div className="flex-shrink-0 flex items-center justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            <Button onClick={handleAddToChat} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Add Summary to Chat
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
