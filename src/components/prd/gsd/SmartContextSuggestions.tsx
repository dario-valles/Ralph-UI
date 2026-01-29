import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Lightbulb, Plus, RefreshCw, AlertCircle } from 'lucide-react'
import type { ProjectType, QuestioningContext } from '@/types/gsd'
import { gsdApi } from '@/lib/api/gsd-api'
import { getErrorInfo } from '@/lib/error-utils'

interface SmartContextSuggestionsProps {
  projectType: ProjectType
  context: QuestioningContext
  missingItem: 'what' | 'why' | 'who' | 'done'
  onAdopt: (suggestion: string) => void
}

export function SmartContextSuggestions({
  projectType,
  context,
  missingItem,
  onAdopt,
}: SmartContextSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSuggestions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await gsdApi.generateContextSuggestions(projectType, context)
      setSuggestions(result[missingItem] || [])
      setHasLoaded(true)
    } catch (err) {
      console.error('Failed to load suggestions:', err)
      const errorInfo = getErrorInfo(err, 'context suggestions')
      setError(errorInfo.message)
    } finally {
      setIsLoading(false)
    }
  }, [projectType, context, missingItem])

  useEffect(() => {
    if (!hasLoaded && !isLoading) {
      loadSuggestions()
    }
  }, [projectType, missingItem, hasLoaded, isLoading, loadSuggestions])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <span>Generating suggestions...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-xs text-destructive" role="alert">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{error}</span>
      </div>
    )
  }

  if (suggestions.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground" id="suggestions-label">
          <Lightbulb className="h-3.5 w-3.5 text-yellow-500" aria-hidden="true" />
          Suggestions for {missingItem}:
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={loadSuggestions}
          aria-label="Refresh suggestions"
          title="Regenerate suggestions"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
      <div
        className="grid gap-2"
        role="listbox"
        aria-labelledby="suggestions-label"
        aria-label={`Suggestions for ${missingItem}`}
      >
        {suggestions.slice(0, 3).map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onAdopt(suggestion)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onAdopt(suggestion)
              }
            }}
            className="text-left text-xs p-2 rounded-md bg-muted/50 hover:bg-muted border border-transparent hover:border-primary/20 transition-all group flex items-start gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            role="option"
            aria-label={`Suggestion ${i + 1}: ${suggestion}`}
            tabIndex={0}
          >
            <Plus className="h-3.5 w-3.5 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1">{suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
