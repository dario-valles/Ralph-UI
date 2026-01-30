/**
 * ContextChat - AI-assisted context generation chat interface
 *
 * A dedicated chat interface for creating/updating project context files.
 * Features:
 * - Project analysis display (CLAUDE.md, tech stack, file structure)
 * - Chat conversation for context gathering
 * - Agent/model selection (reusing PRD Chat components)
 * - Start prompt cards for empty state
 * - Extracted context preview
 * - Save context button
 *
 * Reuses PRD Chat components for consistent design:
 * - ChatMessageItem for message rendering
 * - ChatInput for input area
 * - StreamingIndicator for loading states
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Save,
  FileCode,
  Folder,
  Package,
  AlertCircle,
  Check,
  MessageSquare,
  FileSearch,
  FileText,
  Compass,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { GroupedAgentModelSelector } from '@/components/shared/GroupedAgentModelSelector'
import { ChatMessageItem } from '@/components/prd/ChatMessageItem'
import { ChatInput } from '@/components/prd/ChatInput'
import { StreamingIndicator } from '@/components/prd/StreamingIndicator'
import { useContextStore, useExtractedContext, useProjectAnalysis } from '@/stores/contextStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useAgentModelSelector } from '@/hooks/useAgentModelSelector'
import { useContextChatEvents } from '@/hooks/useContextChatEvents'
import { useProjectStore } from '@/stores/projectStore'
import type { ProjectAnalysis } from '@/types'
import type { AgentType } from '@/types/agent'

// ============================================================================
// Start Prompt Configuration
// ============================================================================

interface StartPrompt {
  id: string
  icon: typeof MessageSquare
  title: string
  description: string
  message: string
}

const START_PROMPTS: StartPrompt[] = [
  {
    id: 'describe',
    icon: MessageSquare,
    title: 'Describe my project',
    description: "Tell the AI about your project's purpose and who it's for",
    message: "I'd like to describe my project. It's a...",
  },
  {
    id: 'analyze',
    icon: FileSearch,
    title: 'Analyze my codebase',
    description: 'Let AI scan your files and generate context automatically',
    message:
      'Please analyze my project files and generate a comprehensive context document based on what you find.',
  },
  {
    id: 'import',
    icon: FileText,
    title: 'Import from CLAUDE.md',
    description: 'Extract and refine context from your existing CLAUDE.md',
    message:
      'I have a CLAUDE.md file in my project. Please extract the relevant context from it and help me refine it.',
  },
  {
    id: 'guided',
    icon: Compass,
    title: 'Guide me step by step',
    description: 'Answer questions to build context incrementally',
    message:
      'Please guide me through setting up my project context step by step. Ask me questions about the project.',
  },
]

// ============================================================================
// Project Analysis Panel
// ============================================================================

interface ProjectAnalysisPanelProps {
  analysis: ProjectAnalysis
  collapsed?: boolean
  onToggle?: () => void
}

function ProjectAnalysisPanel({ analysis, collapsed, onToggle }: ProjectAnalysisPanelProps) {
  const { detectedStack, hasClaudeMd, projectName, fileStructureSummary } = analysis

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="w-full p-3 text-left bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Project Analysis</span>
          <Badge variant="outline" className="text-xs">
            {detectedStack.languages.length} languages detected
          </Badge>
        </div>
      </button>
    )
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileCode className="h-4 w-4 text-emerald-500" />
            Project Analysis
          </CardTitle>
          {onToggle && (
            <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 text-xs">
              Collapse
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Project Name */}
        {projectName && (
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{projectName}</span>
          </div>
        )}

        {/* CLAUDE.md Status */}
        {hasClaudeMd && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span className="text-xs">CLAUDE.md found - will be analyzed</span>
          </div>
        )}

        {/* Languages */}
        {detectedStack.languages.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Languages:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {detectedStack.languages.map((lang) => (
                <Badge key={lang} variant="outline" className="text-xs">
                  {lang}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Frameworks */}
        {detectedStack.frameworks.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Frameworks:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {detectedStack.frameworks.map((fw) => (
                <Badge key={fw} variant="secondary" className="text-xs">
                  {fw}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Key Dependencies */}
        {detectedStack.dependencies.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Package className="h-3 w-3" />
              Key Dependencies ({detectedStack.dependencies.length}):
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {detectedStack.dependencies.slice(0, 8).map((dep) => (
                <Badge key={dep.name} variant="outline" className="text-xs font-normal">
                  {dep.name}
                </Badge>
              ))}
              {detectedStack.dependencies.length > 8 && (
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                  +{detectedStack.dependencies.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* File Structure Summary */}
        {fileStructureSummary && (
          <div className="text-xs text-muted-foreground border-t border-border/50 pt-2 mt-2">
            <p className="line-clamp-3">{fileStructureSummary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Extracted Context Preview
// ============================================================================

interface ExtractedContextPreviewProps {
  content: string
  onSave: () => void
  onEdit: (content: string) => void
  saving?: boolean
  saved?: boolean
}

function ExtractedContextPreview({
  content,
  onSave,
  onEdit,
  saving,
  saved,
}: ExtractedContextPreviewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(content)

  const handleSave = () => {
    if (isEditing) {
      onEdit(editedContent)
    }
    onSave()
  }

  return (
    <Card className="border-green-500/30 bg-green-500/5 dark:bg-green-500/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-green-500" />
            Generated Context
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className="h-7 text-xs"
            >
              {isEditing ? 'Preview' : 'Edit'}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || saved}
              className="h-7"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : saved ? (
                <Check className="h-3 w-3 mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              {saved ? 'Saved' : 'Save Context'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[200px] font-mono text-xs"
          />
        ) : (
          <div className="max-h-[300px] overflow-y-auto rounded-lg bg-muted/30 p-3">
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main ContextChat Component
// ============================================================================

interface ContextChatProps {
  projectPath: string
  onClose?: () => void
}

export function ContextChat({ projectPath, onClose }: ContextChatProps) {
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [analysisPanelCollapsed, setAnalysisPanelCollapsed] = useState(false)
  const [editedContext, setEditedContext] = useState<string | null>(null)

  // Store state
  const {
    chatSession,
    chatMessages,
    chatLoading,
    chatError,
    streamingStartedAt,
    startContextChatSession,
    sendChatMessage,
    saveContextFromChat,
    clearChatError,
  } = useContextStore()

  const extractedContext = useExtractedContext()
  const projectAnalysis = useProjectAnalysis()
  const preferredAgent = useOnboardingStore((s) => s.preferredAgent)

  // Streaming events hook
  const { streamingContent, clearStreamingContent } = useContextChatEvents({
    sessionId: chatSession?.id,
  })

  // Clear streaming content when loading completes
  useEffect(() => {
    if (!chatLoading) {
      clearStreamingContent()
    }
  }, [chatLoading, clearStreamingContent])

  // Agent/model selection hook
  const {
    agentType,
    providerId,
    modelId,
    setModelId,
    models,
    modelsLoading,
    defaultModelId,
    agentOptions,
    agentsLoading,
    handleAgentOptionChange,
    currentAgentOptionValue,
  } = useAgentModelSelector({
    initialAgent: (preferredAgent || 'claude') as AgentType,
  })

  // Start session on mount or when agent changes
  useEffect(() => {
    if (projectPath && !chatSession) {
      startContextChatSession(projectPath, agentType, providerId)
    }
  }, [projectPath, chatSession, agentType, providerId, startContextChatSession])

  // Scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent])

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !chatSession || chatLoading) return

      try {
        await sendChatMessage(chatSession.id, projectPath, content.trim(), modelId || undefined)
      } catch {
        // Error is handled in store
      }
    },
    [chatSession, chatLoading, projectPath, sendChatMessage, modelId]
  )

  const handleSaveContext = async () => {
    if (!chatSession) return
    // Always pass content explicitly - use edited or extracted
    const contentToSave = editedContext || extractedContext
    if (!contentToSave) {
      // No content to save - this shouldn't happen since the save button
      // is only shown when extractedContext exists
      return
    }
    try {
      await saveContextFromChat(chatSession.id, projectPath, contentToSave)
    } catch {
      // Error handled in store
    }
  }

  const handleBack = onClose ?? (() => navigate(-1))

  // Convert ContextChatMessage to ChatMessage format for ChatMessageItem
  const convertedMessages = chatMessages.map((msg) => ({
    ...msg,
    attachments: undefined, // Context chat doesn't support attachments yet
  }))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50 bg-gradient-to-b from-card to-muted/20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold">Context Chat</h1>
            <p className="text-xs text-muted-foreground">Generate project context with AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Agent/Model Selector - Reusing shared grouped component */}
          <GroupedAgentModelSelector
            agentOptions={agentOptions}
            currentAgentOptionValue={currentAgentOptionValue}
            onAgentOptionChange={handleAgentOptionChange}
            modelId={modelId}
            defaultModelId={defaultModelId}
            onModelChange={setModelId}
            models={models}
            modelsLoading={modelsLoading}
            agentsLoading={agentsLoading}
            disabled={chatLoading}
            idPrefix="context"
            className="hidden sm:flex"
          />
          {chatSession?.contextSaved && (
            <Badge variant="success" className="text-xs">
              <Check className="h-3 w-3 mr-1" />
              Saved
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Error Alert */}
        {chatError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{chatError}</span>
              <Button variant="ghost" size="sm" onClick={clearChatError}>
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Project Analysis Panel */}
        {projectAnalysis && (
          <ProjectAnalysisPanel
            analysis={projectAnalysis}
            collapsed={analysisPanelCollapsed}
            onToggle={() => setAnalysisPanelCollapsed(!analysisPanelCollapsed)}
          />
        )}

        {/* Extracted Context Preview */}
        {extractedContext && (
          <ExtractedContextPreview
            content={editedContext || extractedContext}
            onSave={handleSaveContext}
            onEdit={setEditedContext}
            saving={useContextStore.getState().loading}
            saved={chatSession?.contextSaved}
          />
        )}

        {/* Start Prompt Cards - Show when no messages and not loading */}
        {chatMessages.length === 0 && !chatLoading && chatSession && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-center mb-6">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Set Up Project Context</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Help AI agents understand your project better. Choose a starting point:
              </p>
            </div>

            <div className="grid gap-3 w-full max-w-lg">
              {START_PROMPTS.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => handleSendMessage(prompt.message)}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border/50
                             bg-card hover:bg-muted/50 hover:border-border text-left transition-all
                             hover:shadow-md group"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <prompt.icon className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium block text-sm">{prompt.title}</span>
                    <span className="text-xs text-muted-foreground">{prompt.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {chatMessages.length > 0 && (
          <div className="space-y-4">
            {convertedMessages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                assistantName="Context Assistant"
              />
            ))}

            {/* Streaming indicator - reusing PRD Chat component */}
            {chatLoading && (
              <StreamingIndicator
                startedAt={streamingStartedAt ? new Date(streamingStartedAt) : undefined}
                content={streamingContent}
                sessionId={chatSession?.id}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Loading indicator when starting session */}
        {!chatSession && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Starting session...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area - reusing PRD Chat ChatInput component */}
      <div className="border-t border-border/50 p-3 sm:p-4 flex-shrink-0 bg-gradient-to-t from-muted/30 to-background">
        <ChatInput
          onSend={handleSendMessage}
          disabled={chatLoading || !chatSession}
          placeholder="Describe your project, or ask questions..."
        />
      </div>
    </div>
  )
}

// ============================================================================
// Standalone Page Wrapper
// ============================================================================

export function ContextChatPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // Try to get project path from location state first, then fall back to active project
  const locationProjectPath = (location.state as { projectPath?: string })?.projectPath
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : projects[0]

  const projectPath = locationProjectPath || activeProject?.path

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium mb-2">No Project Selected</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Please add a project first, then come back to set up context.
        </p>
        <Button onClick={() => navigate('/')}>Go to Mission Control</Button>
      </div>
    )
  }

  return (
    <div className="h-full">
      <ContextChat projectPath={projectPath} onClose={() => navigate(-1)} />
    </div>
  )
}
