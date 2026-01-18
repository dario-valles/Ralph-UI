import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle, RefreshCw, Lightbulb, AlertTriangle } from 'lucide-react'
import type { QualityAssessment } from '@/types'
import { cn } from '@/lib/utils'

interface QualityScoreCardProps {
  assessment: QualityAssessment | null
  loading?: boolean
  onRefresh?: () => void
  className?: string
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-100'
  if (score >= 60) return 'bg-yellow-100'
  if (score >= 40) return 'bg-orange-100'
  return 'bg-red-100'
}

function getProgressColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

interface ScoreBarProps {
  label: string
  score: number
}

function ScoreBar({ label, score }: ScoreBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium', getScoreColor(score))}>{score}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-500', getProgressColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

export function QualityScoreCard({
  assessment,
  loading = false,
  onRefresh,
  className,
}: QualityScoreCardProps) {
  if (!assessment) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="h-7 w-7 p-0"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add more content to your conversation to assess PRD quality.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
          <div className="flex items-center gap-2">
            {assessment.readyForExport ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                Ready to export
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Needs more detail
              </Badge>
            )}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="h-7 w-7 p-0"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold',
              getScoreBg(assessment.overall),
              getScoreColor(assessment.overall)
            )}
          >
            {assessment.overall}
          </div>
          <div className="flex-1 space-y-2">
            <ScoreBar label="Completeness" score={assessment.completeness} />
            <ScoreBar label="Clarity" score={assessment.clarity} />
            <ScoreBar label="Actionability" score={assessment.actionability} />
          </div>
        </div>

        {/* Missing Sections */}
        {assessment.missingSections.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Missing Sections
            </div>
            <div className="flex flex-wrap gap-1">
              {assessment.missingSections.map((section, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {section}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {assessment.suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </div>
            <ul className="text-sm space-y-1">
              {assessment.suggestions.slice(0, 3).map((suggestion, idx) => (
                <li key={idx} className="text-muted-foreground">
                  • {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
