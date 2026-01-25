import { forwardRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, MessageSquare, Bot } from 'lucide-react'
import { ChatMessageItem } from './ChatMessageItem'
import { StreamingIndicator } from './StreamingIndicator'
import type { ChatSession, ChatMessage } from '@/types'

// Animation variants for staggered message reveals
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    },
  },
} as const

const messageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94] as const, // easeOut cubic bezier
    },
  },
} as const

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
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-2 sm:mb-3" />
            <h3 className="font-medium mb-1 text-sm sm:text-base">Create a new session</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
              Start a conversation to create your PRD
            </p>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                onClick={onCreateSession}
                aria-label="New session"
                className="w-full sm:w-auto"
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

    if (messages.length === 0) {
      return (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <Bot className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-2 sm:mb-3" />
            <h3 className="font-medium mb-1 text-sm sm:text-base">Start a conversation</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {currentSession.prdType
                ? `Creating a ${currentSession.prdType.replace('_', ' ')} PRD`
                : 'Ask the AI to help you create your PRD'}
            </p>
            {currentSession.guidedMode && (
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Guided mode is on - AI will ask structured questions
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4 max-w-xs sm:max-w-md justify-center">
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 text-xs px-2 py-1"
                onClick={() => onSendMessage('Help me create a PRD')}
              >
                Help me create a PRD
              </Badge>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 text-xs px-2 py-1"
                onClick={() => onSendMessage('What should my PRD include?')}
              >
                What should my PRD include?
              </Badge>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 text-xs px-2 py-1"
                onClick={() => onSendMessage('PRD best practices')}
              >
                PRD best practices
              </Badge>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 sm:space-y-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-2 sm:space-y-4"
        >
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
                layout
                style={{
                  // Stagger delay only for the first 10 messages to prevent long waits
                  transitionDelay: index < 10 ? `${index * 30}ms` : '0ms',
                }}
              >
                <ChatMessageItem message={message} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {streaming && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <StreamingIndicator
                startedAt={streamingStartedAt}
                onRetry={onRetry}
                onCancel={onCancel}
                content={streamingContent}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={ref} />
      </div>
    )
  }
)
