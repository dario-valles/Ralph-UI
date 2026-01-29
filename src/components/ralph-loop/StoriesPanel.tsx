import { StoryCard } from './StoryCard'
import type { RalphStory, RalphPrdStatus } from '@/types'

export interface StoriesPanelProps {
  stories: RalphStory[]
  prdStatus: RalphPrdStatus | null
  onToggleStory: (story: RalphStory) => void
}

export function StoriesPanel({
  stories,
  prdStatus,
  onToggleStory,
}: StoriesPanelProps): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-2 space-y-1.5">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            isNext={prdStatus?.nextStoryId === story.id}
            onToggle={() => onToggleStory(story)}
            allStories={stories}
          />
        ))}
      </div>
    </div>
  )
}
