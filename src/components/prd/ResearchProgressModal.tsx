/**
 * Research Progress Modal Component
 *
 * Modal wrapper for the ResearchProgress component that can be triggered
 * from the PhaseActionBar within the chat interface.
 */

import { useState, useCallback, useEffect } from 'react'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ResearchProgress } from './ResearchProgress'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { gsdApi } from '@/lib/backend-api'
import type { ResearchStatus, ResearchSynthesis, ResearchResult, ResearchSessionInfo } from '@/types/gsd'
import { CheckCircle2, History, Loader2 } from 'lucide-react'
import { toast } from '@/stores/toastStore'

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

  // State for reusing previous research
  const [existingResearch, setExistingResearch] = useState<ResearchSessionInfo[]>([])
  const [showReusePrompt, setShowReusePrompt] = useState(false)
  const [isCopyingResearch, setIsCopyingResearch] = useState(false)

  // Get agent selection and research status checker from store
  const { selectedResearchAgent, checkResearchStatus } = usePRDChatStore()

  // Check research status when modal opens (to reconnect to running or completed research)
  useEffect(() => {
    if (!open || !projectPath || !sessionId) return

    const loadResearchState = async () => {
      try {
        // First check the store for running status
        await checkResearchStatus()
        const { researchStatus: currentStatus, isResearchRunning: currentlyRunning } =
          usePRDChatStore.getState()

        if (currentlyRunning) {
          // Research is running - sync state from store
          setResearchStatus(currentStatus)
          setIsRunning(true)
          setError(null)
          return
        }

        // Check if any agent has completed (not just running)
        const hasAnyCompleted =
          currentStatus.architecture.complete ||
          currentStatus.codebase.complete ||
          currentStatus.bestPractices.complete ||
          currentStatus.risks.complete

        if (hasAnyCompleted) {
          // Research has completed (or partially completed) - restore state
          setResearchStatus(currentStatus)
          setIsRunning(false)
          setError(null)

          // Load research results from backend
          try {
            const results = await gsdApi.getResearchResults(projectPath, sessionId)
            setResearchResults(results)
          } catch (err) {
            console.warn('Failed to load research results:', err)
          }

          // Check if synthesis exists by trying to get GSD state
          // (synthesis is generated separately and stored in SUMMARY.md)
          return
        }

        // No research started or completed - keep initial state
        setResearchStatus(INITIAL_RESEARCH_STATUS)
        setResearchResults([])
        setSynthesis(null)
        setError(null)
      } catch (err) {
        console.error('Failed to load research state:', err)
        setError('Failed to load research state')
      }
    }

    loadResearchState()
  }, [open, projectPath, sessionId, checkResearchStatus])

  // Check for existing research from other sessions when modal opens
  useEffect(() => {
    if (!open || !projectPath || !sessionId) return

    // Don't check if we already have research completed
    const hasResearch =
      researchStatus.architecture.complete ||
      researchStatus.codebase.complete ||
      researchStatus.bestPractices.complete ||
      researchStatus.risks.complete

    if (hasResearch) return

    const checkForExistingResearch = async () => {
      try {
        const sessions = await gsdApi.listProjectResearch(projectPath)
        // Filter out the current session and sessions without any research
        const otherSessions = sessions.filter(
          (s) =>
            s.sessionId !== sessionId &&
            (s.hasArchitecture || s.hasCodebase || s.hasBestPractices || s.hasRisks)
        )

        if (otherSessions.length > 0) {
          setExistingResearch(otherSessions)
          setShowReusePrompt(true)
        }
      } catch (err) {
        console.warn('Failed to check for existing research:', err)
      }
    }

    checkForExistingResearch()
  }, [open, projectPath, sessionId, researchStatus])

  // Handle reusing research from another session
  const handleReuseResearch = useCallback(
    async (sourceSession: ResearchSessionInfo) => {
      if (!projectPath || !sessionId) return

      setIsCopyingResearch(true)
      try {
        const copiedCount = await gsdApi.copyResearchToSession(
          projectPath,
          sourceSession.sessionId,
          sessionId
        )

        // Update local status to show which agents have completed research
        const newStatus: ResearchStatus = {
          architecture: {
            running: false,
            complete: sourceSession.hasArchitecture,
          },
          codebase: {
            running: false,
            complete: sourceSession.hasCodebase,
          },
          bestPractices: {
            running: false,
            complete: sourceSession.hasBestPractices,
          },
          risks: {
            running: false,
            complete: sourceSession.hasRisks,
          },
        }
        setResearchStatus(newStatus)
        usePRDChatStore.setState({ researchStatus: newStatus })

        // Load the copied research results
        const results = await gsdApi.getResearchResults(projectPath, sessionId)
        setResearchResults(results)

        setShowReusePrompt(false)
        toast.success(
          'Research Reused',
          `Copied ${copiedCount} research files from previous session`
        )
      } catch (err) {
        console.error('Failed to reuse research:', err)
        toast.error(
          'Reuse Failed',
          err instanceof Error ? err.message : 'Failed to copy research'
        )
      } finally {
        setIsCopyingResearch(false)
      }
    },
    [projectPath, sessionId]
  )

  // Start research (optionally for specific research types only)
  const handleStartResearch = useCallback(
    async (context: string, agentType?: string, model?: string, researchTypes?: string[]) => {
      if (!projectPath || !sessionId) return

      setIsRunning(true)
      setError(null)

      // Mark specified agents as running (or all if no specific types)
      const isRunningAll = !researchTypes || researchTypes.length === 0
      const shouldRun = (type: string) => isRunningAll || researchTypes?.includes(type)

      const runningStatus = {
        architecture: {
          running: shouldRun('architecture'),
          complete: !shouldRun('architecture') && researchStatus.architecture.complete,
          error: !shouldRun('architecture') ? researchStatus.architecture.error : undefined,
        },
        codebase: {
          running: shouldRun('codebase'),
          complete: !shouldRun('codebase') && researchStatus.codebase.complete,
          error: !shouldRun('codebase') ? researchStatus.codebase.error : undefined,
        },
        bestPractices: {
          running: shouldRun('bestPractices'),
          complete: !shouldRun('bestPractices') && researchStatus.bestPractices.complete,
          error: !shouldRun('bestPractices') ? researchStatus.bestPractices.error : undefined,
        },
        risks: {
          running: shouldRun('risks'),
          complete: !shouldRun('risks') && researchStatus.risks.complete,
          error: !shouldRun('risks') ? researchStatus.risks.error : undefined,
        },
      }
      setResearchStatus(runningStatus)
      usePRDChatStore.setState({ isResearchRunning: true, researchStatus: runningStatus })

      try {
        const status = await gsdApi.startResearch(
          projectPath,
          sessionId,
          context || conversationContext,
          agentType || selectedResearchAgent || undefined,
          model,
          researchTypes
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
    [projectPath, sessionId, conversationContext, selectedResearchAgent, researchStatus]
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

  // Footer content for when synthesis is complete
  const footerContent = synthesis ? (
    <>
      <Button variant="outline" onClick={handleClose}>
        Close
      </Button>
      <Button onClick={handleAddToChat} className="gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Add Summary to Chat
      </Button>
    </>
  ) : undefined

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Parallel Research"
      description="Four AI agents are analyzing your project from different angles"
      size="4xl"
      fullPageOnMobile={true}
      footer={footerContent}
    >
      {/* Error display */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-4">
          {error}
        </div>
      )}

      {/* Reuse previous research prompt */}
      {showReusePrompt && existingResearch.length > 0 && (
        <Alert className="border-blue-500/50 bg-blue-500/5 mb-4">
          <History className="h-4 w-4 text-blue-500" />
          <AlertDescription className="mt-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Found research from {existingResearch.length} previous session
                {existingResearch.length > 1 ? 's' : ''} in this project
              </p>
              <div className="space-y-2">
                {existingResearch.slice(0, 3).map((session) => (
                  <div
                    key={session.sessionId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-md bg-background/50 border border-border/30"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {session.createdAt
                          ? new Date(session.createdAt).toLocaleDateString()
                          : 'Unknown date'}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {session.hasArchitecture && (
                          <Badge variant="outline" className="text-xs">
                            Architecture
                          </Badge>
                        )}
                        {session.hasCodebase && (
                          <Badge variant="outline" className="text-xs">
                            Codebase
                          </Badge>
                        )}
                        {session.hasBestPractices && (
                          <Badge variant="outline" className="text-xs">
                            Best Practices
                          </Badge>
                        )}
                        {session.hasRisks && (
                          <Badge variant="outline" className="text-xs">
                            Risks
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReuseResearch(session)}
                      disabled={isCopyingResearch}
                      className="min-h-11 sm:min-h-9"
                    >
                      {isCopyingResearch ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Use This'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReusePrompt(false)}
                  disabled={isCopyingResearch}
                  className="min-h-11 sm:min-h-9"
                >
                  Start Fresh Instead
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Research progress content */}
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
    </ResponsiveModal>
  )
}
