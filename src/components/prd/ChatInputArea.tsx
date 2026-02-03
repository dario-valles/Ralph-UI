import { forwardRef } from 'react'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { FloatingQualityBadge } from './FloatingQualityBadge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { ListOrdered, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
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
        {/* Execution Mode Toggle - Only show when session exists and callback provided */}
        {currentSession && onExecutionModeChange && (
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
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
