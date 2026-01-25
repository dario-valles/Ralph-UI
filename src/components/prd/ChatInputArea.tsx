import { ChatInput } from './ChatInput'
import { InlinePhaseButtons, type PhaseAction, type PhaseState } from './PhaseActionBar'
import { FloatingQualityBadge } from './FloatingQualityBadge'
import type { ChatSession, QualityAssessment, ChatAttachment } from '@/types'

interface ChatInputAreaProps {
  currentSession: ChatSession | null
  hasMessages: boolean
  loading: boolean
  streaming: boolean
  qualityAssessment: QualityAssessment | null
  phaseState: PhaseState
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void
  onPhaseAction: (action: PhaseAction) => void
  onRefreshQuality: () => void
}

/**
 * Input area component for PRD Chat.
 * Includes the chat input, inline phase action buttons, and floating quality badge.
 */
export function ChatInputArea({
  currentSession,
  hasMessages,
  loading,
  streaming,
  qualityAssessment,
  phaseState,
  onSendMessage,
  onPhaseAction,
  onRefreshQuality,
}: ChatInputAreaProps) {
  const isDisabled = loading || streaming || !currentSession

  return (
    <>
      {/* Floating Quality Badge */}
      {currentSession && hasMessages && (
        <FloatingQualityBadge
          assessment={qualityAssessment}
          loading={loading}
          onRefresh={onRefreshQuality}
        />
      )}

      {/* Input Area with Inline Phase Actions */}
      <div className="border-t border-border/50 p-3 sm:p-4 flex-shrink-0 bg-gradient-to-t from-muted/30 to-background">
        <ChatInput
          onSend={onSendMessage}
          disabled={isDisabled}
          placeholder={
            !currentSession
              ? 'Create a session to start chatting...'
              : 'Describe your product requirements...'
          }
          leftActions={
            currentSession?.projectPath ? (
              <InlinePhaseButtons
                phaseState={phaseState}
                onAction={onPhaseAction}
                disabled={isDisabled}
              />
            ) : undefined
          }
        />
      </div>
    </>
  )
}
