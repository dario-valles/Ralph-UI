/**
 * DocumentSectionWarning - Warns users when PRD stories look like document sections
 *
 * This component displays a warning banner when the PRD's "stories" appear to be
 * document section headings (like "Executive Summary", "Problem Statement") rather
 * than actual implementation tasks. It prompts the user to regenerate stories with AI.
 */
import { AlertTriangle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AnalyzePrdStoriesResponse } from '@/types'

export interface DocumentSectionWarningProps {
  analysis: AnalyzePrdStoriesResponse
  onRegenerateStories: () => void
  regenerating?: boolean
}

export function DocumentSectionWarning({
  analysis,
  onRegenerateStories,
  regenerating = false,
}: DocumentSectionWarningProps) {
  const [expanded, setExpanded] = useState(false)

  // Only show if we suggest regeneration
  if (!analysis.suggestRegeneration) {
    return null
  }

  const percentDocSections = Math.round(
    (analysis.documentSectionCount / analysis.totalStories) * 100
  )

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-medium text-amber-800 dark:text-amber-200">
              Document Sections Detected
            </h4>
            <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-500/50">
              {analysis.documentSectionCount} of {analysis.totalStories} ({percentDocSections}%)
            </Badge>
          </div>

          <p className="text-sm text-amber-700 dark:text-amber-300/80 mt-1">
            These stories appear to be PRD document sections (like &quot;Executive Summary&quot; or
            &quot;Problem Statement&quot;) rather than code implementation tasks. The Ralph Loop will
            try to write code for each &quot;story&quot;, which may produce unexpected results.
          </p>

          {/* Expandable list of detected sections */}
          {analysis.documentSectionIds.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Hide detected sections
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Show detected sections ({analysis.documentSectionIds.length})
                  </>
                )}
              </button>

              {expanded && (
                <div className="mt-2 pl-2 border-l-2 border-amber-400/50 space-y-1">
                  {analysis.documentSectionIds.map((id) => (
                    <div
                      key={id}
                      className="text-xs text-amber-600 dark:text-amber-400 font-mono"
                    >
                      {id}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              onClick={onRegenerateStories}
              disabled={regenerating}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {regenerating ? 'Regenerating...' : 'Regenerate with AI'}
            </Button>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Extract proper implementation tasks from the PRD
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
