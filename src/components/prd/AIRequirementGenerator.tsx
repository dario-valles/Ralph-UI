/**
 * AI Requirement Generator Component
 *
 * A collapsible panel that allows users to describe requirements in natural
 * language and have AI generate structured requirements.
 */

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, ChevronDown, ChevronUp, Wand2 } from 'lucide-react'
import type { GeneratedRequirement, GenerateRequirementsResult } from '@/types/gsd'
import { GeneratedRequirementPreview } from './GeneratedRequirementPreview'

interface AIRequirementGeneratorProps {
  onGenerate: (prompt: string, count?: number) => Promise<GenerateRequirementsResult>
  onAcceptRequirements: (requirements: GeneratedRequirement[]) => Promise<void>
  isGenerating?: boolean
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'An unexpected error occurred'
}

export function AIRequirementGenerator({
  onGenerate,
  onAcceptRequirements,
  isGenerating = false,
}: AIRequirementGeneratorProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [generatedRequirements, setGeneratedRequirements] = useState<GeneratedRequirement[] | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const resetState = useCallback(() => {
    setGeneratedRequirements(null)
    setError(null)
    setPrompt('')
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return

    setError(null)
    try {
      const result = await onGenerate(prompt)
      setGeneratedRequirements(result.requirements)
    } catch (e) {
      setError(getErrorMessage(e))
      setGeneratedRequirements(null)
    }
  }, [prompt, onGenerate])

  const handleRegenerate = useCallback(async () => {
    setGeneratedRequirements(null)
    await handleGenerate()
  }, [handleGenerate])

  const handleAccept = useCallback(
    async (selectedRequirements: GeneratedRequirement[]) => {
      if (selectedRequirements.length === 0) return

      setIsAdding(true)
      setError(null)
      try {
        await onAcceptRequirements(selectedRequirements)
        resetState()
        setIsExpanded(false)
      } catch (e) {
        setError(getErrorMessage(e))
      } finally {
        setIsAdding(false)
      }
    },
    [onAcceptRequirements, resetState]
  )

  const handleCancel = useCallback(() => {
    setGeneratedRequirements(null)
    setError(null)
  }, [])

  const handleClose = useCallback(() => {
    setIsExpanded(false)
    resetState()
  }, [resetState])

  return (
    <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Generate Requirements with AI</CardTitle>
            <Badge variant="secondary" className="text-xs">
              Beta
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        {!isExpanded && (
          <CardDescription>
            Describe what you need in plain English and let AI generate structured requirements
          </CardDescription>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Show preview if we have generated requirements */}
          {generatedRequirements ? (
            <GeneratedRequirementPreview
              requirements={generatedRequirements}
              onAccept={handleAccept}
              onRegenerate={handleRegenerate}
              onCancel={handleCancel}
              isRegenerating={isGenerating}
              isAdding={isAdding}
            />
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Describe what you need:</label>
                <Textarea
                  placeholder='e.g., "User authentication with OAuth, password reset, and MFA support" or "A dashboard showing key metrics with filtering and export capabilities"'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="resize-none"
                  disabled={isGenerating}
                />
                <p className="text-xs text-muted-foreground">
                  AI will generate 3-15 structured requirements based on your description
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Generate Requirements
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
