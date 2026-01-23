/**
 * BriefViewer - Displays the current BRIEF.md for a PRD
 *
 * US-6.1: View Current Brief
 *
 * Features:
 * - Shows rendered BRIEF.md content as markdown
 * - Copy brief to clipboard
 * - Regenerate brief button
 * - Loading and error states
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react'
import { ralphLoopApi } from '@/lib/tauri-api'
import { toast } from '@/stores/toastStore'

interface BriefViewerProps {
  projectPath: string
  prdName: string
  className?: string
}

/** Render markdown content as basic HTML (simple approach) */
function renderMarkdown(content: string): React.JSX.Element {
  const lines = content.split('\n')
  const elements: React.JSX.Element[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-xl font-bold mt-4 mb-2">
          {line.substring(2)}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-bold mt-3 mb-2">
          {line.substring(3)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-bold mt-2 mb-1">
          {line.substring(4)}
        </h3>
      )
    }
    // Bullet lists
    else if (line.startsWith('- ')) {
      elements.push(
        <li key={`li-${i}`} className="ml-4 my-1">
          {line.substring(2)}
        </li>
      )
    }
    // Code blocks
    else if (line.startsWith('```')) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={`code-${i}`} className="bg-muted p-3 rounded my-2 overflow-x-auto text-xs">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
    }
    // Empty lines (create space)
    else if (line.trim() === '') {
      if (elements.length > 0 && elements[elements.length - 1].key !== `empty-${i}`) {
        elements.push(<div key={`empty-${i}`} className="h-1" />)
      }
    }
    // Regular text
    else if (line.trim()) {
      elements.push(
        <p key={`p-${i}`} className="my-1 text-sm">
          {line}
        </p>
      )
    }

    i++
  }

  return <>{elements}</>
}

export function BriefViewer({
  projectPath,
  prdName,
  className = '',
}: BriefViewerProps): React.JSX.Element {
  const [briefContent, setBriefContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadBrief = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const content = await ralphLoopApi.getBrief(projectPath, prdName)
      setBriefContent(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brief')
    } finally {
      setLoading(false)
    }
  }, [projectPath, prdName])

  const handleRegenerate = useCallback(async () => {
    try {
      setRegenerating(true)
      setError(null)
      const content = await ralphLoopApi.regenerateBrief(projectPath, prdName)
      setBriefContent(content)
      toast.success('Brief regenerated successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate brief')
      toast.error('Failed to regenerate brief')
    } finally {
      setRegenerating(false)
    }
  }, [projectPath, prdName])

  const handleCopy = useCallback(async () => {
    if (!briefContent) return

    try {
      await navigator.clipboard.writeText(briefContent)
      setCopied(true)
      toast.success('Brief copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }, [briefContent])

  // Initial load
  useEffect(() => {
    loadBrief()
  }, [loadBrief])

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Current Brief
            </CardTitle>
            <CardDescription className="text-xs">
              BRIEF.md for {prdName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!briefContent || loading}
              className="h-8"
            >
              {copied ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : (
                <Copy className="h-3 w-3 mr-1" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="h-8"
            >
              {regenerating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Regenerate
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading brief...</span>
          </div>
        ) : briefContent ? (
          <ScrollArea className="h-[400px] rounded-md border p-4 bg-muted/30">
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs space-y-2">
              {renderMarkdown(briefContent)}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">No brief available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Run the Ralph Loop to generate a brief
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
