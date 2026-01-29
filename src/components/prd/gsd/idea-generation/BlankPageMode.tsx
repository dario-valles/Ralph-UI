/**
 * Blank Page Mode Component
 *
 * Helps users generate ideas from their interests when they have
 * "blank page anxiety". Users select interests and generate 5 ideas.
 */
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IdeaCard } from './IdeaCard'
import type { ValidatedIdea, ProjectType } from '@/types/gsd'
import { Sparkles, Loader2, X } from 'lucide-react'

interface BlankPageModeProps {
  /** Project type for generating relevant ideas */
  projectType: ProjectType
  /** Generated ideas */
  ideas: ValidatedIdea[]
  /** Whether ideas are being generated */
  isGenerating: boolean
  /** Callback to generate ideas */
  onGenerate: () => Promise<void>
  /** Callback when an idea is selected */
  onSelectIdea: (idea: ValidatedIdea) => void
  /** Selected idea ID */
  selectedIdeaId?: string
  /** Error message */
  error?: string
}

// Common interest categories
const INTEREST_CATEGORIES = [
  'AI/Machine Learning',
  'Developer Tools',
  'Productivity',
  'E-commerce',
  'Social/Community',
  'Education',
  'Health/Wellness',
  'Finance',
  'Gaming',
  'Content Creation',
  'Data/Analytics',
  'Automation',
  'Mobile Apps',
  'Web Apps',
  'Open Source',
  'SaaS/B2B',
  'Consumer Apps',
  'Sustainability',
  'IoT/Hardware',
  'Blockchain/Web3',
]

export function BlankPageMode({
  projectType,
  ideas,
  isGenerating,
  onGenerate,
  onSelectIdea,
  selectedIdeaId,
  error,
}: BlankPageModeProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  const toggleInterest = useCallback((interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    )
  }, [])

  const handleGenerate = useCallback(async () => {
    // Update context notes with selected interests
    await onGenerate()
  }, [onGenerate])

  const handleSelectIdea = useCallback(
    (idea: ValidatedIdea) => {
      onSelectIdea(idea)
    },
    [onSelectIdea]
  )

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Ideas from Your Interests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select topics that interest you. We'll generate 5 project ideas tailored to your
            interests and the {projectType.replace('_', ' ')} project type.
          </p>

          {/* Interest selection */}
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Selected Interests ({selectedInterests.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedInterests.map((interest) => (
                <Badge
                  key={interest}
                  variant="default"
                  className="gap-1.5 cursor-pointer"
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          </div>

          {/* Available interests */}
          <ScrollArea className="h-[200px] pr-4">
            <div className="flex flex-wrap gap-2">
              {INTEREST_CATEGORIES.filter(
                (i) => !selectedInterests.includes(i)
              ).map((interest) => (
                <Badge
                  key={interest}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleInterest(interest)}
                >
                  + {interest}
                </Badge>
              ))}
            </div>
          </ScrollArea>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || selectedInterests.length === 0}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Ideas...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate 5 Ideas
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

      {/* Generated ideas */}
      {ideas.length > 0 && (
        <ScrollArea className="flex-1 pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.base.id}
                idea={idea}
                isSelected={idea.base.id === selectedIdeaId}
                onSelect={() => handleSelectIdea(idea)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
