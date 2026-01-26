/**
 * Research Progress Component for GSD Workflow
 *
 * Displays the status of parallel research agents and allows
 * viewing research results as they complete. Supports real-time
 * streaming output from each agent.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { NativeSelect } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { ResearchSummary } from './gsd/ResearchSummary'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { subscribeEvent } from '@/lib/events-client'
import type { ResearchStatus, ResearchResult, ResearchSynthesis } from '@/types/gsd'
import type { AgentType } from '@/types'
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  ArrowRight,
  RefreshCw,
  Bot,
  ChevronDown,
  ChevronRight,
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

  function getStatusIcon(): React.ReactNode {
    if (status.running) return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    if (status.error) return <XCircle className="h-4 w-4 text-red-500" />
    if (status.complete) return <CheckCircle2 className="h-4 w-4 text-green-500" />
    return <Search className="h-4 w-4 text-muted-foreground" />
  }

  function getStatusText(): string {
    if (status.running) return 'Researching...'
    if (status.error) return 'Failed'
    if (status.complete) return 'Complete'
    return 'Pending'
  }

  const hasOutput = Boolean(streamingOutput?.trim())

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {showSelectionCheckbox && (
                <Checkbox
                  id={`select-${agentName}`}
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelectionChange?.(checked as boolean)}
                  disabled={status.running}
                  aria-label={`Select ${displayName} for re-run`}
                />
              )}
              {getStatusIcon()}
              <div>
                <p className="font-medium text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground">{getStatusText()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status.complete && result && onViewResult && (
                <Button variant="ghost" size="sm" onClick={() => onViewResult(result)}>
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              {(status.running || hasOutput) && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Terminal className="h-4 w-4" />
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </div>
          {status.error && <p className="text-xs text-red-500 mt-2">{status.error}</p>}
        </div>

        <CollapsibleContent>
          <div className="border-t bg-black/95 p-2">
            <pre
              ref={outputRef}
              className="text-xs font-mono text-green-400 max-h-48 overflow-auto whitespace-pre-wrap"
            >
              {streamingOutput || (status.running ? 'Starting...' : 'No output')}
              {status.running && <span className="animate-pulse">_</span>}
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

/** Local storage key for tracking if user has seen the research explanation */
const RESEARCH_EXPLANATION_SEEN_KEY = 'research-explanation-seen'

/** Small card showing what each research agent does */
function AgentInfoCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-background/50 border border-border/30">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </div>
    </div>
  )
}

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
    <Card className="bg-muted/30">
      <Collapsible open={isExpanded} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-sm">What is Research Mode?</span>
              </div>
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            {/* Main explanation */}
            <p className="text-sm text-muted-foreground">
              Research runs 4 AI agents that analyze your <strong>actual codebase</strong> before
              helping you write the PRD.
            </p>

            {/* 4 agent cards - 2x2 grid */}
            <div className="grid grid-cols-2 gap-2">
              <AgentInfoCard
                icon={Building}
                title="Architecture"
                desc="Design patterns & structure"
              />
              <AgentInfoCard icon={FolderCode} title="Codebase" desc="Your code & conventions" />
              <AgentInfoCard icon={Sparkles} title="Best Practices" desc="Industry standards" />
              <AgentInfoCard
                icon={AlertTriangle}
                title="Risks"
                desc="Edge cases & challenges"
              />
            </div>

            {/* Time estimate */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Takes ~2-5 minutes</span>
            </div>

            {/* When to use */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-medium text-green-600 dark:text-green-400 mb-1">
                  ✓ Use Research when:
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>• Complex features</li>
                  <li>• New to codebase</li>
                  <li>• Need risk analysis</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">
                  💬 Just chat when:
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>• Simple features</li>
                  <li>• Brainstorming</li>
                  <li>• Know codebase well</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
  // Track user's explicit model selection (empty means use default)
  const [userSelectedModel, setUserSelectedModel] = useState<string>('')
  // Selective re-run mode: which agents are selected
  const [selectiveMode, setSelectiveMode] = useState(false)
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())

  // Get agent selection from store
  const {
    availableResearchAgents,
    selectedResearchAgent,
    setSelectedResearchAgent,
    loadAvailableAgents,
  } = usePRDChatStore()

  // Get available models for the selected research agent (default to 'claude')
  const effectiveAgentType = selectedResearchAgent || 'claude'
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(effectiveAgentType)

  // Effective model is user selection or default
  const selectedModel = userSelectedModel || defaultModelId || ''

  // Load available agents on mount
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
    await onStartResearch(questioningContext, selectedResearchAgent || undefined, selectedModel || undefined)
  }, [onStartResearch, questioningContext, selectedResearchAgent, selectedModel])

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
      selectedResearchAgent || undefined,
      selectedModel || undefined,
      failedNames
    )
  }, [onStartResearch, questioningContext, selectedResearchAgent, selectedModel, status])

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
      selectedResearchAgent || undefined,
      selectedModel || undefined,
      agentNames
    )

    // Exit selective mode and clear selection after starting
    setSelectiveMode(false)
    setSelectedAgents(new Set())
  }, [selectedAgents, onStartResearch, questioningContext, selectedResearchAgent, selectedModel])

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
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle>Research Phase</CardTitle>
          </div>
          <CardDescription>
            Parallel agents are researching architecture patterns, codebase structure, best
            practices, and potential risks for your project.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Progress overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Research Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedCount}/{agents.length} complete
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex gap-2">
              {runningCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {runningCount} running
                </Badge>
              )}
              {completedCount > 0 && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {completedCount} complete
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {failedCount} failed
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent status grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Actions */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Research explanation - only show before research starts */}
          {!hasStarted && <ResearchExplanation />}

          {/* Agent and Model selectors - only show before research starts */}
          {!hasStarted && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <label htmlFor="research-agent-selector" className="text-sm font-medium">Agent:</label>
                <NativeSelect
                  id="research-agent-selector"
                  aria-label="Research Agent"
                  value={selectedResearchAgent || 'claude'}
                  onChange={(e) => setSelectedResearchAgent(e.target.value as AgentType)}
                  disabled={isLoading || isRunning}
                  className="w-28"
                >
                  {availableResearchAgents.length > 0 ? (
                    availableResearchAgents.map((agent) => (
                      <option key={agent} value={agent}>
                        {agent.charAt(0).toUpperCase() + agent.slice(1)}
                      </option>
                    ))
                  ) : (
                    <option value="claude">Claude</option>
                  )}
                </NativeSelect>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="research-model-selector" className="text-sm font-medium">Model:</label>
                <ModelSelector
                  id="research-model-selector"
                  ariaLabel="Research Model"
                  value={selectedModel}
                  onChange={setUserSelectedModel}
                  models={models}
                  loading={modelsLoading}
                  disabled={isLoading || isRunning}
                  className="w-40"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {!hasStarted ? (
              <Button onClick={handleStartResearch} disabled={isLoading}>
                <Search className="h-4 w-4 mr-2" />
                Start Research
              </Button>
            ) : isRunning ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Research in progress using {selectedResearchAgent || 'Claude'}...
              </div>
            ) : selectiveMode ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="default"
                  onClick={handleRunSelected}
                  disabled={isLoading || isRunning || selectedAgents.size === 0}
                  className="gap-2"
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
              <div className="flex items-center gap-2 flex-wrap">
                {/* Show "Retry Failed" if there are failed agents, otherwise "Re-run Research" */}
                {hasFailedOnly ? (
                  <Button
                    variant="default"
                    onClick={handleRetryFailed}
                    disabled={isLoading || isRunning}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry Failed ({failedCount})
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleStartResearch}
                    disabled={isLoading || isRunning}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-run All
                  </Button>
                )}
                {/* Show selective re-run option when research has completed */}
                {(completedCount > 0 || failedCount > 0) && (
                  <Button
                    variant="outline"
                    onClick={handleToggleSelectiveMode}
                    disabled={isLoading || isRunning}
                    className="gap-2"
                  >
                    Select Agents
                  </Button>
                )}
                {!synthesis && isComplete && (
                  <Button onClick={handleSynthesize} disabled={isSynthesizing}>
                    {isSynthesizing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Synthesize Results
                  </Button>
                )}
              </div>
            )}

            {synthesis && (
              <Button onClick={onProceed} disabled={isLoading} className="gap-2">
                Continue to Requirements
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Research summary */}
      {shouldShowSummary && synthesis && (
        <ResearchSummary synthesis={synthesis} onClose={() => setShowSummary(false)} />
      )}

      {/* Selected result preview */}
      {selectedResult && (
        <Card>
          <CardHeader>
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
            <div className="max-h-[400px] overflow-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded">
                {selectedResult.content || 'No content available'}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
