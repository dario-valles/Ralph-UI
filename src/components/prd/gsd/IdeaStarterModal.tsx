import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, ArrowRight, Check, AlertCircle } from 'lucide-react'
import type { GeneratedIdea, ProjectType, QuestioningContext } from '@/types/gsd'
import { gsdApi } from '@/lib/api/gsd-api'
import { getErrorInfo, retryWithBackoff } from '@/lib/error-utils'

interface IdeaStarterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectType: ProjectType
  currentContext: QuestioningContext
  onSelect: (idea: GeneratedIdea) => void
}

export function IdeaStarterModal({
  open,
  onOpenChange,
  projectType,
  currentContext,
  onSelect,
}: IdeaStarterModalProps) {
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const generateIdeas = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await retryWithBackoff(() => gsdApi.generateIdeaStarters(projectType, currentContext))
      setIdeas(result)
      setHasLoaded(true)
    } catch (err) {
      console.error('Failed to generate ideas:', err)
      const errorInfo = getErrorInfo(err, 'idea generation')
      setError(errorInfo.message)
    } finally {
      setIsLoading(false)
    }
  }, [projectType, currentContext])

  // Generate on open if not loaded
  if (open && !hasLoaded && !isLoading && !error) {
    generateIdeas()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" aria-describedby="idea-starter-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" aria-hidden="true" />
            Project Idea Starters
          </DialogTitle>
          <DialogDescription id="idea-starter-description">
            Here are some concrete project ideas based on your type and context. Select one to
            pre-fill your questioning answers.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" aria-hidden="true" />
              <p>Brainstorming ideas with AI...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive" role="alert" aria-live="assertive">
              <div className="flex items-center justify-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                <p className="font-medium">Error</p>
              </div>
              <p className="text-sm mb-4">{error}</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={generateIdeas} aria-label="Retry generating ideas">
                  Try Again
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="listbox" aria-label="Project ideas">
              {ideas.map((idea) => (
                <Card
                  key={idea.id}
                  className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => onSelect(idea)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(idea)
                    }
                  }}
                  tabIndex={0}
                  role="option"
                  aria-label={`Idea: ${idea.title}. ${idea.summary}`}
                  aria-describedby={`idea-${idea.id}-desc`}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">
                      {idea.title}
                    </CardTitle>
                    <CardDescription id={`idea-${idea.id}-desc`} className="line-clamp-2">
                      {idea.summary}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {idea.techStack && (
                      <div className="flex flex-wrap gap-1" role="list" aria-label={`Technologies for ${idea.title}`}>
                        {idea.techStack.map((tech) => (
                          <Badge key={tech} variant="secondary" className="text-[10px]" role="listitem">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Key Features:</p>
                      <ul className="text-sm space-y-1" aria-label={`Features of ${idea.title}`}>
                        {idea.suggestedFeatures.slice(0, 3).map((feature, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" aria-hidden="true" />
                            <span className="text-xs text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      variant="ghost"
                      className="w-full justify-between group-hover:bg-primary/5"
                      aria-label={`Use "${idea.title}" idea`}
                    >
                      Use This Idea
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
