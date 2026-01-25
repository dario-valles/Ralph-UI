import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Code, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MobilePlanSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string | null
}

/**
 * Mobile bottom sheet for viewing PRD plan content.
 * Supports toggling between rendered markdown and raw text views.
 */
export function MobilePlanSheet({ open, onOpenChange, content }: MobilePlanSheetProps) {
  const [showRaw, setShowRaw] = useState(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] lg:hidden p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">PRD Plan</SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRaw(!showRaw)}
              className="h-8 gap-1.5 text-xs"
            >
              {showRaw ? (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  Preview
                </>
              ) : (
                <>
                  <Code className="h-3.5 w-3.5" />
                  Raw
                </>
              )}
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {content ? (
            showRaw ? (
              <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground break-words">
                {content}
              </pre>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children }) => (
                      <pre className="bg-secondary/50 rounded-md p-2 overflow-x-auto text-xs">
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
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                    ),
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold mt-4 mb-2 pb-1 border-b">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => <p className="my-1.5 text-sm">{children}</p>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-4 border-border" />,
                    strong: ({ children }) => (
                      <strong className="font-semibold">{children}</strong>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No plan content yet. Start chatting to generate a PRD.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
