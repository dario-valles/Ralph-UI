import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  FileText,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Maximize2,
  Code,
  FileCode,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PRDPlanSidebarProps {
  content: string | null
  path: string | null
  isWatching: boolean
  onRefresh?: () => void
  className?: string
}

// Reusable markdown renderer component
function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        components={{
          // Style code blocks
          pre: ({ children }) => (
            <pre className="bg-secondary/50 rounded-md p-3 overflow-x-auto text-xs">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className
            return isInline ? (
              <code className="bg-secondary/50 px-1 py-0.5 rounded text-xs">
                {children}
              </code>
            ) : (
              <code className={className}>{children}</code>
            )
          },
          // Style lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
          ),
          // Style headings
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 pb-1 border-b">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>
          ),
          // Style paragraphs
          p: ({ children }) => <p className="my-1.5 text-sm">{children}</p>,
          // Style tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 bg-muted font-medium text-left">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1">{children}</td>
          ),
          // Style blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          // Style horizontal rules
          hr: () => <hr className="my-4 border-border" />,
          // Style strong/bold
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function PRDPlanSidebar({
  content,
  path,
  isWatching,
  onRefresh,
  className,
}: PRDPlanSidebarProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const prevContentLength = useRef(0)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (content && autoScroll && contentRef.current) {
      const newLength = content.length
      if (newLength > prevContentLength.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight
      }
      prevContentLength.current = newLength
    }
  }, [content, autoScroll])

  // Extract filename from path
  const filename = path ? path.split('/').pop() : null

  if (!content && !isWatching) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Plan Document
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No plan document yet</p>
            <p className="text-xs mt-1">
              The AI will create a plan document as you discuss requirements
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const headerControls = (
    <div className="flex items-center gap-1">
      {isWatching && (
        <Badge variant="outline" className="text-xs gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Watching
        </Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowRaw(!showRaw)}
        className="h-6 w-6 p-0"
        title={showRaw ? 'Show rendered markdown' : 'Show raw markdown'}
      >
        {showRaw ? (
          <FileText className="h-3 w-3" />
        ) : (
          <Code className="h-3 w-3" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAutoScroll(!autoScroll)}
        className="h-6 w-6 p-0"
        title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
      >
        {autoScroll ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="h-6 w-6 p-0"
        title="Expand to full view"
      >
        <Maximize2 className="h-3 w-3" />
      </Button>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-6 w-6 p-0"
          title="Refresh content"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )

  const renderContent = () => {
    if (isWatching && !content) {
      return (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
            <p className="text-xs">Waiting for plan file...</p>
          </div>
        </div>
      )
    }

    if (!content) {
      return (
        <div className="h-full flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">No content yet...</p>
        </div>
      )
    }

    if (showRaw) {
      return (
        <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/30 p-3 rounded-md overflow-x-auto">
          {content}
        </pre>
      )
    }

    return <MarkdownContent content={content} />
  }

  return (
    <>
      <Card className={cn('flex flex-col', className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Plan Document
            </CardTitle>
            {headerControls}
          </div>
          {filename && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <FileCode className="h-3 w-3" />
              <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                {filename}
              </code>
              {path && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  title="Open file location"
                  onClick={() => {
                    console.log('Open file:', path)
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <div
            ref={contentRef}
            className="h-full overflow-y-auto p-3"
          >
            {renderContent()}
          </div>
        </CardContent>
      </Card>

      {/* Expanded View Dialog */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Plan Document
                {filename && (
                  <code className="text-sm font-normal bg-muted px-2 py-0.5 rounded ml-2">
                    {filename}
                  </code>
                )}
              </DialogTitle>
              <div className="flex items-center gap-2 mr-8">
                {isWatching && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    Watching
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRaw(!showRaw)}
                  className="gap-1"
                >
                  {showRaw ? (
                    <>
                      <FileText className="h-3 w-3" />
                      Rendered
                    </>
                  ) : (
                    <>
                      <Code className="h-3 w-3" />
                      Raw
                    </>
                  )}
                </Button>
                {onRefresh && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    className="gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-background">
            {content ? (
              showRaw ? (
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {content}
                </pre>
              ) : (
                <MarkdownContent content={content} className="prose-base" />
              )
            ) : (
              <div className="h-full flex items-center justify-center">
                {isWatching ? (
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p className="text-sm">Waiting for plan file...</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No content yet...</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
