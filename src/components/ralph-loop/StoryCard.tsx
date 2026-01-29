import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, X, Lock, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { RalphStory } from '@/types'

export interface StoryCardProps {
  story: RalphStory
  isNext: boolean
  onToggle: () => void
  /** All stories for computing dependents and blocked status */
  allStories?: RalphStory[]
}

export function StoryCard({ story, isNext, onToggle, allStories = [] }: StoryCardProps): React.JSX.Element {
  const [showDetail, setShowDetail] = useState(false)

  // Compute dependents (stories that depend on this one)
  const dependents = useMemo(() => {
    return allStories.filter(s => s.dependencies?.includes(story.id)).map(s => s.id)
  }, [allStories, story.id])

  // Check if this story is blocked (has unfinished dependencies)
  const isBlocked = useMemo(() => {
    if (!story.dependencies?.length) return false
    return story.dependencies.some(depId => {
      const depStory = allStories.find(s => s.id === depId)
      return depStory && !depStory.passes
    })
  }, [story.dependencies, allStories])

  // Check if ready (no deps or all deps satisfied)
  const isReady = useMemo(() => {
    if (story.passes) return false // Already done
    if (!story.dependencies?.length) return true
    return story.dependencies.every(depId => {
      const depStory = allStories.find(s => s.id === depId)
      return depStory?.passes
    })
  }, [story.dependencies, story.passes, allStories])

  // Get names of blocking stories
  const blockingStoryIds = useMemo(() => {
    if (!story.dependencies?.length) return []
    return story.dependencies.filter(depId => {
      const depStory = allStories.find(s => s.id === depId)
      return depStory && !depStory.passes
    })
  }, [story.dependencies, allStories])

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't open modal if clicking the toggle button
    if ((e.target as HTMLElement).closest('button[data-toggle]')) {
      return
    }
    setShowDetail(true)
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className={cn(
          'p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors hover:border-primary/50',
          story.passes && 'bg-green-500/5 border-green-500/30 dark:bg-green-500/10',
          isBlocked && !story.passes && 'bg-red-500/5 border-red-500/30 dark:bg-red-500/10',
          !story.passes &&
            isNext &&
            !isBlocked &&
            'bg-blue-500/5 border-blue-500/30 dark:bg-blue-500/10',
          !story.passes && !isNext && !isBlocked && 'bg-card border-border'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <button
              data-toggle
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="mt-0.5 flex-shrink-0"
            >
              {story.passes ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : isBlocked ? (
                <Lock className="h-4 w-4 text-red-500 dark:text-red-400" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-muted-foreground">{story.id}</span>
                {isBlocked && !story.passes && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
                    Blocked
                  </Badge>
                )}
                {isReady && !story.passes && !isBlocked && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0 h-5">
                    <Check className="h-3 w-3 mr-0.5" />
                    Ready
                  </Badge>
                )}
                {isNext && !story.passes && !isBlocked && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                    Next
                  </Badge>
                )}
              </div>
              <h4
                className={`text-sm font-medium ${story.passes ? 'line-through text-muted-foreground' : ''}`}
              >
                {story.title}
              </h4>
              {/* Blocked by indicator */}
              {isBlocked && blockingStoryIds.length > 0 && (
                <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5">
                  Blocked by: {blockingStoryIds.join(', ')}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {story.acceptance}
              </p>
              {story.tags && story.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {story.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-1">
              {story.effort && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                  {story.effort}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                P{story.priority}
              </Badge>
            </div>
            {/* Dependency indicators */}
            {(story.dependencies?.length > 0 || dependents.length > 0) && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {story.dependencies?.length > 0 && (
                  <Tooltip
                    content={`Depends on: ${story.dependencies.join(', ')}`}
                    side="left"
                  >
                    <span className="flex items-center gap-0.5 cursor-help">
                      <ArrowRight className="h-3 w-3" />
                      {story.dependencies.length}
                    </span>
                  </Tooltip>
                )}
                {dependents.length > 0 && (
                  <Tooltip
                    content={`Blocks: ${dependents.join(', ')}`}
                    side="left"
                  >
                    <span className="flex items-center gap-0.5 cursor-help">
                      <ArrowLeft className="h-3 w-3" />
                      {dependents.length}
                    </span>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Story Detail Modal */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
                {story.passes && (
                  <Badge variant="success">
                    Completed
                  </Badge>
                )}
                {isNext && !story.passes && <Badge variant="secondary">Next</Badge>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowDetail(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogTitle className="text-left">{story.title}</DialogTitle>
            {story.description && (
              <DialogDescription className="text-left">{story.description}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Acceptance Criteria */}
            <div>
              <h4 className="text-sm font-medium mb-1">Acceptance Criteria</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {story.acceptance}
              </p>
            </div>

            {/* Metadata Row */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Priority:</span>
                <Badge variant="outline">P{story.priority}</Badge>
              </div>
              {story.effort && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Effort:</span>
                  <Badge variant="outline">{story.effort}</Badge>
                </div>
              )}
            </div>

            {/* Tags */}
            {story.tags && story.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {story.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {story.dependencies && story.dependencies.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Dependencies</h4>
                <div className="flex flex-wrap gap-1">
                  {story.dependencies.map((dep) => (
                    <Badge key={dep} variant="outline" className="font-mono">
                      {dep}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
