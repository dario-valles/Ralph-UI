import { CheckCircle2, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { RalphStory } from '@/types'

export interface StoryCardProps {
  story: RalphStory
  isNext: boolean
  onToggle: () => void
}

export function StoryCard({ story, isNext, onToggle }: StoryCardProps): React.JSX.Element {
  return (
    <div
      className={`p-2 rounded-lg border ${
        story.passes
          ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900'
          : isNext
            ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900'
            : 'bg-card border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <button onClick={onToggle} className="mt-0.5 flex-shrink-0">
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
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  Next
                </Badge>
              )}
            </div>
            <h4
              className={`text-sm font-medium ${story.passes ? 'line-through text-muted-foreground' : ''}`}
            >
              {story.title}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{story.acceptance}</p>
            {story.tags && story.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {story.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {story.effort && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {story.effort}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            P{story.priority}
          </Badge>
        </div>
      </div>
    </div>
  )
}
