/**
 * Feasibility Panel Component
 *
 * Displays technical feasibility analysis including:
 * - Feasibility score with progress bar
 * - Complexity level badge
 * - Time estimates (MVP, V1, V2)
 * - Required skills
 * - Risk factors with mitigations
 * - Simplified MVP (if available)
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { IdeaFeasibility } from '@/types/gsd'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code,
  Shield,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeasibilityPanelProps {
  /** Feasibility analysis data */
  feasibility: IdeaFeasibility
  /** Callback to use simplified MVP */
  onUseSimplifiedMvp?: () => void
}

export function FeasibilityPanel({
  feasibility,
  onUseSimplifiedMvp,
}: FeasibilityPanelProps) {
  const {
    feasibilityScore,
    complexityLevel,
    estimatedWeeks,
    requiredSkills,
    riskFactors,
    simplifiedMvp,
  } = feasibility

  // Get color based on score
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600 dark:text-green-400'
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getProgressColor = (score: number) => {
    if (score >= 70) return 'bg-green-500'
    if (score >= 40) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getComplexityBadge = () => {
    switch (complexityLevel) {
      case 'low':
        return <Badge variant="success">Low Complexity</Badge>
      case 'medium':
        return <Badge variant="warning">Medium Complexity</Badge>
      case 'high':
        return <Badge variant="destructive">High Complexity</Badge>
    }
  }

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'Highly Feasible'
    if (score >= 40) return 'Moderately Feasible'
    return 'Challenging'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Code className="h-5 w-5 text-primary" />
            Technical Feasibility
          </span>
          {getComplexityBadge()}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Feasibility</span>
            <span className={cn('text-sm font-bold', getScoreColor(feasibilityScore))}>
              {feasibilityScore}% - {getScoreLabel(feasibilityScore)}
            </span>
          </div>
          <Progress
            value={feasibilityScore}
            className={cn('h-2', getProgressColor(feasibilityScore))}
          />
        </div>

        {/* Time Estimates */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Estimated Timeline
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-2xl font-bold">{estimatedWeeks.mvp}w</div>
              <div className="text-xs text-muted-foreground">MVP</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-2xl font-bold">{estimatedWeeks.v1}w</div>
              <div className="text-xs text-muted-foreground">V1</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <div className="text-2xl font-bold">{estimatedWeeks.v2}w</div>
              <div className="text-xs text-muted-foreground">V2</div>
            </div>
          </div>
        </div>

        {/* Required Skills */}
        {requiredSkills && requiredSkills.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Required Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {requiredSkills.map((skill, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {riskFactors && riskFactors.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Risk Factors
            </h4>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-3">
                {riskFactors.map((factor, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="text-sm font-medium">{factor.risk}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Mitigation:</span> {factor.mitigation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Simplified MVP */}
        {simplifiedMvp && onUseSimplifiedMvp && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Simplified MVP Available
                </h4>
                <p className="text-sm text-muted-foreground">
                  Due to the complexity of this idea, we recommend starting with a simplified
                  version that focuses on core functionality.
                </p>
                <div className="space-y-1">
                  <div className="text-sm font-medium">{simplifiedMvp.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {simplifiedMvp.summary}
                  </div>
                </div>
              </div>
              <button
                onClick={onUseSimplifiedMvp}
                className="flex-shrink-0 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
              >
                Use Simplified
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
