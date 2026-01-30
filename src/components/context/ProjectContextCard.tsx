/**
 * ProjectContextCard - Dashboard card showing project context status
 *
 * Displays:
 * - Context configured status
 * - Token count for context files
 * - "Set Up Context" CTA for unconfigured projects
 * - "Edit" and "Regenerate" actions for configured projects
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Settings2,
  MessageSquarePlus,
  FileText,
  Sparkles,
  X,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useContextStore, useShouldShowContextSetup, useTotalTokenCount } from '@/stores/contextStore'
import { isContextConfigured, capitalizeContextFileName } from '@/types'

interface ProjectContextCardProps {
  /** Project path to show context for */
  projectPath: string
  /** Optional callback when context chat is opened */
  onOpenContextChat?: () => void
  /** Optional callback when context editor is opened */
  onOpenEditor?: () => void
  /** Optional class name */
  className?: string
  /** Whether to show as a compact card */
  compact?: boolean
}

export function ProjectContextCard({
  projectPath,
  onOpenContextChat,
  onOpenEditor,
  className,
  compact = false,
}: ProjectContextCardProps) {
  const navigate = useNavigate()
  const { projectContext, loading, loadProjectContext, dismissContextSetup } = useContextStore()
  const shouldShowSetup = useShouldShowContextSetup()
  const totalTokens = useTotalTokenCount()

  // Extract project name from path
  const projectName = projectPath.split('/').pop() || 'Project'

  // Load context when project path changes
  useEffect(() => {
    if (projectPath) {
      loadProjectContext(projectPath)
    }
  }, [projectPath, loadProjectContext])

  const isConfigured = projectContext ? isContextConfigured(projectContext) : false

  const handleSetupContext = (): void => {
    if (onOpenContextChat) {
      onOpenContextChat()
    } else {
      navigate('/context/chat', { state: { projectPath } })
    }
  }

  const handleEditContext = (): void => {
    if (onOpenEditor) {
      onOpenEditor()
    } else {
      navigate('/context/edit', { state: { projectPath } })
    }
  }

  const handleDismiss = (): Promise<void> => dismissContextSetup(projectPath)

  // Loading state
  if (loading && !projectContext) {
    return (
      <Card className={cn('', className)}>
        <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className={compact ? 'pt-0' : ''}>
          <div className="h-8 w-full rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  // Not configured - show setup prompt
  if (shouldShowSetup || (!isConfigured && !projectContext?.setupDismissed)) {
    return (
      <Card
        className={cn(
          'border-dashed border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10',
          className
        )}
      >
        <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-blue-500/10">
                <Sparkles className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">Project Context</CardTitle>
                <p className="text-xs text-muted-foreground">
                  for <span className="font-medium text-foreground">{projectName}</span>
                </p>
              </div>
            </div>
            <Tooltip content="Dismiss this prompt">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Dismiss</span>
              </Button>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className={compact ? 'pt-0' : ''}>
          <p className="text-sm text-muted-foreground mb-3">
            Set up context for{' '}
            <span className="font-medium text-foreground">{projectName}</span> to help AI agents
            understand your codebase, tech stack, and conventions.
          </p>
          <Button onClick={handleSetupContext} size="sm" className="w-full sm:w-auto">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Set Up with AI Chat
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Configured - show status and actions
  if (isConfigured && projectContext) {
    const contextFiles = projectContext.files
    const config = projectContext.config

    return (
      <Card className={cn('', className)}>
        <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-green-500/10">
                <BookOpen className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">Project Context</CardTitle>
                <p className="text-xs text-muted-foreground">
                  for <span className="font-medium text-foreground">{projectName}</span>
                </p>
              </div>
              <Badge variant="success" className="text-xs">
                Configured
              </Badge>
            </div>
          </div>
          {!compact && (
            <CardDescription className="text-xs">
              {config.enabled ? 'Injected into agent prompts' : 'Injection disabled'}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={compact ? 'pt-0' : ''}>
          {/* Context files summary */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {contextFiles.map((file) => (
              <Badge
                key={file.name}
                variant="outline"
                className="text-xs font-normal"
              >
                <FileText className="h-3 w-3 mr-1" />
                {capitalizeContextFileName(file.name)}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              ~{totalTokens} tokens
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditContext}
              className="flex-1"
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSetupContext}
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Dismissed but not configured - show minimal CTA
  return (
    <Card className={cn('', className)}>
      <CardContent className="py-4">
        <button
          onClick={handleSetupContext}
          className="flex items-center justify-between w-full text-left group hover:text-primary transition-colors"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            <div>
              <span className="text-sm">Set up project context</span>
              <span className="text-xs text-muted-foreground block">
                for <span className="font-medium">{projectName}</span>
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
        </button>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Compact Banner Variant
// ============================================================================

interface ContextSetupBannerProps {
  projectPath: string
  onSetup?: () => void
  onDismiss?: () => void
  className?: string
}

/**
 * Compact banner for prompting context setup
 * Can be placed at the top of PRD Chat or other pages
 */
export function ContextSetupBanner({
  projectPath,
  onSetup,
  onDismiss,
  className,
}: ContextSetupBannerProps) {
  const { loading, loadProjectContext, dismissContextSetup } = useContextStore()
  const shouldShowSetup = useShouldShowContextSetup()

  useEffect(() => {
    if (projectPath) {
      loadProjectContext(projectPath)
    }
  }, [projectPath, loadProjectContext])

  const handleDismiss = async (): Promise<void> => {
    await dismissContextSetup(projectPath)
    onDismiss?.()
  }

  if (loading || !shouldShowSetup) return null

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2 rounded-lg',
        'bg-blue-500/5 border border-blue-500/20 dark:bg-blue-500/10',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <span className="text-sm truncate">
          Set up project context to help agents understand your codebase
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onSetup}>
          Set Up
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDismiss}
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  )
}
