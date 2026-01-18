import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Send,
  Plus,
  Trash2,
  FileText,
  Loader2,
  MessageSquare,
  Bot,
  User,
  BarChart3,
} from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { PRDTypeSelector } from './PRDTypeSelector'
import { QualityScoreCard } from './QualityScoreCard'
import type { ChatMessage, ChatSession, PRDTypeValue } from '@/types'
import { cn } from '@/lib/utils'

// ============================================================================
// Sub-Components
// ============================================================================

interface ChatMessageItemProps {
  message: ChatMessage
}

function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === 'user'
  const timestamp = new Date(message.createdAt)

  return (
    <div
      data-testid={`message-${message.role}`}
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isUser ? 'bg-primary/5 ml-8' : 'bg-muted mr-8'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{message.content}</p>
      </div>
    </div>
  )
}

interface ChatInputProps {
  onSend: (message: string) => void
  disabled: boolean
  placeholder?: string
}

function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    const trimmedValue = value.trim()
    if (!trimmedValue) return

    onSend(trimmedValue)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type your message...'}
        disabled={disabled}
        aria-label="Message input"
        className="flex-1"
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface StreamingIndicatorProps {
  className?: string
}

function StreamingIndicator({ className }: StreamingIndicatorProps) {
  return (
    <div
      data-testid="streaming-indicator"
      className={cn(
        'flex items-center gap-2 p-4 bg-muted rounded-lg mr-8 animate-pulse',
        className
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex gap-1">
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

interface SessionItemProps {
  session: ChatSession
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

function SessionItem({ session, isActive, onSelect, onDelete }: SessionItemProps) {
  return (
    <div
      data-testid="session-item"
      data-active={isActive}
      className={cn(
        'flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
        isActive && 'bg-muted'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm truncate">{session.title || 'Untitled Session'}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete session"
        className="h-7 w-7 p-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PRDChatPanel() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [showQualityPanel, setShowQualityPanel] = useState(false)

  const {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    error,
    qualityAssessment,
    sendMessage,
    startSession,
    deleteSession,
    setCurrentSession,
    loadHistory,
    loadSessions,
    exportToPRD,
    assessQuality,
  } = usePRDChatStore()

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Load history when session changes
  useEffect(() => {
    if (currentSession && currentSession.id !== prevSessionIdRef.current) {
      loadHistory(currentSession.id)
      prevSessionIdRef.current = currentSession.id
    }
  }, [currentSession, loadHistory])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAgentChange = (_e: React.ChangeEvent<HTMLSelectElement>) => {
    // When changing agent, start a new session with type selector
    setShowTypeSelector(true)
  }

  const handleSendMessage = (content: string) => {
    sendMessage(content)
  }

  const handleCreateSession = () => {
    setShowTypeSelector(true)
  }

  const handleTypeSelected = (prdType: PRDTypeValue, guidedMode: boolean, projectPath?: string) => {
    startSession({
      agentType: currentSession?.agentType || 'claude',
      prdType,
      guidedMode,
      projectPath,
    })
    setShowTypeSelector(false)
  }

  const handleQuickStart = () => {
    // Quick start without type selection (general type)
    startSession({
      agentType: 'claude',
      prdType: 'general',
      guidedMode: true,
    })
    setShowTypeSelector(false)
  }

  const handleDeleteSession = (sessionId: string) => {
    deleteSession(sessionId)
  }

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSession(session)
    loadHistory(session.id)
  }

  const handleExportToPRD = async () => {
    if (currentSession) {
      // Assess quality before export
      const assessment = await assessQuality()
      if (assessment && !assessment.readyForExport) {
        setShowQualityPanel(true)
        return
      }
      exportToPRD(currentSession.title || 'Untitled PRD')
    }
  }

  const handleForceExport = () => {
    if (currentSession) {
      exportToPRD(currentSession.title || 'Untitled PRD')
      setShowQualityPanel(false)
    }
  }

  const handleRefreshQuality = () => {
    assessQuality()
  }

  const hasMessages = messages.length > 0
  const isDisabled = loading || streaming || !currentSession

  // Show type selector when creating a new session
  if (showTypeSelector) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <PRDTypeSelector
          onSelect={handleTypeSelected}
          loading={loading}
          defaultProjectPath={currentSession?.projectPath}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* Session Sidebar */}
      <Card className="w-64 shrink-0 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateSession}
              aria-label="New session"
              className="h-7 w-7 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 flex-1 overflow-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No sessions yet</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateSession}
                className="mt-2"
                aria-label="New session"
              >
                <Plus className="h-3 w-3 mr-1" />
                New Session
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={currentSession?.id === session.id}
                  onSelect={() => handleSelectSession(session)}
                  onDelete={() => handleDeleteSession(session.id)}
                />
              ))}
            </div>
          )}
        </CardContent>

        {/* Quality Score in Sidebar */}
        {currentSession && hasMessages && (
          <div className="p-2 border-t">
            <QualityScoreCard
              assessment={qualityAssessment}
              loading={loading}
              onRefresh={handleRefreshQuality}
              className="border-0 shadow-none"
            />
          </div>
        )}
      </Card>

      {/* Chat Panel */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="sr-only">PRD Chat</h2>
              <CardTitle className="text-lg">
                {currentSession?.title || 'PRD Chat'}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {/* Agent Selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="agent-selector" className="text-sm text-muted-foreground">
                  Agent:
                </label>
                <Select
                  id="agent-selector"
                  aria-label="Agent"
                  value={currentSession?.agentType || 'claude'}
                  onChange={handleAgentChange}
                  disabled={streaming}
                  className="w-36"
                >
                  <option value="claude">Claude</option>
                  <option value="opencode">OpenCode</option>
                  <option value="cursor">Cursor</option>
                </Select>
              </div>

              {/* Quality Score Button */}
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshQuality}
                  disabled={streaming || loading}
                  aria-label="Check quality"
                  className="gap-1"
                >
                  <BarChart3 className="h-4 w-4" />
                  {qualityAssessment && (
                    <span className={cn(
                      'text-xs font-medium',
                      qualityAssessment.overall >= 60 ? 'text-green-600' : 'text-yellow-600'
                    )}>
                      {qualityAssessment.overall}%
                    </span>
                  )}
                </Button>
              )}

              {/* Export Button */}
              {hasMessages && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToPRD}
                  disabled={streaming}
                  aria-label="Export to PRD"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Export to PRD
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden relative">
          {/* Loading Spinner */}
          {loading && (
            <div
              data-testid="loading-spinner"
              className="absolute inset-0 flex items-center justify-center bg-background/50 z-10"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mx-4 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!currentSession ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">Create a new session</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Start a conversation to create your PRD
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleCreateSession} aria-label="New session">
                    <Plus className="h-4 w-4 mr-2" />
                    New Session
                  </Button>
                  <Button variant="outline" onClick={handleQuickStart} aria-label="Quick start">
                    Quick Start
                  </Button>
                </div>
              </div>
            ) : messages.length === 0 ? (
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
                    onClick={() => sendMessage("Help me create a PRD")}
                  >
                    Help me create a PRD
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => sendMessage("What should my PRD include?")}
                  >
                    What should my PRD include?
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => sendMessage("PRD best practices")}
                  >
                    PRD best practices
                  </Badge>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessageItem key={message.id} message={message} />
                ))}
                {streaming && <StreamingIndicator />}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <ChatInput
              onSend={handleSendMessage}
              disabled={isDisabled}
              placeholder={
                !currentSession
                  ? 'Create a session to start chatting...'
                  : 'Type your message...'
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Quality Warning Dialog */}
      <Dialog open={showQualityPanel} onOpenChange={setShowQualityPanel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PRD Quality Assessment</DialogTitle>
            <DialogDescription>
              Your PRD may be incomplete. Review the quality assessment below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <QualityScoreCard
              assessment={qualityAssessment}
              loading={loading}
              onRefresh={handleRefreshQuality}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQualityPanel(false)}>
              Continue Editing
            </Button>
            <Button onClick={handleForceExport}>
              Export Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
