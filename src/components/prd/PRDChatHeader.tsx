import { CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FileText,
  BarChart3,
  ScrollText,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react'
import type { ChatSession, QualityAssessment, AgentType } from '@/types'
import type { ModelInfo } from '@/lib/model-api'

interface PRDChatHeaderProps {
  currentSession: ChatSession | null
  agentType: AgentType
  selectedModel: string
  defaultModelId: string
  models: ModelInfo[]
  modelsLoading: boolean
  streaming: boolean
  loading: boolean
  hasMessages: boolean
  qualityAssessment: QualityAssessment | null
  isReadyToExport: boolean
  showPlanSidebar: boolean
  watchedPlanContent: string | null
  hasProjectPath: boolean
  onAgentChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onModelChange: (modelId: string) => void
  onTogglePlanSidebar: () => void
  onRefreshQuality: () => void
  onExportToPRD: () => void
}

/**
 * Header component for PRD Chat with agent/model selectors and actions.
 */
export function PRDChatHeader({
  currentSession,
  agentType,
  selectedModel,
  defaultModelId,
  models,
  modelsLoading,
  streaming,
  loading,
  hasMessages,
  qualityAssessment,
  isReadyToExport,
  showPlanSidebar,
  watchedPlanContent,
  hasProjectPath,
  onAgentChange,
  onModelChange,
  onTogglePlanSidebar,
  onRefreshQuality,
  onExportToPRD,
}: PRDChatHeaderProps) {
  return (
    <CardHeader className="pb-2 border-b px-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-shrink">
          <h2 className="sr-only">PRD Chat</h2>
          <CardTitle className="text-base truncate">
            {currentSession?.title || 'PRD Chat'}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Agent/Model Selector - Compact */}
          <div className="flex items-center gap-1">
            <Select
              id="agent-selector"
              aria-label="Agent"
              value={agentType}
              onChange={onAgentChange}
              disabled={streaming}
              className="w-24 text-xs h-8"
            >
              <option value="claude">Claude</option>
              <option value="opencode">OpenCode</option>
              <option value="cursor">Cursor</option>
            </Select>

            <Select
              id="model-selector"
              aria-label="Model"
              value={selectedModel || defaultModelId || ''}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={streaming || modelsLoading}
              className="w-28 xl:w-36 text-xs h-8"
            >
              {modelsLoading ? (
                <option>Loading...</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))
              )}
            </Select>
          </div>

          {/* Plan Sidebar Toggle */}
          {hasProjectPath && (
            <div className="flex items-center border rounded-md">
              <Tooltip content={showPlanSidebar ? 'Hide plan' : 'Show plan'} side="bottom">
                <Button
                  variant={showPlanSidebar ? 'default' : 'ghost'}
                  size="sm"
                  onClick={onTogglePlanSidebar}
                  disabled={streaming}
                  aria-label="Toggle plan sidebar"
                  className="h-8 w-8 p-0 rounded-md relative"
                >
                  <ScrollText className="h-4 w-4" />
                  {watchedPlanContent && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                </Button>
              </Tooltip>
            </div>
          )}

          {/* Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2"
                disabled={streaming}
              >
                <span className="hidden xl:inline text-xs">Actions</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {hasMessages ? (
                <>
                  <DropdownMenuItem onClick={onRefreshQuality} disabled={loading}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Check Quality
                    {qualityAssessment && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {qualityAssessment.overall}%
                      </Badge>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onExportToPRD}
                    className={isReadyToExport ? 'bg-green-50 text-green-700' : ''}
                  >
                    {isReadyToExport ? (
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Export to PRD
                    {isReadyToExport && (
                      <Badge variant="secondary" className="ml-auto bg-green-100 text-green-700 text-xs">
                        Ready
                      </Badge>
                    )}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground text-xs">Send a message first</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </CardHeader>
  )
}
