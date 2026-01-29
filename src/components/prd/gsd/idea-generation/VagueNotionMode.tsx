/**
 * Vague Notion Mode Component
 *
 * Helps users explore variations of a vague concept.
 * Users can vary along dimensions like target user, tech stack, features, etc.
 */
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IdeaCard } from './IdeaCard'
import type {
  ValidatedIdea,
  QuestioningContext,
  VariationDimension,
} from '@/types/gsd'
import { Shuffle, Loader2, Check } from 'lucide-react'

interface VagueNotionModeProps {
  /** Current questioning context */
  context: QuestioningContext
  /** Generated variations */
  ideas: ValidatedIdea[]
  /** Whether generating */
  isGenerating: boolean
  /** Variation dimensions */
  variationDimensions: VariationDimension[]
  /** Callback to generate variations */
  onGenerateVariations: (
    context: QuestioningContext,
    dimensions: VariationDimension[]
  ) => Promise<void>
  /** Callback when an idea is selected */
  onSelectIdea: (idea: ValidatedIdea) => void
  /** Selected idea ID */
  selectedIdeaId?: string
  /** Error message */
  error?: string
}

const DIMENSION_OPTIONS: Array<{
  value: VariationDimension
  label: string
  description: string
}> = [
  {
    value: 'target_user',
    label: 'Target User',
    description: 'Different user segments and audiences',
  },
  {
    value: 'tech_stack',
    label: 'Tech Stack',
    description: 'Different technology approaches',
  },
  {
    value: 'features',
    label: 'Features',
    description: 'Different feature focuses',
  },
  {
    value: 'business_model',
    label: 'Business Model',
    description: 'Different monetization approaches',
  },
  {
    value: 'platform',
    label: 'Platform',
    description: 'Web, mobile, desktop, CLI',
  },
]

export function VagueNotionMode({
  context,
  ideas,
  isGenerating,
  variationDimensions,
  onGenerateVariations,
  onSelectIdea,
  selectedIdeaId,
  error,
}: VagueNotionModeProps) {
  const [vagueInput, setVagueInput] = useState(context.what || '')
  const [selectedDimensions, setSelectedDimensions] = useState<VariationDimension[]>(
    variationDimensions
  )

  const toggleDimension = useCallback((dimension: VariationDimension) => {
    setSelectedDimensions((prev) =>
      prev.includes(dimension)
        ? prev.filter((d) => d !== dimension)
        : [...prev, dimension]
    )
  }, [])

  const handleGenerate = useCallback(async () => {
    const updatedContext: QuestioningContext = {
      ...context,
      what: vagueInput || context.what,
    }
    await onGenerateVariations(updatedContext, selectedDimensions)
  }, [vagueInput, context, selectedDimensions, onGenerateVariations])

  const handleSelectIdea = useCallback(
    (idea: ValidatedIdea) => {
      onSelectIdea(idea)
    },
    [onSelectIdea]
  )

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Input section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            Explore Variations of Your Idea
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Describe your vague concept below, and we'll generate variations along
            different dimensions to help you explore possibilities.
          </p>

          {/* Vague input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Idea (vague is OK!)</label>
            <Textarea
              placeholder="Something like Trello but for remote teams... A tool that helps developers write better documentation... An app for tracking habits..."
              value={vagueInput}
              onChange={(e) => setVagueInput(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Dimension selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              What to vary? (select {selectedDimensions.length > 0 ? selectedDimensions.length : 0})
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DIMENSION_OPTIONS.map((dim) => (
                <button
                  key={dim.value}
                  onClick={() => toggleDimension(dim.value)}
                  className={`
                    flex flex-col items-start p-3 rounded-lg border text-left transition-all
                    ${
                      selectedDimensions.includes(dim.value)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-sm">{dim.label}</span>
                    {selectedDimensions.includes(dim.value) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {dim.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !vagueInput.trim() || selectedDimensions.length === 0}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Variations...
              </>
            ) : (
              <>
                <Shuffle className="mr-2 h-4 w-4" />
                Generate {selectedDimensions.length} Variations
              </>
            )}
          </Button>

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated variations */}
      {ideas.length > 0 && (
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {ideas.length} Variation{ideas.length !== 1 ? 's' : ''} Generated
              </h3>
              <Badge variant="secondary">
                Along: {selectedDimensions.map((d) => d.replace('_', ' ')).join(', ')}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {ideas.map((idea) => (
                <IdeaCard
                  key={idea.base.id}
                  idea={idea}
                  isSelected={idea.base.id === selectedIdeaId}
                  onSelect={() => handleSelectIdea(idea)}
                />
              ))}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
