import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User, Sparkles } from 'lucide-react'
import type { ChatMessage } from '@/types'
import { AttachmentList } from './AttachmentPreview'
import { cn } from '@/lib/utils'

interface ChatMessageItemProps {
  message: ChatMessage
}

export const ChatMessageItem = memo(function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === 'user'
  const timestamp = new Date(message.createdAt)
  const hasAttachments = message.attachments && message.attachments.length > 0

  return (
    <div
      data-testid={`message-${message.role}`}
      className={cn(
        'group relative',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-300'
      )}
    >
      <div
        className={cn(
          'flex gap-3 sm:gap-4',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* Avatar */}
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center',
            'transition-transform duration-200 group-hover:scale-105',
            isUser
              ? 'bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-200 dark:to-slate-400 text-white dark:text-slate-900'
              : 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/20'
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </div>

        {/* Message Content */}
        <div
          className={cn(
            'flex-1 min-w-0',
            isUser ? 'text-right' : 'text-left'
          )}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center gap-2 mb-1.5',
              isUser ? 'justify-end' : 'justify-start'
            )}
          >
            <span className={cn(
              'text-sm font-semibold tracking-tight',
              isUser ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400'
            )}>
              {isUser ? 'You' : 'Assistant'}
            </span>
            {!isUser && (
              <Sparkles className="h-3 w-3 text-emerald-500/60" />
            )}
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
              {timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Message Bubble */}
          <div
            className={cn(
              'inline-block max-w-[95%] sm:max-w-[85%]',
              'rounded-2xl px-4 py-3',
              'transition-all duration-200',
              isUser
                ? [
                    'bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-100 dark:to-slate-200',
                    'text-white dark:text-slate-900',
                    'rounded-tr-md',
                    'shadow-lg shadow-slate-900/10 dark:shadow-slate-300/10',
                  ]
                : [
                    'bg-card',
                    'border border-border/50',
                    'rounded-tl-md',
                    'shadow-sm',
                  ]
            )}
          >
            {isUser ? (
              <div className="space-y-2">
                {message.content && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-left">
                    {message.content}
                  </p>
                )}
                {hasAttachments && <AttachmentList attachments={message.attachments!} />}
              </div>
            ) : (
              <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Style code blocks
                    pre: ({ children }) => (
                      <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-lg p-3 sm:p-4 overflow-x-auto text-[11px] sm:text-xs my-3 border border-slate-700/50">
                        {children}
                      </pre>
                    ),
                    code: ({ children, className }) => {
                      const isInline = !className
                      return isInline ? (
                        <code className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.5 rounded-md text-xs font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className={cn(className, 'font-mono')}>{children}</code>
                      )
                    },
                    // Style lists with custom markers
                    ul: ({ children }) => (
                      <ul className="space-y-1.5 my-3 ml-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-1.5 my-3 ml-1">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="flex gap-2 items-start">
                        <span className="text-emerald-500 mt-1.5 text-xs">&#x2022;</span>
                        <span className="flex-1">{children}</span>
                      </li>
                    ),
                    // Style headings
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold tracking-tight border-b border-border/50 pb-2">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-bold tracking-tight text-foreground/90">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold tracking-tight text-foreground/80">
                        {children}
                      </h3>
                    ),
                    // Style paragraphs
                    p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                    // Style strong/bold with accent color
                    strong: ({ children }) => (
                      <strong className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {children}
                      </strong>
                    ),
                    // Style tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4 rounded-lg border border-border/50 shadow-sm">
                        <table className="min-w-full text-xs">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-muted/50 border-b border-border/50">{children}</thead>
                    ),
                    tbody: ({ children }) => (
                      <tbody className="divide-y divide-border/30">{children}</tbody>
                    ),
                    tr: ({ children }) => (
                      <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2.5 text-left font-semibold text-foreground/80 whitespace-nowrap">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2.5 text-muted-foreground">{children}</td>
                    ),
                    // Style blockquotes
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-3 border-emerald-500/50 pl-4 my-3 py-1 italic text-muted-foreground bg-muted/30 rounded-r-lg">
                        {children}
                      </blockquote>
                    ),
                    // Style links
                    a: ({ children, href }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                      >
                        {children}
                      </a>
                    ),
                    // Style horizontal rules
                    hr: () => (
                      <hr className="my-6 border-none h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
