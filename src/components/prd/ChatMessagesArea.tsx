import { forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, MessageSquare, Bot } from 'lucide-react'
import { ChatMessageItem } from './ChatMessageItem'
import { StreamingIndicator } from './StreamingIndicator'
import type { ChatSession, ChatMessage } from '@/types'

interface ChatMessagesAreaProps {
  currentSession: ChatSession | null
  messages: ChatMessage[]
  streaming: boolean
  streamingStartedAt: string | undefined
  streamingContent: string
  onCreateSession: () => void
  onQuickStart: () => void
  onSendMessage: (content: string) => void
  onRetry: () => void
  onCancel: () => void
}

/**
 * Messages display area for PRD Chat.
 * Shows empty states, messages list, and streaming indicator.
 */
export const ChatMessagesArea = forwardRef<HTMLDivElement, ChatMessagesAreaProps>(
  function ChatMessagesArea(
    {
      currentSession,
      messages,
      streaming,
      streamingStartedAt,
      streamingContent,
      onCreateSession,
      onQuickStart,
      onSendMessage,
      onRetry,
      onCancel,
    },
    ref
  ) {
    if (!currentSession) {
      return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Create a new session</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start a conversation to create your PRD
            </p>
            <div className="flex gap-2">
              <Button onClick={onCreateSession} aria-label="New session">
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
              <Button variant="outline" onClick={onQuickStart} aria-label="Quick start">
                Quick Start
              </Button>
            </div>
          </div>
        </div>
      )
    }

    if (messages.length === 0) {
      return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Start a conversation</h3>
            <p className="text-sm text-muted-foreground">
              {currentSession.prdType
                ? `Creating a ${currentSession.prdType.replace('_', ' ')} PRD`
                : 'Ask the AI to help you create your PRD'}
            </p>
            {currentSession.guidedMode && (
              <p className="text-xs text-muted-foreground mt-1">
                Guided mode is on - AI will ask structured questions
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => onSendMessage("Help me create a PRD")}
              >
                Help me create a PRD
              </Badge>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => onSendMessage("What should my PRD include?")}
              >
                What should my PRD include?
              </Badge>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => onSendMessage("PRD best practices")}
              >
                PRD best practices
              </Badge>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <ChatMessageItem key={message.id} message={message} />
        ))}
        {streaming && (
          <StreamingIndicator
            startedAt={streamingStartedAt}
            onRetry={onRetry}
            onCancel={onCancel}
            content={streamingContent}
          />
        )}
        <div ref={ref} />
      </div>
    )
  }
)
