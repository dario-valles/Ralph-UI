/**
 * Idea Card Component
 *
 * Displays a validated idea with key information including:
 * - Title and summary
 * - Feasibility score (color-coded)
 * - Difficulty badge
 * - Estimated MVP time
 * - Tech stack badges
 * - "Use This Idea" button
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ValidatedIdea } from '@/types/gsd'
import {
  Clock,
  Check,
  AlertCircle,
  TrendingUp,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface IdeaCardProps {
  /** The idea to display */
  idea: ValidatedIdea
  /** Whether this idea is selected */
  isSelected?: boolean
  /** Callback when "Use This Idea" is clicked */
  onSelect: () => void
  /** Callback to validate feasibility */
  onValidateFeasibility?: () => void
  /** Callback to analyze market */
  onAnalyzeMarket?: () => void
  /** Whether validation is in progress */
  isValidating?: boolean
  /** Compact display mode */
  compact?: boolean
}

export function IdeaCard({
  idea,
  isSelected = false,
  onSelect,
  onValidateFeasibility,
  onAnalyzeMarket,
  isValidating = false,
  compact = false,
}: IdeaCardProps) {
  const { base, feasibility, market } = idea

  // Get feasibility score color
  const getFeasibilityColor = (score?: number) => {
    if (!score) return 'text-muted-foreground'
    if (score >= 70) return 'text-green-600 dark:text-green-400'
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getFeasibilityBgColor = (score?: number) => {
    if (!score) return 'bg-muted/30'
    if (score >= 70) return 'bg-green-500/5 border-green-500/30'
    if (score >= 40) return 'bg-yellow-500/5 border-yellow-500/30'
    return 'bg-red-500/5 border-red-500/30'
  }

  const getComplexityBadge = (level?: string) => {
    switch (level) {
      case 'low':
        return <Badge variant="success">Low Complexity</Badge>
      case 'medium':
        return <Badge variant="warning">Medium Complexity</Badge>
      case 'high':
        return <Badge variant="destructive">High Complexity</Badge>
      default:
        return null
    }
  }

  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        isSelected && 'ring-2 ring-primary',
        getFeasibilityBgColor(feasibility?.feasibilityScore)
      )}
    >
      <CardHeader className={cn(compact && 'pb-2')}>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className={cn(compact && 'text-base', 'flex-1')}>
            {base.title}
          </CardTitle>
          {feasibility && (
            <div
              className={cn(
                'flex items-center gap-1 text-sm font-medium',
                getFeasibilityColor(feasibility.feasibilityScore)
              )}
            >
              <TrendingUp className="h-4 w-4" />
              {feasibility.feasibilityScore}%
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{base.summary}</p>
      </CardHeader>

      {!compact && (
        <CardContent className="space-y-4">
          {/* Context preview */}
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-medium">What: </span>
              <span className="text-muted-foreground">{base.context.what}</span>
            </div>
            <div>
              <span className="font-medium">Why: </span>
              <span className="text-muted-foreground">{base.context.why}</span>
            </div>
            <div>
              <span className="font-medium">Who: </span>
              <span className="text-muted-foreground">{base.context.who}</span>
            </div>
          </div>

          {/* Features */}
          {base.suggestedFeatures && base.suggestedFeatures.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Key Features</h4>
              <ul className="space-y-1">
                {base.suggestedFeatures.slice(0, 3).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feasibility info */}
          {feasibility && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {getComplexityBadge(feasibility.complexityLevel)}
                {feasibility.estimatedWeeks && (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    MVP: {feasibility.estimatedWeeks.mvp}w
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Tech stack */}
          {base.techStack && base.techStack.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {base.techStack.map((tech, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {tech}
                </Badge>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={onSelect} className="flex-1" size="sm">
              {isSelected ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Selected
                </>
              ) : (
                <>
                  Use This Idea
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            {onValidateFeasibility && !feasibility && (
              <Button
                onClick={onValidateFeasibility}
                variant="outline"
                size="sm"
                disabled={isValidating}
              >
                {isValidating ? (
                  <>Analyzing...</>
                ) : (
                  <>
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Check Feasibility
                  </>
                )}
              </Button>
            )}
            {onAnalyzeMarket && !market && (
              <Button
                onClick={onAnalyzeMarket}
                variant="outline"
                size="sm"
                disabled={isValidating}
              >
                {isValidating ? (
                  <>Analyzing...</>
                ) : (
                  'Market Analysis'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      )}

      {/* Compact mode - just the select button */}
      {compact && (
        <CardContent className="pt-2">
          <Button onClick={onSelect} className="w-full" size="sm" variant="outline">
            {isSelected ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Selected
              </>
            ) : (
              <>
                Use This Idea
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
