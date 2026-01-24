import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User } from 'lucide-react'
import type { ChatMessage } from '@/types'
import { cn } from '@/lib/utils'
import { AttachmentList } from './AttachmentPreview'

interface ChatMessageItemProps {
  message: ChatMessage
}

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === 'user'
  const timestamp = new Date(message.createdAt)
  const hasAttachments = message.attachments && message.attachments.length > 0

  return (
    <div
      data-testid={`message-${message.role}`}
      className={cn(
        'flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg',
        isUser ? 'bg-primary/5 ml-2 sm:ml-4 md:ml-8' : 'bg-muted mr-2 sm:mr-4 md:mr-8'
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        ) : (
          <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        )}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{isUser ? 'You' : 'Assistant'}</span>
          <span className="text-xs text-muted-foreground">
            {timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {isUser ? (
          <div className="space-y-2">
            {message.content && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            )}
            {hasAttachments && <AttachmentList attachments={message.attachments!} />}
          </div>
        ) : (
          <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Style code blocks
                pre: ({ children }) => (
                  <pre className="bg-secondary/50 rounded-md p-2 sm:p-3 overflow-x-auto text-[11px] sm:text-xs">
                    {children}
                  </pre>
                ),
                code: ({ children, className }) => {
                  const isInline = !className
                  return isInline ? (
                    <code className="bg-secondary/50 px-1 py-0.5 rounded text-xs">{children}</code>
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
                h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                // Style paragraphs
                p: ({ children }) => <p className="my-1.5">{children}</p>,
                // Style tables
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3 rounded-md border border-border">
                    <table className="min-w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-border">{children}</tbody>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left font-semibold text-foreground/80 whitespace-nowrap">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-muted-foreground">{children}</td>
                ),
                // Style blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-muted-foreground">
                    {children}
                  </blockquote>
                ),
                // Style horizontal rules
                hr: () => <hr className="my-4 border-border" />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
