import { CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NativeSelect as Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Plus,
  MessageSquare,
  Bot,
  BarChart3,
  ScrollText,
  ChevronDown,
  Play,
} from 'lucide-react'
import { ModelSelector } from '@/components/shared/ModelSelector'
import type { ChatSession, QualityAssessment, AgentType } from '@/types'
import type { ModelInfo } from '@/lib/model-api'
import { cn } from '@/lib/utils'

interface ChatHeaderProps {
  /** Current chat session */
  currentSession: ChatSession | null
  /** List of all sessions for mobile selector */
  sessions: ChatSession[]
  /** Current agent type */
  agentType: AgentType
  /** Currently selected model ID */
  selectedModel: string
  /** Default model ID for the agent */
  defaultModelId: string
  /** Available models for the agent */
  models: ModelInfo[]
  /** Whether models are loading */
  modelsLoading: boolean
  /** Whether streaming is active */
  streaming: boolean
  /** Whether loading is active */
  loading: boolean
  /** Whether messages exist */
  hasMessages: boolean
  /** Quality assessment result */
  qualityAssessment: QualityAssessment | null
  /** Whether plan content exists */
  watchedPlanContent: string | null
  /** Whether plan path exists */
  watchedPlanPath: string | null
  /** Whether plan sidebar is visible */
  isPlanVisible: boolean
  /** Scroll direction for auto-hide (mobile) */
  scrollDirection: 'up' | 'down' | null
  /** Handler for agent change */
  onAgentChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  /** Handler for model change */
  onModelChange: (modelId: string) => void
  /** Handler for session selection (mobile) */
  onSelectSession: (session: ChatSession) => void
  /** Handler for creating new session */
  onCreateSession: () => void
  /** Handler for toggling plan sidebar/sheet */
  onPlanToggle: () => void
  /** Handler for refreshing quality */
  onRefreshQuality: () => void
  /** Handler for executing PRD */
  onExecutePrd: () => void
}

/**
 * Chat header component with agent/model selectors and actions.
 * Renders mobile-specific compact header and desktop header.
 */
export function ChatHeader({
  currentSession,
  sessions,
  agentType,
  selectedModel,
  defaultModelId,
  models,
  modelsLoading,
  streaming,
  loading,
  hasMessages,
  qualityAssessment,
  watchedPlanContent,
  watchedPlanPath,
  isPlanVisible,
  scrollDirection,
  onAgentChange,
  onModelChange,
  onSelectSession,
  onCreateSession,
  onPlanToggle,
  onRefreshQuality,
  onExecutePrd,
}: ChatHeaderProps) {
  return (
    <>
      {/* Mobile Header - Single compact row with auto-hide on scroll */}
      <div
        className={cn(
          'lg:hidden flex-shrink-0 bg-gradient-to-b from-card to-muted/20 border-b border-border/50 transition-all duration-200 ease-in-out overflow-hidden',
          scrollDirection === 'down' ? 'max-h-0 opacity-0 border-b-0' : 'max-h-16 opacity-100'
        )}
      >
        <div className="px-2.5 py-2 flex items-center gap-1.5">
          {/* Session selector - compact */}
          <Select
            id="mobile-session-selector"
            aria-label="Select session"
            value={currentSession?.id || ''}
            onChange={(e) => {
              const session = sessions.find((s) => s.id === e.target.value)
              if (session) onSelectSession(session)
            }}
            className="flex-1 min-w-0 text-sm h-9 font-medium rounded-xl border-border/50"
          >
            <option value="" disabled>
              Select session...
            </option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title || 'Untitled Session'}
              </option>
            ))}
          </Select>

          {/* New session button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateSession}
            className="h-9 w-9 p-0 flex-shrink-0 rounded-xl border-border/50"
            aria-label="New session"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* Plan toggle - always visible if project path exists */}
          {currentSession?.projectPath && (
            <Button
              variant={isPlanVisible ? 'default' : 'outline'}
              size="sm"
              onClick={onPlanToggle}
              disabled={streaming}
              aria-label="Toggle plan"
              className={cn(
                'h-9 w-9 p-0 relative rounded-xl flex-shrink-0 transition-all',
                isPlanVisible
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 border-0'
                  : 'border-border/50'
              )}
            >
              <ScrollText className="h-4 w-4" />
              {watchedPlanContent && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white/50" />
                </span>
              )}
            </Button>
          )}

          {/* Combined settings & actions dropdown */}
          <MobileActionsDropdown
            agentType={agentType}
            selectedModel={selectedModel}
            defaultModelId={defaultModelId}
            models={models}
            modelsLoading={modelsLoading}
            streaming={streaming}
            loading={loading}
            hasMessages={hasMessages}
            qualityAssessment={qualityAssessment}
            watchedPlanPath={watchedPlanPath}
            onAgentChange={onAgentChange}
            onModelChange={onModelChange}
            onRefreshQuality={onRefreshQuality}
            onExecutePrd={onExecutePrd}
          />
        </div>
      </div>

      {/* Desktop Header */}
      <CardHeader className="pb-3 pt-3 border-b border-border/50 px-4 flex-shrink-0 bg-gradient-to-b from-card to-muted/20 hidden lg:block">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-shrink">
            <h2 className="sr-only">PRD Chat</h2>
            <CardTitle className="text-base font-semibold tracking-tight truncate">
              {currentSession?.title || 'PRD Chat'}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Agent/Model Selector - Refined pill design */}
            <div className="flex items-center gap-0.5 bg-gradient-to-b from-muted/40 to-muted/60 rounded-xl p-1 border border-border/30 shadow-sm">
              <Select
                id="agent-selector"
                aria-label="Agent"
                value={agentType}
                onChange={onAgentChange}
                disabled={streaming}
                className="w-20 text-xs h-7 bg-background/80 backdrop-blur-sm border-0 rounded-lg font-medium shadow-sm"
              >
                <option value="claude">Claude</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor</option>
              </Select>
              <div className="w-px h-5 bg-gradient-to-b from-transparent via-border to-transparent" />
              <ModelSelector
                id="model-selector"
                value={selectedModel || defaultModelId || ''}
                onChange={onModelChange}
                models={models}
                loading={modelsLoading}
                disabled={streaming}
                className="w-32 xl:w-40 text-xs h-7 bg-background/80 backdrop-blur-sm border-0 rounded-lg font-medium shadow-sm"
              />
            </div>

            {/* Plan Sidebar Toggle */}
            {currentSession?.projectPath && (
              <Tooltip content={isPlanVisible ? 'Hide plan' : 'Show plan'} side="bottom">
                <Button
                  variant={isPlanVisible ? 'default' : 'ghost'}
                  size="sm"
                  onClick={onPlanToggle}
                  disabled={streaming}
                  aria-label="Toggle plan sidebar"
                  className={cn(
                    'h-8 w-8 p-0 rounded-xl relative transition-all',
                    isPlanVisible
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 border-0'
                      : 'border border-border/50 hover:bg-muted/50'
                  )}
                >
                  <ScrollText className="h-4 w-4" />
                  {watchedPlanContent && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white/50" />
                    </span>
                  )}
                </Button>
              </Tooltip>
            )}

            {/* Actions Dropdown */}
            <DesktopActionsDropdown
              streaming={streaming}
              loading={loading}
              hasMessages={hasMessages}
              qualityAssessment={qualityAssessment}
              watchedPlanPath={watchedPlanPath}
              onRefreshQuality={onRefreshQuality}
              onExecutePrd={onExecutePrd}
            />
          </div>
        </div>
      </CardHeader>
    </>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface MobileActionsDropdownProps {
  agentType: AgentType
  selectedModel: string
  defaultModelId: string
  models: ModelInfo[]
  modelsLoading: boolean
  streaming: boolean
  loading: boolean
  hasMessages: boolean
  qualityAssessment: QualityAssessment | null
  watchedPlanPath: string | null
  onAgentChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onModelChange: (modelId: string) => void
  onRefreshQuality: () => void
  onExecutePrd: () => void
}

function MobileActionsDropdown({
  agentType,
  selectedModel,
  defaultModelId,
  models,
  modelsLoading,
  streaming,
  loading,
  hasMessages,
  qualityAssessment,
  watchedPlanPath,
  onAgentChange,
  onModelChange,
  onRefreshQuality,
  onExecutePrd,
}: MobileActionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 rounded-xl flex-shrink-0 border-border/50"
          disabled={streaming}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl border-border/40 shadow-2xl p-0 overflow-hidden">
        {/* Agent & Model selection - Premium card style */}
        <div className="bg-gradient-to-b from-muted/30 to-muted/50 p-3 border-b border-border/30">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Bot className="h-3 w-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-foreground/80">AI Configuration</span>
          </div>
          <div className="space-y-2">
            {/* Agent selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground w-12">Agent</span>
              <Select
                id="mobile-agent-selector"
                aria-label="Agent"
                value={agentType}
                onChange={onAgentChange}
                disabled={streaming}
                className="flex-1 text-xs h-8 bg-background/80 backdrop-blur-sm border-border/40 rounded-lg font-medium shadow-sm"
              >
                <option value="claude">Claude Code</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor</option>
              </Select>
            </div>
            {/* Model selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground w-12">Model</span>
              <ModelSelector
                id="mobile-model-selector"
                value={selectedModel || defaultModelId || ''}
                onChange={onModelChange}
                models={models}
                loading={modelsLoading}
                disabled={streaming}
                className="flex-1 text-xs h-8 bg-background/80 backdrop-blur-sm border-border/40 rounded-lg font-medium shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Actions section */}
        <div className="p-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5">Actions</p>
          {hasMessages ? (
            <div className="space-y-1">
              <DropdownMenuItem
                onClick={onRefreshQuality}
                disabled={loading}
                className="rounded-xl h-11 px-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 focus:bg-emerald-50 dark:focus:bg-emerald-950/30 transition-colors"
              >
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mr-3 shadow-sm">
                  <BarChart3 className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Check Quality</p>
                  <p className="text-[10px] text-muted-foreground">Analyze PRD completeness</p>
                </div>
                {qualityAssessment && (
                  <div className={cn(
                    "h-7 min-w-[2.5rem] px-2 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm",
                    qualityAssessment.overall >= 80 ? "bg-gradient-to-br from-green-400 to-emerald-500" :
                    qualityAssessment.overall >= 60 ? "bg-gradient-to-br from-yellow-400 to-amber-500" :
                    qualityAssessment.overall >= 40 ? "bg-gradient-to-br from-orange-400 to-orange-500" :
                    "bg-gradient-to-br from-red-400 to-red-500"
                  )}>
                    {qualityAssessment.overall}%
                  </div>
                )}
              </DropdownMenuItem>
              {watchedPlanPath && (
                <DropdownMenuItem
                  onClick={onExecutePrd}
                  disabled={loading}
                  className="rounded-xl h-11 px-3 hover:bg-blue-50 dark:hover:bg-blue-950/30 focus:bg-blue-50 dark:focus:bg-blue-950/30 transition-colors"
                >
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center mr-3 shadow-sm">
                    <Play className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">Execute PRD</p>
                    <p className="text-[10px] text-muted-foreground">Run implementation tasks</p>
                  </div>
                </DropdownMenuItem>
              )}
            </div>
          ) : (
            <div className="px-3 py-4 text-center">
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground">Send a message to unlock actions</p>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface DesktopActionsDropdownProps {
  streaming: boolean
  loading: boolean
  hasMessages: boolean
  qualityAssessment: QualityAssessment | null
  watchedPlanPath: string | null
  onRefreshQuality: () => void
  onExecutePrd: () => void
}

function DesktopActionsDropdown({
  streaming,
  loading,
  hasMessages,
  qualityAssessment,
  watchedPlanPath,
  onRefreshQuality,
  onExecutePrd,
}: DesktopActionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 rounded-xl border-border/50 hover:bg-muted/50"
          disabled={streaming}
        >
          <span className="hidden xl:inline text-xs font-medium">Actions</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl border-border/50 shadow-xl">
        {hasMessages && (
          <>
            <DropdownMenuItem onClick={onRefreshQuality} disabled={loading} className="rounded-lg">
              <BarChart3 className="h-4 w-4 mr-2 text-emerald-500" />
              Check Quality
              {qualityAssessment && (
                <Badge variant="secondary" className="ml-auto text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                  {qualityAssessment.overall}%
                </Badge>
              )}
            </DropdownMenuItem>
            {watchedPlanPath && (
              <>
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuItem onClick={onExecutePrd} disabled={loading} className="rounded-lg">
                  <Play className="h-4 w-4 mr-2 text-blue-500" />
                  Execute PRD
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
        {!hasMessages && (
          <DropdownMenuItem disabled className="rounded-lg">
            <span className="text-muted-foreground text-xs">Send a message first</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
