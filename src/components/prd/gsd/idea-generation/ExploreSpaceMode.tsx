/**
 * Explore Space Mode Component
 *
 * Helps users explore a domain to generate ideas.
 * Users specify a domain and interests to get 5 domain-specific ideas.
 */
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IdeaCard } from './IdeaCard'
import type { ValidatedIdea } from '@/types/gsd'
import { Compass, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ExploreSpaceModeProps {
  /** Generated ideas */
  ideas: ValidatedIdea[]
  /** Whether generating */
  isGenerating: boolean
  /** Callback to explore idea space */
  onExploreSpace: (domain: string, interests: string[]) => Promise<void>
  /** Callback when an idea is selected */
  onSelectIdea: (idea: ValidatedIdea) => void
  /** Selected idea ID */
  selectedIdeaId?: string
  /** Error message */
  error?: string
}

// Common domains
const COMMON_DOMAINS = [
  'Developer Tools',
  'Productivity Apps',
  'E-commerce',
  'Social Platforms',
  'Education/Learning',
  'Health/Wellness',
  'Finance/Fintech',
  'Gaming/Entertainment',
  'Content Creation',
  'Data/Analytics',
  'Automation',
  'Sustainability',
  'IoT/Smart Home',
  'Web3/Blockchain',
  'AI/ML Applications',
]

export function ExploreSpaceMode({
  ideas,
  isGenerating,
  onExploreSpace,
  onSelectIdea,
  selectedIdeaId,
  error,
}: ExploreSpaceModeProps) {
  const [domain, setDomain] = useState('')
  const [interests, setInterests] = useState<string[]>([])

  const toggleInterest = useCallback((interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    )
  }, [])

  const handleExplore = useCallback(async () => {
    await onExploreSpace(domain || 'General', interests)
  }, [domain, interests, onExploreSpace])

  const handleSelectIdea = useCallback(
    (idea: ValidatedIdea) => {
      onSelectIdea(idea)
    },
    [onSelectIdea]
  )

  const setDomainFromPreset = useCallback((preset: string) => {
    setDomain(preset)
  }, [])

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Input section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            Explore a Domain
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter a domain you're interested in exploring. We'll generate 5 project ideas
            in that space.
          </p>

          {/* Domain input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Domain</label>
            <Input
              placeholder="e.g., Developer Tools, E-commerce, AI Applications..."
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {COMMON_DOMAINS.map((preset) => (
                <Badge
                  key={preset}
                  variant={domain === preset ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setDomainFromPreset(preset)}
                >
                  {preset}
                </Badge>
              ))}
            </div>
          </div>

          {/* Optional interests */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Specific Interests (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
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
            <Input
              placeholder="Type an interest and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = e.target as HTMLInputElement
                  const value = target.value.trim()
                  if (value && !interests.includes(value)) {
                    setInterests([...interests, value])
                    target.value = ''
                  }
                }
              }}
            />
          </div>

          {/* Explore button */}
          <Button
            onClick={handleExplore}
            disabled={isGenerating || !domain.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exploring...
              </>
            ) : (
              <>
                <Compass className="mr-2 h-4 w-4" />
                Generate 5 Ideas in {domain || 'this Domain'}
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
