/**
 * Research Summary Component
 *
 * Displays the synthesized SUMMARY.md content from the research phase.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ResearchSynthesis } from '@/types/gsd'
import { FileText, X, Copy, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

interface ResearchSummaryProps {
  /** The research synthesis data */
  synthesis: ResearchSynthesis
  /** Callback to close the summary */
  onClose: () => void
}

export function ResearchSummary({ synthesis, onClose }: ResearchSummaryProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(synthesis.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Research Summary</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Key themes */}
        {synthesis.keyThemes && synthesis.keyThemes.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Key Themes</h4>
            <div className="flex flex-wrap gap-2">
              {synthesis.keyThemes.map((theme, index) => (
                <Badge key={index} variant="secondary">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Files included info */}
        <div className="mb-4 flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Files included: </span>
            <span className="font-medium">{synthesis.filesIncluded}</span>
          </div>
          {synthesis.missingFiles.length > 0 && (
            <div>
              <span className="text-muted-foreground">Missing: </span>
              <span className="font-medium text-yellow-600">{synthesis.missingFiles.length}</span>
            </div>
          )}
        </div>

        {/* Missing files warning */}
        {synthesis.missingFiles.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
              Some research files were not available:
            </p>
            <ul className="text-xs text-yellow-600 dark:text-yellow-400 list-disc list-inside">
              {synthesis.missingFiles.map((file, index) => (
                <li key={index}>{file}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Full summary content */}
        <div>
          <h4 className="text-sm font-medium mb-2">Full Summary (SUMMARY.md)</h4>
          <ScrollArea className="h-[300px] w-full rounded border">
            <pre className="text-xs whitespace-pre-wrap font-mono p-4">{synthesis.content}</pre>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
