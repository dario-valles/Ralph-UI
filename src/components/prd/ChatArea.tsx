import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, MessageSquare, Bot, ArrowDown } from 'lucide-react'
import { ChatMessageItem } from './ChatMessageItem'
import { StreamingIndicator } from './StreamingIndicator'
import type { ChatSession, ChatMessage } from '@/types'
import { cn } from '@/lib/utils'

interface ChatAreaProps {
  /** Ref for the messages container (for auto-scroll) */
  containerRef: RefObject<HTMLDivElement | null>
  currentSession: ChatSession | null
  messages: ChatMessage[]
  streaming: boolean
  streamingStartedAt: string | null
  streamingContent: string
  processingSessionId: string | null
  isAtBottom: boolean
  onCreateSession: () => void
  onQuickStart: () => void
  onSendMessage: (content: string) => void
  onRetry: () => void
  onCancel: () => void
  onScrollToBottom: () => void
}

/**
 * Chat messages area component.
 * Displays empty states, message list, streaming indicator, and scroll-to-bottom button.
 */
export function ChatArea({
  containerRef,
  currentSession,
  messages,
  streaming,
  streamingStartedAt,
  streamingContent,
  processingSessionId,
  isAtBottom,
  onCreateSession,
  onQuickStart,
  onSendMessage,
  onRetry,
  onCancel,
  onScrollToBottom,
}: ChatAreaProps) {
  // No session state
  if (!currentSession) {
    return (
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-0"
      >
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          {/* Decorative background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/20">
              <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
          </div>

          <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            Create your PRD
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Start a conversation and let AI guide you through creating a comprehensive Product Requirements Document
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto px-4 sm:px-0">
            <Button
              onClick={onCreateSession}
              aria-label="New session"
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Session
            </Button>
            <Button
              variant="outline"
              onClick={onQuickStart}
              aria-label="Quick start"
              className="w-full sm:w-auto"
            >
              Quick Start
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Empty messages state
  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-0"
      >
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          {/* Decorative background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/3 right-1/4 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl" />
          </div>

          <div className="relative mb-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bot className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
              <span className="text-[10px] text-white">AI</span>
            </div>
          </div>

          <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-1">
            Ready to help
          </h3>
          <p className="text-sm text-muted-foreground mb-1">
            {currentSession.prdType
              ? `Creating a ${currentSession.prdType.replace('_', ' ')} PRD`
              : 'Ask me anything about your PRD'}
          </p>
          {currentSession.guidedMode && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
              Guided mode active
            </p>
          )}

          {/* Quick action pills */}
          <div className="flex flex-wrap gap-2 mt-2 max-w-sm justify-center">
            {[
              'Help me create a PRD',
              'What should my PRD include?',
              'PRD best practices',
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => onSendMessage(prompt)}
                className="px-3 py-1.5 text-xs font-medium rounded-full border border-border/50 bg-card hover:bg-muted hover:border-emerald-500/30 transition-all duration-200 hover:shadow-sm"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Messages list
  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-0"
      >
        {messages.map((message) => (
          <ChatMessageItem key={message.id} message={message} />
        ))}
        {streaming && processingSessionId === currentSession?.id && (
          <StreamingIndicator
            startedAt={streamingStartedAt || undefined}
            onRetry={onRetry}
            onCancel={onCancel}
            content={streamingContent}
          />
        )}
      </div>

      {/* Scroll to bottom button - positioned to left of quality badge */}
      {!isAtBottom && messages.length > 0 && (
        <Button
          variant="secondary"
          size="icon"
          onClick={onScrollToBottom}
          className={cn(
            'absolute bottom-[5rem] right-[4.5rem] sm:bottom-24 sm:right-20 z-10',
            'h-9 w-9 rounded-full',
            'bg-background/80 backdrop-blur-sm border border-border/50',
            'shadow-lg hover:shadow-xl transition-all duration-200',
            'hover:scale-105 hover:bg-background'
          )}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </>
  )
}
