/**
 * Research Progress Component for GSD Workflow
 *
 * Displays the status of parallel research agents and allows
 * viewing research results as they complete. Supports real-time
 * streaming output from each agent.
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AgentModelSelector } from '@/components/shared/AgentModelSelector'
import { ResearchSummary } from './gsd/ResearchSummary'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useAgentModelSelector } from '@/hooks/useAgentModelSelector'
import { subscribeEvent } from '@/lib/events-client'
import type { ResearchStatus, ResearchResult, ResearchSynthesis } from '@/types/gsd'
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  Terminal,
  Lightbulb,
  Building,
  FolderCode,
  Sparkles,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Event payload for research output streaming */
interface ResearchOutputEvent {
  sessionId: string
  agentType: string
  chunk: string
  isComplete: boolean
}

/** Event payload for research status updates */
interface ResearchStatusEvent {
  sessionId: string
  agentType: string
  status: string
  error?: string
}

interface ResearchProgressProps {
  /** Current research status */
  status: ResearchStatus
  /** Research results (when available) */
  results: ResearchResult[]
  /** Research synthesis (when complete) */
  synthesis?: ResearchSynthesis | null
  /** Callback to start research (researchTypes param for retrying specific agents) */
  onStartResearch: (context: string, agentType?: string, model?: string, researchTypes?: string[]) => Promise<void>
  /** Callback to synthesize research */
  onSynthesize: () => Promise<void>
  /** Callback when ready to proceed */
  onProceed: () => void
  /** Whether research is currently running */
  isRunning: boolean
  /** Whether synthesis is running */
  isSynthesizing?: boolean
  /** Context from questioning phase */
  questioningContext?: string
  /** Whether the component is in loading state */
  isLoading?: boolean
  /** GSD session ID for filtering events */
  sessionId?: string
}

/** Normalize agent type keys from events to match local state keys */
function normalizeAgentKey(agentType: string): string {
  const key = agentType.toLowerCase()
  if (key === 'bestpractices' || key === 'best_practices') return 'bestPractices'
  return key
}

interface AgentStatusCardProps {
  displayName: string
  agentName: string
  status: {
    running: boolean
    complete: boolean
    error?: string | null
    outputPath?: string | null
  }
  result?: ResearchResult
  streamingOutput?: string
  onViewResult?: (result: ResearchResult) => void
  /** Whether this agent is selected for re-run (when in selective mode) */
  isSelected?: boolean
  /** Callback when selection changes */
  onSelectionChange?: (selected: boolean) => void
  /** Whether to show selection checkbox */
  showSelectionCheckbox?: boolean
}

/** Get icon for agent type */
function getAgentIcon(agentName: string): ReactNode {
  switch (agentName) {
    case 'architecture':
      return <Building className="h-4 w-4" />
    case 'codebase':
      return <FolderCode className="h-4 w-4" />
    case 'bestPractices':
      return <Sparkles className="h-4 w-4" />
    case 'risks':
      return <AlertTriangle className="h-4 w-4" />
    default:
      return <Search className="h-4 w-4" />
  }
}

function AgentStatusCard({
  displayName,
  agentName,
  status,
  result,
  streamingOutput,
  onViewResult,
  isSelected,
  onSelectionChange,
  showSelectionCheckbox,
}: AgentStatusCardProps) {
  // Auto-open when running and has output
  const shouldAutoOpen = status.running && Boolean(streamingOutput)
  const [manuallyToggled, setManuallyToggled] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)

  // Compute effective open state
  const isOpen = manuallyToggled ? isManualOpen : shouldAutoOpen

  const handleOpenChange = (open: boolean) => {
    setManuallyToggled(true)
    setIsManualOpen(open)
  }

  const outputRef = useRef<HTMLPreElement>(null)

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current && isOpen) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [streamingOutput, isOpen])

  function getStatusColor(): string {
    if (status.running) return 'text-blue-500'
    if (status.error) return 'text-red-500'
    if (status.complete) return 'text-emerald-500'
    return 'text-muted-foreground'
  }

  function getStatusText(): string {
    if (status.running) return 'Researching...'
    if (status.error) return 'Failed'
    if (status.complete) return 'Complete'
    return 'Pending'
  }

  function getCardStyle(): string {
    if (status.running) return 'border-blue-500/30 bg-blue-500/5'
    if (status.error) return 'border-red-500/30 bg-red-500/5'
    if (status.complete) return 'border-emerald-500/30 bg-emerald-500/5'
    return 'border-border/50'
  }

  const hasOutput = Boolean(streamingOutput?.trim())

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <div className={cn(
        'rounded-xl border p-3 transition-all',
        getCardStyle()
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {showSelectionCheckbox && (
              <Checkbox
                id={`select-${agentName}`}
                checked={isSelected}
                onCheckedChange={(checked) => onSelectionChange?.(checked as boolean)}
                disabled={status.running}
                aria-label={`Select ${displayName} for re-run`}
              />
            )}
            <div className={cn('shrink-0', getStatusColor())}>
              {status.running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                getAgentIcon(agentName)
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{displayName}</p>
              <p className={cn('text-xs', getStatusColor())}>{getStatusText()}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {status.complete && result && onViewResult && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewResult(result)}
                className="h-8 w-8 p-0"
              >
                <FileText className="h-4 w-4" />
              </Button>
            )}
            {(status.running || hasOutput) && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
                  <Terminal className="h-3.5 w-3.5" />
                  <ChevronDown className={cn(
                    'h-3 w-3 transition-transform',
                    isOpen && 'rotate-180'
                  )} />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        {status.error && (
          <p className="text-xs text-red-500 mt-2 pl-7">{status.error}</p>
        )}
      </div>

      <CollapsibleContent>
        <div className="mt-1 rounded-lg bg-zinc-900 border border-zinc-800 p-2 overflow-hidden">
          <pre
            ref={outputRef}
            className="text-xs font-mono text-emerald-400 max-h-40 overflow-auto whitespace-pre-wrap"
          >
            {streamingOutput || (status.running ? 'Starting...' : 'No output')}
            {status.running && <span className="animate-pulse">█</span>}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Local storage key for tracking if user has seen the research explanation */
const RESEARCH_EXPLANATION_SEEN_KEY = 'research-explanation-seen'

/** Collapsible explanation of what Research Mode does and when to use it */
function ResearchExplanation() {
  const [isExpanded, setIsExpanded] = useState(() => {
    // Expand by default if user hasn't seen it
    if (typeof window === 'undefined') return true
    return localStorage.getItem(RESEARCH_EXPLANATION_SEEN_KEY) !== 'true'
  })

  const handleOpenChange = (open: boolean) => {
    setIsExpanded(open)
    // Mark as seen once collapsed
    if (!open) {
      localStorage.setItem(RESEARCH_EXPLANATION_SEEN_KEY, 'true')
    }
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors text-left">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-sm">What is Research Mode?</span>
          </div>
          <ChevronDown
            className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3 pl-3 space-y-4">
          {/* Main explanation */}
          <p className="text-sm text-muted-foreground">
            Research runs 4 AI agents that analyze your <strong className="text-foreground">actual codebase</strong> before
            helping you write the PRD.
          </p>

          {/* 4 agents inline */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs">
              <Building className="h-3.5 w-3.5 text-primary" />
              <span>Architecture</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs">
              <FolderCode className="h-3.5 w-3.5 text-primary" />
              <span>Codebase</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Best Practices</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-primary" />
              <span>Risks</span>
            </div>
          </div>

          {/* Time estimate */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Takes ~2-5 minutes</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ResearchProgress({
  status,
  results,
  synthesis,
  onStartResearch,
  onSynthesize,
  onProceed,
  isRunning,
  isSynthesizing = false,
  questioningContext = '',
  isLoading = false,
  sessionId,
}: ResearchProgressProps) {
  const [selectedResult, setSelectedResult] = useState<ResearchResult | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [agentOutputs, setAgentOutputs] = useState<Record<string, string>>({})
  // Selective re-run mode: which agents are selected
  const [selectiveMode, setSelectiveMode] = useState(false)
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())

  // Get agent selection from store (for persisting selection)
  const {
    selectedResearchAgent,
    setSelectedResearchAgent,
    loadAvailableAgents,
  } = usePRDChatStore()

  // Use the unified agent/model selector hook with provider support
  const {
    agentType,
    modelId: selectedModel,
    setModelId,
    models,
    modelsLoading,
    agentOptions,
    agentsLoading,
    handleAgentOptionChange,
    currentAgentOptionValue,
  } = useAgentModelSelector({
    initialAgent: selectedResearchAgent || 'claude',
  })

  // Sync agent selection to store when it changes
  useEffect(() => {
    if (agentType !== selectedResearchAgent) {
      setSelectedResearchAgent(agentType)
    }
  }, [agentType, selectedResearchAgent, setSelectedResearchAgent])

  // Load available agents on mount (for compatibility)
  useEffect(() => {
    loadAvailableAgents()
  }, [loadAvailableAgents])

  // Listen for research output events
  useEffect(() => {
    if (!sessionId) return

    let unlistenOutput: (() => void) | undefined
    let unlistenStatus: (() => void) | undefined

    const setupListeners = async () => {
      try {
        // Listen for streaming output chunks
        unlistenOutput = await subscribeEvent<ResearchOutputEvent>(
          'gsd:research_output',
          (payload) => {
            if (payload.sessionId !== sessionId) return

            const agentKey = normalizeAgentKey(payload.agentType)
            if (!payload.isComplete && payload.chunk) {
              setAgentOutputs((prev) => ({
                ...prev,
                [agentKey]: (prev[agentKey] || '') + payload.chunk + '\n',
              }))
            }
          }
        )

        // Listen for status updates
        unlistenStatus = await subscribeEvent<ResearchStatusEvent>(
          'gsd:research_status',
          (payload) => {
            if (payload.sessionId !== sessionId) return
            // Status updates are handled by parent component through polling
            // but we log them for debugging
            console.log(`[Research] ${payload.agentType}: ${payload.status}`)
          }
        )
      } catch (err) {
        console.warn('Failed to set up research event listeners:', err)
      }
    }

    setupListeners()

    return () => {
      if (unlistenOutput) unlistenOutput()
      if (unlistenStatus) unlistenStatus()
    }
  }, [sessionId])

  // Calculate progress
  const agents = [
    { name: 'architecture', displayName: 'Architecture', status: status.architecture },
    { name: 'codebase', displayName: 'Codebase Analysis', status: status.codebase },
    { name: 'bestPractices', displayName: 'Best Practices', status: status.bestPractices },
    { name: 'risks', displayName: 'Risks & Challenges', status: status.risks },
  ]

  const completedCount = agents.filter((a) => a.status.complete).length
  const runningCount = agents.filter((a) => a.status.running).length
  const failedAgents = agents.filter((a) => a.status.error)
  const failedCount = failedAgents.length
  const progress = (completedCount / agents.length) * 100

  const isComplete = completedCount === agents.length
  const hasStarted = runningCount > 0 || completedCount > 0 || failedCount > 0
  const hasFailedOnly = failedCount > 0 && runningCount === 0

  const handleStartResearch = useCallback(async () => {
    // Clear previous outputs before starting new research
    setAgentOutputs({})
    await onStartResearch(questioningContext, agentType || undefined, selectedModel || undefined)
  }, [onStartResearch, questioningContext, agentType, selectedModel])

  // Retry only the failed agents - compute failed names inline to avoid memoization issues
  const handleRetryFailed = useCallback(async () => {
    // Compute failed agent names from current status
    const failedNames: string[] = []
    if (status.architecture.error) failedNames.push('architecture')
    if (status.codebase.error) failedNames.push('codebase')
    if (status.bestPractices.error) failedNames.push('bestPractices')
    if (status.risks.error) failedNames.push('risks')

    // Clear outputs for failed agents only
    setAgentOutputs((prev) => {
      const next = { ...prev }
      for (const name of failedNames) {
        delete next[name]
      }
      return next
    })
    await onStartResearch(
      questioningContext,
      agentType || undefined,
      selectedModel || undefined,
      failedNames
    )
  }, [onStartResearch, questioningContext, agentType, selectedModel, status])

  const handleSynthesize = useCallback(async () => {
    await onSynthesize()
    setShowSummary(true)
  }, [onSynthesize])

  // Toggle agent selection for selective re-run
  const handleAgentSelectionChange = useCallback((agentName: string, selected: boolean) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(agentName)
      } else {
        next.delete(agentName)
      }
      return next
    })
  }, [])

  // Run only selected agents
  const handleRunSelected = useCallback(async () => {
    const agentNames = Array.from(selectedAgents)
    if (agentNames.length === 0) return

    // Clear outputs for selected agents
    setAgentOutputs((prev) => {
      const next = { ...prev }
      for (const name of agentNames) {
        delete next[name]
      }
      return next
    })

    await onStartResearch(
      questioningContext,
      agentType || undefined,
      selectedModel || undefined,
      agentNames
    )

    // Exit selective mode and clear selection after starting
    setSelectiveMode(false)
    setSelectedAgents(new Set())
  }, [selectedAgents, onStartResearch, questioningContext, agentType, selectedModel])

  // Toggle selective mode
  const handleToggleSelectiveMode = useCallback(() => {
    if (selectiveMode) {
      // Exiting selective mode - clear selections
      setSelectiveMode(false)
      setSelectedAgents(new Set())
    } else {
      // Entering selective mode - pre-select failed agents if any
      setSelectiveMode(true)
      const failed = new Set<string>()
      if (status.architecture.error) failed.add('architecture')
      if (status.codebase.error) failed.add('codebase')
      if (status.bestPractices.error) failed.add('bestPractices')
      if (status.risks.error) failed.add('risks')
      setSelectedAgents(failed)
    }
  }, [selectiveMode, status])

  // Show summary when explicitly toggled or synthesis exists
  const shouldShowSummary = showSummary || Boolean(synthesis)

  function getResultForAgent(name: string): ResearchResult | undefined {
    return results.find((r) => r.researchType === name.toLowerCase())
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header section - no card wrapper for cleaner look */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Research Phase</h2>
        </div>
        <p className="text-sm text-muted-foreground pl-11">
          Parallel agents are researching architecture patterns, codebase structure, best
          practices, and potential risks for your project.
        </p>
      </div>

      {/* Progress overview - compact inline design */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Research Progress</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {completedCount}/{agents.length} complete
          </span>
        </div>
        <Progress value={progress} className="h-1.5" />
        <div className="flex flex-wrap gap-2">
          {runningCount > 0 && (
            <Badge variant="outline" className="gap-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningCount} running
            </Badge>
          )}
          {completedCount > 0 && (
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
              <CheckCircle2 className="h-3 w-3" />
              {completedCount} complete
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <XCircle className="h-3 w-3" />
              {failedCount} failed
            </Badge>
          )}
        </div>
      </div>

      {/* Agent status grid - single column on mobile for readability */}
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentStatusCard
            key={agent.name}
            displayName={agent.displayName}
            agentName={agent.name}
            status={agent.status}
            result={getResultForAgent(agent.name)}
            streamingOutput={agentOutputs[agent.name]}
            onViewResult={setSelectedResult}
            showSelectionCheckbox={selectiveMode}
            isSelected={selectedAgents.has(agent.name)}
            onSelectionChange={(selected) => handleAgentSelectionChange(agent.name, selected)}
          />
        ))}
      </div>

      {/* Actions section */}
      <div className="space-y-4 pt-2">
        {/* Research explanation - only show before research starts */}
        {!hasStarted && <ResearchExplanation />}

        {/* Agent and Model selectors - only show before research starts */}
        {!hasStarted && (
          <AgentModelSelector
            agentType={agentType}
            modelId={selectedModel}
            onModelChange={setModelId}
            models={models}
            modelsLoading={modelsLoading}
            agentOptions={agentOptions}
            agentsLoading={agentsLoading}
            currentAgentOptionValue={currentAgentOptionValue}
            onAgentOptionChange={handleAgentOptionChange}
            disabled={isLoading || isRunning}
            variant="default"
          />
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {!hasStarted ? (
            <Button onClick={handleStartResearch} disabled={isLoading} size="lg" className="w-full">
              <Search className="h-4 w-4 mr-2" />
              Start Research
            </Button>
          ) : isRunning ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              Research in progress using {agentType ? agentType.charAt(0).toUpperCase() + agentType.slice(1) : 'Claude'}...
            </div>
          ) : selectiveMode ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                onClick={handleRunSelected}
                disabled={isLoading || isRunning || selectedAgents.size === 0}
                className="gap-2 flex-1"
              >
                <RefreshCw className="h-4 w-4" />
                Re-run Selected ({selectedAgents.size})
              </Button>
              <Button
                variant="outline"
                onClick={handleToggleSelectiveMode}
                disabled={isLoading || isRunning}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Primary action */}
              {!synthesis && isComplete && (
                <Button onClick={handleSynthesize} disabled={isSynthesizing} size="lg" className="w-full">
                  {isSynthesizing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Synthesize Results
                </Button>
              )}
              {synthesis && (
                <Button onClick={onProceed} disabled={isLoading} size="lg" className="w-full gap-2">
                  Continue to Requirements
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {/* Secondary actions */}
              <div className="flex items-center gap-2">
                {hasFailedOnly ? (
                  <Button
                    variant="outline"
                    onClick={handleRetryFailed}
                    disabled={isLoading || isRunning}
                    className="gap-2 flex-1"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry Failed ({failedCount})
                  </Button>
                ) : (completedCount > 0 || failedCount > 0) && (
                  <Button
                    variant="ghost"
                    onClick={handleStartResearch}
                    disabled={isLoading || isRunning}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-run All
                  </Button>
                )}
                {(completedCount > 0 || failedCount > 0) && (
                  <Button
                    variant="ghost"
                    onClick={handleToggleSelectiveMode}
                    disabled={isLoading || isRunning}
                  >
                    Select Agents
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Research summary */}
      {shouldShowSummary && synthesis && (
        <ResearchSummary synthesis={synthesis} onClose={() => setShowSummary(false)} />
      )}

      {/* Selected result preview */}
      {selectedResult && (
        <Card>
          <CardHeader size="compact">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm capitalize">
                {selectedResult.researchType.replace('_', ' ')} Research
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedResult(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded-lg">
                {selectedResult.content || 'No content available'}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
