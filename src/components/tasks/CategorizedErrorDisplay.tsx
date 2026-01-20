// Categorized Error Display - Shows task errors with categorization
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Lightbulb,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { categorizeError, getErrorCategoryInfo } from '@/lib/error-categorization'
import { QuickFixButton } from './QuickFixButton'

interface CategorizedErrorDisplayProps {
  error: string | null | undefined
  taskId?: string
  compact?: boolean
}

export function CategorizedErrorDisplay({
  error,
  taskId,
  compact = false,
}: CategorizedErrorDisplayProps) {
  const [expanded, setExpanded] = useState(!compact)
  const [copied, setCopied] = useState(false)

  const categorized = useMemo(() => categorizeError(error), [error])

  if (!categorized) {
    return null
  }

  const { label, color, bgColor, icon } = getErrorCategoryInfo(categorized.category)

  const handleCopy = () => {
    if (error) {
      navigator.clipboard.writeText(error)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-2 py-1 rounded ${bgColor}`}>
        <span>{icon}</span>
        <span className={`text-xs font-medium ${color}`}>{label}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {categorized.message}
        </span>
      </div>
    )
  }

  return (
    <Card className="border-red-200 bg-red-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base">Task Failed</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <QuickFixButton
              errorContext={error || ''}
              filePath={categorized.file}
              lineNumber={categorized.line}
              relatedTaskId={taskId}
              buttonText="Quick Fix"
            />
            <Badge className={`${bgColor} ${color} border-none`}>
              <span className="mr-1">{icon}</span>
              {label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main error message */}
        <div className="p-3 bg-white rounded border">
          <p className="font-mono text-sm">{categorized.message}</p>
        </div>

        {/* File/line info */}
        {(categorized.file || categorized.line) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>
              {categorized.file}
              {categorized.line && `:${categorized.line}`}
            </span>
          </div>
        )}

        {/* Suggested fix */}
        {categorized.suggestedFix && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 rounded border border-blue-200">
            <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-xs font-medium text-blue-700">Suggested Fix</span>
              <p className="text-sm text-blue-600">{categorized.suggestedFix}</p>
            </div>
          </div>
        )}

        {/* Full error details (collapsible) */}
        {categorized.details && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Full Error Details</span>
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="relative mt-2">
                <pre className="p-3 bg-gray-900 text-gray-100 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
                  {categorized.details}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-7 px-2 bg-gray-800 hover:bg-gray-700 text-gray-200"
                  onClick={handleCopy}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Task ID reference */}
        {taskId && (
          <div className="text-xs text-muted-foreground">
            Task ID: <code className="font-mono">{taskId}</code>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Compact error badge for list views
 */
export function ErrorCategoryBadge({ error }: { error: string | null | undefined }) {
  const categorized = useMemo(() => categorizeError(error), [error])

  if (!categorized) return null

  const { label, color, bgColor, icon } = getErrorCategoryInfo(categorized.category)

  return (
    <Badge variant="outline" className={`${bgColor} ${color} border-none text-xs`}>
      <span className="mr-1">{icon}</span>
      {label}
    </Badge>
  )
}
