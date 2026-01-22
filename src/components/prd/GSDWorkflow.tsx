/**
 * GSD Workflow Component
 *
 * Main orchestrator component for the GSD PRD generation workflow.
 * Manages phase transitions and renders the appropriate UI for each phase.
 */

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GSDStepper } from './gsd/GSDStepper'
import { DeepQuestioning } from './DeepQuestioning'
import { ResearchProgress } from './ResearchProgress'
import { RequirementScoper } from './RequirementScoper'
import { RoadmapEditor } from './RoadmapEditor'
import { VerificationResults } from './VerificationResults'
import { useGsdStore } from '@/stores/gsdStore'
import { gsdApi } from '@/lib/tauri-api'
import type { GsdPhase, ResearchSynthesis } from '@/types/gsd'
import { getNextPhase, getPreviousPhase } from '@/types/gsd'
import type { RoadmapDoc, VerificationHistorySummary } from '@/types/planning'
import { Rocket, FileText, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

interface GSDWorkflowProps {
  /** Project path */
  projectPath: string
  /** Chat session ID */
  sessionId: string
  /** Callback when workflow is complete */
  onComplete?: (prdName: string) => void
  /** Callback to go back to chat */
  onBack?: () => void
}

/**
 * Export dialog for final step
 */
interface ExportDialogState {
  isOpen: boolean
  prdName: string
  branch: string
  includeV2: boolean
}

export function GSDWorkflow({
  projectPath,
  sessionId,
  onComplete,
  onBack,
}: GSDWorkflowProps) {
  // Global store state
  const {
    workflowState,
    isLoading,
    error,
    requirementsDoc,
    roadmapDoc,
    verificationResult,
    researchResults,
    setError,
    setLoading,
    setPhase,
    loadGsdState,
    startGsdSession,
    setWorkflowState,
    setRequirementsDoc,
    setRoadmapDoc,
    setVerificationResult,
  } = useGsdStore()

  // Local UI state (not persisted)
  const [synthesis, setSynthesis] = useState<ResearchSynthesis | null>(null)
  const [isResearchRunning, setIsResearchRunning] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [verificationIteration, setVerificationIteration] = useState<{
    iteration: number
    issuesFixed: string[]
    newIssues: string[]
    summary: VerificationHistorySummary
  } | null>(null)
  const [exportState, setExportState] = useState<ExportDialogState>({
    isOpen: false,
    prdName: '',
    branch: 'main',
    includeV2: false,
  })

  // Use store state directly
  const state = workflowState
  const requirements = requirementsDoc
  const roadmap = roadmapDoc
  const verification = verificationResult

  // Initialize or load workflow state
  useEffect(() => {
    const loadOrInitState = async () => {
      if (!projectPath || !sessionId) return

      try {
        // Try to load existing state
        const existing = await loadGsdState(projectPath, sessionId)
        if (!existing) {
          // Start new session if none exists
          await startGsdSession(projectPath, sessionId)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize GSD workflow')
      }
    }

    loadOrInitState()
  }, [projectPath, sessionId, loadGsdState, startGsdSession, setError])

  // Phase navigation
  const handlePhaseChange = useCallback(async (phase: GsdPhase) => {
    if (!projectPath || !sessionId) return

    setLoading(true)
    try {
      await gsdApi.updatePhase(projectPath, sessionId, phase)
      setPhase(phase)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update phase')
    } finally {
      setLoading(false)
    }
  }, [projectPath, sessionId, setLoading, setError, setPhase])

  const handleNext = useCallback(async () => {
    if (!state || !projectPath || !sessionId) return

    const nextPhase = getNextPhase(state.currentPhase)
    if (!nextPhase) return

    // Generate PROJECT.md when moving from questioning to project document phase
    if (state.currentPhase === 'deep_questioning' && nextPhase === 'project_document') {
      setLoading(true)
      try {
        await gsdApi.generateProjectDocument(projectPath, sessionId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate PROJECT.md')
        setLoading(false)
        return
      }
      setLoading(false)
    }

    // Generate requirements from research when moving to requirements phase
    if (state.currentPhase === 'research' && nextPhase === 'requirements') {
      setLoading(true)
      try {
        const reqs = await gsdApi.generateRequirementsFromResearch(projectPath, sessionId)
        setRequirementsDoc(reqs)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate requirements')
        setLoading(false)
        return
      }
      setLoading(false)
    }

    await handlePhaseChange(nextPhase)
  }, [state, projectPath, sessionId, handlePhaseChange, setLoading, setError, setRequirementsDoc])

  const handleBack = useCallback(async () => {
    if (!state) return

    const prevPhase = getPreviousPhase(state.currentPhase)
    if (prevPhase) {
      await handlePhaseChange(prevPhase)
    }
  }, [state, handlePhaseChange])

  // Research handlers
  const handleStartResearch = useCallback(async (context: string, agentType?: string) => {
    if (!projectPath || !sessionId) return

    setIsResearchRunning(true)
    try {
      await gsdApi.startResearch(projectPath, sessionId, context, agentType)
      // Research status will be updated via polling or events
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start research')
    } finally {
      setIsResearchRunning(false)
    }
  }, [projectPath, sessionId, setError])

  const handleSynthesizeResearch = useCallback(async () => {
    if (!projectPath || !sessionId) return

    setIsSynthesizing(true)
    try {
      const result = await gsdApi.synthesizeResearch(projectPath, sessionId)
      setSynthesis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to synthesize research')
    } finally {
      setIsSynthesizing(false)
    }
  }, [projectPath, sessionId, setError])

  // Requirements handlers
  const handleApplyScope = useCallback(async (selection: import('@/types/planning').ScopeSelection) => {
    if (!projectPath || !sessionId) return

    setLoading(true)
    try {
      const updated = await gsdApi.scopeRequirements(projectPath, sessionId, selection)
      setRequirementsDoc(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply scope')
    } finally {
      setLoading(false)
    }
  }, [projectPath, sessionId, setLoading, setError, setRequirementsDoc])

  const handleAddRequirement = useCallback(async (
    category: import('@/types/planning').RequirementCategory,
    title: string,
    description: string
  ) => {
    if (!projectPath || !sessionId) {
      throw new Error('Project path and session ID required')
    }

    const newReq = await gsdApi.addRequirement(projectPath, sessionId, category, title, description)
    // Update requirements state in store
    if (requirementsDoc) {
      setRequirementsDoc({
        ...requirementsDoc,
        requirements: { ...requirementsDoc.requirements, [newReq.id]: newReq }
      })
    }
    return newReq
  }, [projectPath, sessionId, requirementsDoc, setRequirementsDoc])

  // Roadmap handlers
  const handleUpdateRoadmap = useCallback(async (updated: RoadmapDoc) => {
    if (!projectPath || !sessionId) return

    setLoading(true)
    try {
      // Save the updated roadmap
      await gsdApi.savePlanningFile(
        projectPath,
        sessionId,
        'roadmap',
        JSON.stringify(updated, null, 2)
      )
      setRoadmapDoc(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roadmap')
    } finally {
      setLoading(false)
    }
  }, [projectPath, sessionId, setLoading, setError, setRoadmapDoc])

  // Verification handlers
  const handleRunVerification = useCallback(async () => {
    if (!projectPath || !sessionId) return

    setLoading(true)
    try {
      const iterResult = await gsdApi.verifyPlans(projectPath, sessionId)
      setVerificationResult(iterResult.result)
      setVerificationIteration({
        iteration: iterResult.iteration,
        issuesFixed: iterResult.issuesFixed,
        newIssues: iterResult.newIssues,
        summary: iterResult.summary,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run verification')
    } finally {
      setLoading(false)
    }
  }, [projectPath, sessionId, setLoading, setError, setVerificationResult])

  // Export handler
  const handleExport = useCallback(async () => {
    if (!projectPath || !sessionId || !exportState.prdName) return

    setLoading(true)
    try {
      await gsdApi.exportToRalph(
        projectPath,
        sessionId,
        exportState.prdName,
        exportState.branch,
        exportState.includeV2
      )
      onComplete?.(exportState.prdName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export to Ralph')
    } finally {
      setLoading(false)
    }
  }, [projectPath, sessionId, exportState, setLoading, setError, onComplete])

  // Render loading state
  if (isLoading && !state) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading workflow...</span>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <Card className="m-4 border-red-200">
        <CardContent className="pt-6">
          <div className="text-red-600">{error}</div>
          <Button variant="outline" onClick={() => setError(null)} className="mt-4">
            Dismiss
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Render null state
  if (!state) {
    return null
  }

  // Render current phase content
  const renderPhaseContent = () => {
    switch (state.currentPhase) {
      case 'deep_questioning':
        return (
          <DeepQuestioning
            context={state.questioningContext}
            onContextUpdate={async (updates) => {
              if (!projectPath || !sessionId || !state) return
              const newContext = { ...state.questioningContext, ...updates }
              await gsdApi.updateQuestioningContext(projectPath, sessionId, newContext)
              setWorkflowState({ ...state, questioningContext: newContext })
            }}
            onProceed={handleNext}
            isLoading={isLoading}
          />
        )

      case 'project_document':
        return (
          <Card className="m-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Create PROJECT.md</CardTitle>
              </div>
              <CardDescription>
                Based on your context, create a project document capturing your vision.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Use the chat to refine your PROJECT.md document. When ready, proceed to research.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext}>
                  Continue to Research
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'research':
        return (
          <ResearchProgress
            status={state.researchStatus}
            results={researchResults}
            synthesis={synthesis}
            onStartResearch={handleStartResearch}
            onSynthesize={handleSynthesizeResearch}
            onProceed={handleNext}
            isRunning={isResearchRunning}
            isSynthesizing={isSynthesizing}
            questioningContext={JSON.stringify(state.questioningContext)}
            isLoading={isLoading}
          />
        )

      case 'requirements':
      case 'scoping':
        if (requirements) {
          return (
            <RequirementScoper
              requirements={requirements}
              onApplyScope={handleApplyScope}
              onAddRequirement={handleAddRequirement}
              onProceed={handleNext}
              isLoading={isLoading}
            />
          )
        }
        return (
          <Card className="m-4">
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                No requirements document found. Please complete the research phase first.
              </p>
              <Button variant="outline" onClick={handleBack} className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Research
              </Button>
            </CardContent>
          </Card>
        )

      case 'roadmap':
        if (roadmap) {
          return (
            <RoadmapEditor
              roadmap={roadmap}
              onUpdate={handleUpdateRoadmap}
              onProceed={handleNext}
              isLoading={isLoading}
            />
          )
        }
        return (
          <Card className="m-4">
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                Generating roadmap from requirements...
              </p>
              <Loader2 className="h-6 w-6 animate-spin mt-4" />
            </CardContent>
          </Card>
        )

      case 'verification':
        if (verification) {
          return (
            <VerificationResults
              result={verification}
              iteration={verificationIteration?.iteration}
              issuesFixed={verificationIteration?.issuesFixed}
              newIssues={verificationIteration?.newIssues}
              historySummary={verificationIteration?.summary}
              onRerun={handleRunVerification}
              onProceed={handleNext}
              isLoading={isLoading}
            />
          )
        }
        return (
          <Card className="m-4">
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">
                Ready to verify your plans for completeness.
              </p>
              <Button onClick={handleRunVerification} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Run Verification
              </Button>
            </CardContent>
          </Card>
        )

      case 'export':
        return (
          <Card className="m-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                <CardTitle>Export to Ralph</CardTitle>
              </div>
              <CardDescription>
                Convert your planning documents to Ralph PRD format for execution.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">PRD Name</label>
                <input
                  type="text"
                  value={exportState.prdName}
                  onChange={(e) => setExportState((s) => ({ ...s, prdName: e.target.value }))}
                  placeholder="my-feature"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Branch</label>
                <input
                  type="text"
                  value={exportState.branch}
                  onChange={(e) => setExportState((s) => ({ ...s, branch: e.target.value }))}
                  placeholder="main"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includeV2"
                  checked={exportState.includeV2}
                  onChange={(e) => setExportState((s) => ({ ...s, includeV2: e.target.checked }))}
                />
                <label htmlFor="includeV2" className="text-sm">
                  Include V2 requirements (as lower priority)
                </label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={!exportState.prdName || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4 mr-2" />
                  )}
                  Export PRD
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with stepper */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">GSD Workflow</h2>
          </div>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Chat
            </Button>
          )}
        </div>
        <GSDStepper
          currentPhase={state.currentPhase}
          onPhaseClick={handlePhaseChange}
          completedPhases={[]}
        />
      </div>

      {/* Phase content */}
      <div className="flex-1 overflow-auto">
        {renderPhaseContent()}
      </div>
    </div>
  )
}
