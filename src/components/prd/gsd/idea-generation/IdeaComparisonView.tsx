/**
 * Idea Comparison View Component
 *
 * Displays side-by-side comparison of 2-3 ideas with:
 * - Feature comparison table
 * - Tech stack comparison
 * - Mix-and-match feature selection
 */
import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ValidatedIdea } from '@/types/gsd'
import { ArrowRight, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IdeaComparisonViewProps {
  /** Ideas to compare */
  ideas: ValidatedIdea[]
  /** Callback when user selects an idea */
  onSelectIdea: (idea: ValidatedIdea) => void
  /** Callback to create a custom idea from mixed features */
  onCreateCustomIdea?: (features: string[]) => void
}

export function IdeaComparisonView({
  ideas,
  onSelectIdea,
  onCreateCustomIdea,
}: IdeaComparisonViewProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set())

  const toggleFeature = useCallback((feature: string) => {
    setSelectedFeatures((prev) => {
      const next = new Set(prev)
      if (next.has(feature)) {
        next.delete(feature)
      } else {
        next.add(feature)
      }
      return next
    })
  }, [])

  const getUniqueFeatures = useCallback(() => {
    const featureMap = new Map<string, Set<number>>()
    ideas.forEach((idea, idx) => {
      idea.base.suggestedFeatures.forEach((feature) => {
        if (!featureMap.has(feature)) {
          featureMap.set(feature, new Set())
        }
        featureMap.get(feature)!.add(idx)
      })
    })
    return featureMap
  }, [ideas])

  const uniqueFeatures = getUniqueFeatures()

  const handleCreateCustom = useCallback(() => {
    if (onCreateCustomIdea && selectedFeatures.size > 0) {
      onCreateCustomIdea(Array.from(selectedFeatures))
    }
  }, [selectedFeatures, onCreateCustomIdea])

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Comparison header */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Ideas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Compare these ideas side-by-side to understand the differences. Click on features
            to create a custom mix-and-match idea.
          </p>
        </CardHeader>
      </Card>

      {/* Ideas comparison grid */}
      <ScrollArea className="flex-1 pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideas.map((idea, idx) => (
            <Card
              key={idea.base.id}
              className={cn(
                'flex flex-col',
                idx === 0 && 'border-primary'
              )}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{idea.base.title}</CardTitle>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {idea.base.summary}
                </p>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {/* Context */}
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">What: </span>
                    <span className="text-muted-foreground line-clamp-2">
                      {idea.base.context.what}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Who: </span>
                    <span className="text-muted-foreground">{idea.base.context.who}</span>
                  </div>
                </div>

                {/* Feasibility */}
                {idea.feasibility && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        idea.feasibility.feasibilityScore >= 70
                          ? 'success'
                          : idea.feasibility.feasibilityScore >= 40
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {idea.feasibility.feasibilityScore}% feasible
                    </Badge>
                    <Badge variant="outline">{idea.feasibility.complexityLevel}</Badge>
                  </div>
                )}

                {/* Tech stack */}
                {idea.base.techStack && idea.base.techStack.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Tech Stack</div>
                    <div className="flex flex-wrap gap-1">
                      {idea.base.techStack.map((tech, techIdx) => (
                        <Badge key={techIdx} variant="secondary" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key features */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Key Features</div>
                  <ul className="space-y-1">
                    {idea.base.suggestedFeatures.slice(0, 4).map((feature, featureIdx) => (
                      <li
                        key={featureIdx}
                        className="text-xs flex items-start gap-1.5 text-muted-foreground"
                      >
                        <ArrowRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary" />
                        <span className="line-clamp-1">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Select button */}
                <Button
                  onClick={() => onSelectIdea(idea)}
                  variant={idx === 0 ? 'default' : 'outline'}
                  className="w-full"
                  size="sm"
                >
                  {idx === 0 ? 'Best Match' : 'Select This Idea'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Feature mix-and-match */}
      {onCreateCustomIdea && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mix & Match Features</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select features from any idea to create a custom combination.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[150px] pr-4">
              <div className="space-y-2">
                {Array.from(uniqueFeatures.entries()).map(([feature, ideaIndexes], idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleFeature(feature)}
                    className={`
                      w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all
                      ${
                        selectedFeatures.has(feature)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }
                    `}
                  >
                    <span className="text-sm flex-1">{feature}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from(ideaIndexes).map((ideaIdx) => (
                          <Badge key={ideaIdx} variant="outline" className="text-xs">
                            Idea {ideaIdx + 1}
                          </Badge>
                        ))}
                      </div>
                      {selectedFeatures.has(feature) && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            {selectedFeatures.size > 0 && (
              <Button onClick={handleCreateCustom} className="w-full" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Custom Idea ({selectedFeatures.size} features)
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
