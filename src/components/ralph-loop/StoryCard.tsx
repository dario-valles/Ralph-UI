import { useState } from 'react'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { RalphStory } from '@/types'

export interface StoryCardProps {
  story: RalphStory
  isNext: boolean
  onToggle: () => void
}

export function StoryCard({ story, isNext, onToggle }: StoryCardProps): React.JSX.Element {
  const [showDetail, setShowDetail] = useState(false)

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
          !story.passes &&
            isNext &&
            'bg-blue-500/5 border-blue-500/30 dark:bg-blue-500/10',
          !story.passes && !isNext && 'bg-card border-border'
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
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{story.id}</span>
                {isNext && !story.passes && (
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
          <div className="flex items-center gap-1 flex-shrink-0">
            {story.effort && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                {story.effort}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              P{story.priority}
            </Badge>
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
