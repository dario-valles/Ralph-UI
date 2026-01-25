/**
 * Deep Questioning Component for GSD Workflow
 *
 * Provides a chat-based interface for the first phase of GSD,
 * helping users articulate what they want to build through
 * natural conversation. AI extracts context automatically.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatInput } from './ChatInput'
import { ChatMessageItem } from './ChatMessageItem'
import { QuestioningGuide } from './gsd/QuestioningGuide'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useProjectStore } from '@/stores/projectStore'
import type { QuestioningContext } from '@/types/gsd'
import type { ChatMessage, ChatAttachment } from '@/types'
import { MessageSquare, ArrowRight, Bot, ChevronRight, ChevronLeft } from 'lucide-react'

interface DeepQuestioningProps {
  /** Current questioning context */
  context: QuestioningContext
  /** Callback when context is updated */
  onContextUpdate: (context: Partial<QuestioningContext>) => void
  /** Callback when user is ready to proceed */
  onProceed: () => void
  /** Whether the component is in loading state */
  isLoading?: boolean
  /** GSD session ID */
  sessionId?: string
}

/** System message to initialize the conversation */
const SYSTEM_WELCOME: ChatMessage = {
  id: 'system-welcome',
  sessionId: '',
  role: 'assistant',
  content: `Hi! I'm here to help you clarify your project idea. Tell me about what you want to build - describe it in your own words, and I'll help you think through the details.

**Some things to consider:**
- What problem are you trying to solve?
- Who would use this?
- What would success look like?

Just start typing and we'll figure it out together.`,
  createdAt: new Date().toISOString(),
}

export function DeepQuestioning({
  context,
  onContextUpdate,
  onProceed,
  isLoading = false,
  sessionId,
}: DeepQuestioningProps) {
  const [showGuide, setShowGuide] = useState(true)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([SYSTEM_WELCOME])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Get project context
  const activeProject = useProjectStore((s) => s.getActiveProject())
  const projectPath = activeProject?.path

  // Get chat store for sending messages
  const {
    currentSession,
    messages: storeMessages,
    streaming,
    startSession,
    sendMessage,
  } = usePRDChatStore()

  // Initialize chat session on mount
  useEffect(() => {
    if (projectPath && sessionId && !currentSession) {
      startSession({
        agentType: 'claude',
        projectPath,
      })
    }
  }, [projectPath, sessionId, currentSession, startSession])

  // Derive messages from store - use useMemo for stable reference
  const displayMessages = useMemo(() => {
    if (storeMessages.length > 0) {
      return [SYSTEM_WELCOME, ...storeMessages]
    }
    return localMessages
  }, [storeMessages, localMessages])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayMessages])

  // Check if enough context has been gathered
  const hasWhat = Boolean(context.what?.trim())
  const hasWhy = Boolean(context.why?.trim())
  const hasWho = Boolean(context.who?.trim())
  const hasDone = Boolean(context.done?.trim())
  const contextItemsCount = [hasWhat, hasWhy, hasWho, hasDone].filter(Boolean).length
  const isReadyToProceed = contextItemsCount >= 3

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (content: string, attachments?: ChatAttachment[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return

      // Add optimistic user message
      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        sessionId: sessionId || '',
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        attachments,
      }
      setLocalMessages((prev) => [...prev, userMessage])

      try {
        // Send through the chat system if connected
        if (currentSession) {
          await sendMessage(content.trim(), attachments)
        } else {
          // Fallback: just add the message locally and use it as a note
          onContextUpdate({
            notes: [...(context.notes || []), content.trim()],
          })

          // Add a simulated assistant response
          const assistantMessage: ChatMessage = {
            id: `local-response-${Date.now()}`,
            sessionId: sessionId || '',
            role: 'assistant',
            content: `Thanks for sharing! I've added that to your project context.

Based on what you've told me so far, could you tell me more about:
${!hasWhat ? '\n- **What** specifically are you building?' : ''}
${!hasWhy ? '\n- **Why** does this need to exist? What problem does it solve?' : ''}
${!hasWho ? '\n- **Who** will use this?' : ''}
${!hasDone ? '\n- **What does "done" look like?** How will you know it\'s complete?' : ''}

Feel free to elaborate on any of these, or continue describing your idea.`,
            createdAt: new Date().toISOString(),
          }
          setLocalMessages((prev) => [...prev, assistantMessage])
        }
      } catch (error) {
        console.error('Failed to send message:', error)
      }
    },
    [
      currentSession,
      sendMessage,
      sessionId,
      context.notes,
      onContextUpdate,
      hasWhat,
      hasWhy,
      hasWho,
      hasDone,
    ]
  )

  const handleProceed = useCallback(() => {
    onProceed()
  }, [onProceed])

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle>Deep Questioning</CardTitle>
          </div>
          <CardDescription>
            Describe your idea naturally. I&apos;ll help you clarify the key aspects and extract the
            essential context for planning.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Main content area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Chat area - takes 2/3 on large screens */}
        <div className={`flex flex-col ${showGuide ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-3 px-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Project Discovery Chat</span>
                </div>
                {!showGuide && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowGuide(true)}
                    className="gap-1"
                  >
                    Show Context
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* Messages area */}
            <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
              <div className="p-4 space-y-4">
                {displayMessages.map((message) => (
                  <ChatMessageItem key={message.id} message={message} />
                ))}
                {streaming && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="animate-pulse flex gap-1">
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                    <span>Thinking...</span>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Chat input */}
            <div className="p-4 border-t flex-shrink-0">
              <ChatInput
                onSend={handleSendMessage}
                disabled={isLoading || streaming}
                placeholder="Describe your project idea..."
              />
            </div>
          </Card>
        </div>

        {/* Guide sidebar - 1/3 on large screens */}
        {showGuide && (
          <div className="lg:col-span-1 flex flex-col">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute -left-3 top-4 z-10 h-8 w-8 p-0 rounded-full bg-background border shadow-sm"
                onClick={() => setShowGuide(false)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <QuestioningGuide
                context={context}
                onContextItemUpdate={(key, value) => onContextUpdate({ [key]: value })}
                onClose={() => setShowGuide(false)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Progress and proceed */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Context items:</span>
              <div className="flex gap-2">
                <Badge variant={hasWhat ? 'default' : 'outline'}>What</Badge>
                <Badge variant={hasWhy ? 'default' : 'outline'}>Why</Badge>
                <Badge variant={hasWho ? 'default' : 'outline'}>Who</Badge>
                <Badge variant={hasDone ? 'default' : 'outline'}>Done</Badge>
              </div>
            </div>

            <Button
              onClick={handleProceed}
              disabled={!isReadyToProceed || isLoading}
              className="gap-2"
            >
              Create PROJECT.md
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {!isReadyToProceed && (
            <p className="text-sm text-muted-foreground mt-2">
              Fill in at least 3 context items in the sidebar, or keep chatting to discover more
              details.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
