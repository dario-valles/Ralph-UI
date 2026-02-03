import { forwardRef } from 'react'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { FloatingQualityBadge } from './FloatingQualityBadge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ListOrdered, GitBranch, Microscope, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePRDChatStore } from '@/stores/prdChatStore'
import type { ChatSession, QualityAssessment, ChatAttachment, ExecutionMode } from '@/types'
import type { SlashCommand, SlashCommandResult } from '@/lib/prd-chat-commands'

export type { ChatInputHandle }

interface ChatInputAreaProps {
  currentSession: ChatSession | null
  hasMessages: boolean
  loading: boolean
  streaming: boolean
  qualityAssessment: QualityAssessment | null
  executionMode?: ExecutionMode
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void
  onRefreshQuality: () => void
  onExecutionModeChange?: (mode: ExecutionMode) => void
  /** Callback when a missing section badge is clicked */
  onMissingSectionClick?: (section: string) => void
  /** Callback when an action command is selected */
  onActionCommand?: (command: SlashCommand) => Promise<SlashCommandResult>
}

/**
 * Input area component for PRD Chat.
 * Includes the chat input, floating quality badge, and execution mode toggle.
 */
export const ChatInputArea = forwardRef<ChatInputHandle, ChatInputAreaProps>(function ChatInputArea(
  {
    currentSession,
    hasMessages,
    loading,
    streaming,
    qualityAssessment,
    executionMode,
    onSendMessage,
    onRefreshQuality,
    onExecutionModeChange,
    onMissingSectionClick,
    onActionCommand,
  },
  ref
) {
  const isDisabled = loading || streaming || !currentSession
  const currentMode = executionMode || 'sequential'

  // Ultra Research state
  const { ultraResearchConfig, toggleUltraResearch, openConfigModal, activeResearchSession } =
    usePRDChatStore()
  const isUltraEnabled = ultraResearchConfig?.enabled ?? false
  const isResearching =
    activeResearchSession?.status &&
    !['complete', 'error', 'cancelled'].includes(activeResearchSession.status)

  return (
    <>
      {/* Floating Quality Badge */}
      {currentSession && hasMessages && (
        <FloatingQualityBadge
          assessment={qualityAssessment}
          loading={loading}
          onRefresh={onRefreshQuality}
          onMissingSectionClick={onMissingSectionClick}
        />
      )}

      {/* Input Area */}
      <div className="border-t border-border/50 p-3 sm:p-4 flex-shrink-0 bg-gradient-to-t from-muted/30 to-background">
        {/* Toolbar Row - Execution Mode + Ultra Research */}
        {currentSession && (
          <div className="flex items-center justify-between gap-2 mb-2 text-xs text-muted-foreground">
            {/* Left: Execution Mode Toggle */}
            {onExecutionModeChange && (
              <div className="flex items-center gap-2">
                <span className="shrink-0">Execution:</span>
                <div className="flex rounded-md border border-border/50 overflow-hidden">
                  <Tooltip content="Execute requirements one at a time in dependency order" side="top">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onExecutionModeChange('sequential')}
                      disabled={isDisabled}
                      className={cn(
                        'h-7 px-2.5 text-xs gap-1 rounded-none border-r border-border/50',
                        currentMode === 'sequential' && 'bg-muted text-foreground'
                      )}
                    >
                      <ListOrdered className="h-3 w-3" />
                      <span className="hidden sm:inline">Sequential</span>
                    </Button>
                  </Tooltip>
                  <Tooltip content="Execute independent requirements in parallel (Beta)" side="top">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onExecutionModeChange('parallel')}
                      disabled={isDisabled}
                      className={cn(
                        'h-7 px-2.5 text-xs gap-1 rounded-none',
                        currentMode === 'parallel' && 'bg-muted text-foreground'
                      )}
                    >
                      <GitBranch className="h-3 w-3" />
                      <span className="hidden sm:inline">Parallel</span>
                      <Badge
                        variant="outline"
                        className="ml-0.5 text-[9px] px-1 py-0 h-3.5 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
                      >
                        Beta
                      </Badge>
                    </Button>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Right: Ultra Research Toggle */}
            <div className="flex items-center gap-2">
              <Tooltip
                content={
                  isUltraEnabled
                    ? 'Multi-agent deep research enabled'
                    : 'Enable multi-agent deep research for thorough analysis'
                }
                side="top"
              >
                <div
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1 rounded-md border transition-colors cursor-pointer',
                    isUltraEnabled
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400'
                      : 'border-border/50 hover:bg-muted/50'
                  )}
                  onClick={() => !isDisabled && !isResearching && toggleUltraResearch()}
                >
                  <Microscope className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium hidden sm:inline">Ultra Research</span>
                  <Switch
                    checked={isUltraEnabled}
                    onCheckedChange={toggleUltraResearch}
                    disabled={isDisabled || isResearching}
                    className="h-4 w-7 data-[state=checked]:bg-purple-600"
                  />
                </div>
              </Tooltip>
              {isUltraEnabled && (
                <Tooltip content="Configure Ultra Research" side="top">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openConfigModal}
                    disabled={isDisabled || isResearching}
                    className="h-7 w-7 p-0"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
        )}

        <ChatInput
          ref={ref}
          onSend={onSendMessage}
          disabled={isDisabled}
          placeholder={
            !currentSession
              ? 'Create a session to start chatting...'
              : 'Describe your product requirements...'
          }
          onActionCommand={onActionCommand}
        />
      </div>
    </>
  )
})
