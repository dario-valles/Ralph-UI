import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'
import type { QualityAssessment } from '@/types'
import { cn } from '@/lib/utils'

interface QualityScoreCardProps {
  assessment: QualityAssessment | null
  loading?: boolean
  onRefresh?: () => void
  className?: string
  /** Render a compact version for smaller spaces */
  compact?: boolean
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-50'
  if (score >= 60) return 'bg-yellow-50'
  if (score >= 40) return 'bg-orange-50'
  return 'bg-red-50'
}

function getProgressColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function getProgressBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100'
  if (score >= 60) return 'bg-yellow-100'
  if (score >= 40) return 'bg-orange-100'
  return 'bg-red-100'
}

interface ScoreBarProps {
  label: string
  shortLabel: string
  score: number
}

function ScoreBar({ label, shortLabel, score }: ScoreBarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-12 shrink-0">
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{shortLabel}</span>
      </span>
      <div className={cn('flex-1 h-1.5 rounded-full overflow-hidden', getProgressBgColor(score))}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', getProgressColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
      <span
        className={cn(
          'text-[11px] font-semibold tabular-nums w-8 text-right shrink-0',
          getScoreColor(score)
        )}
      >
        {score}%
      </span>
    </div>
  )
}

export function QualityScoreCard({
  assessment,
  loading = false,
  onRefresh,
  className,
  compact = false,
}: QualityScoreCardProps) {
  if (!assessment) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className={cn('pb-3', compact && 'py-2.5 px-3')}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Quality Score</h3>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                disabled={loading}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className={cn('pt-0', compact && 'py-2.5 px-3')}>
          <p className="text-sm text-muted-foreground">Add content to assess quality.</p>
        </CardContent>
      </Card>
    )
  }

  // Compact version for sidebar
  if (compact) {
    const hasSuggestions =
      assessment.missingSections.length > 0 || assessment.suggestions.length > 0

    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="py-3 px-3">
          <div className="flex items-center gap-3">
            {/* Score Circle - Smaller */}
            <div
              className={cn(
                'flex items-center justify-center w-11 h-11 rounded-full text-lg font-bold shrink-0 shadow-sm',
                getScoreBg(assessment.overall),
                getScoreColor(assessment.overall)
              )}
            >
              {assessment.overall}
            </div>
            <div className="flex-1 min-w-0">
              {/* Status Badge */}
              {assessment.readyForExport ? (
                <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100 text-[10px] px-1.5 py-0 gap-0.5">
                  <CheckCircle className="h-2.5 w-2.5" />
                  Ready
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 text-[10px] px-1.5 py-0 gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Needs detail
                </Badge>
              )}
              {/* Mini score bars */}
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-5 font-medium">C</span>
                  <div
                    className={cn(
                      'flex-1 h-1 rounded-full overflow-hidden',
                      getProgressBgColor(assessment.completeness)
                    )}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        getProgressColor(assessment.completeness)
                      )}
                      style={{ width: `${assessment.completeness}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-5 font-medium">Cl</span>
                  <div
                    className={cn(
                      'flex-1 h-1 rounded-full overflow-hidden',
                      getProgressBgColor(assessment.clarity)
                    )}
                  >
                    <div
                      className={cn('h-full rounded-full', getProgressColor(assessment.clarity))}
                      style={{ width: `${assessment.clarity}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-5 font-medium">A</span>
                  <div
                    className={cn(
                      'flex-1 h-1 rounded-full overflow-hidden',
                      getProgressBgColor(assessment.actionability)
                    )}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        getProgressColor(assessment.actionability)
                      )}
                      style={{ width: `${assessment.actionability}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRefresh}
                  disabled={loading}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                </Button>
              )}
              {/* Expand button for suggestions */}
              {hasSuggestions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64 p-3" side="left" align="start">
                    {/* Missing Sections */}
                    {assessment.missingSections.length > 0 && (
                      <div className="space-y-2 mb-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
                          <AlertCircle className="h-3 w-3" />
                          Missing Sections
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {assessment.missingSections.map((section, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-[10px] font-normal"
                            >
                              {section}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {assessment.suggestions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                          <Lightbulb className="h-3 w-3" />
                          Suggestions
                        </div>
                        <ul className="space-y-1.5">
                          {assessment.suggestions.slice(0, 3).map((suggestion, idx) => (
                            <li
                              key={idx}
                              className="flex gap-1.5 text-xs text-muted-foreground leading-relaxed"
                            >
                              <span className="text-amber-500 shrink-0">•</span>
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3 px-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Quality</h3>
          {assessment.readyForExport ? (
            <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-100 gap-1 text-[11px] px-1.5 py-0.5">
              <CheckCircle className="h-3 w-3" />
              Ready
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 gap-1 text-[11px] px-1.5 py-0.5">
              <AlertTriangle className="h-3 w-3" />
              Incomplete
            </Badge>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="h-6 w-6 ml-auto text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0 px-4">
        {/* Overall Score with Score Bars */}
        <div className="flex gap-3">
          {/* Score Circle */}
          <div
            className={cn(
              'flex items-center justify-center w-14 h-14 rounded-full text-xl font-bold shrink-0 shadow-sm',
              getScoreBg(assessment.overall),
              getScoreColor(assessment.overall)
            )}
          >
            {assessment.overall}
          </div>
          {/* Score Bars */}
          <div className="flex-1 min-w-0 space-y-2 py-1">
            <ScoreBar label="Complete" shortLabel="Comp" score={assessment.completeness} />
            <ScoreBar label="Clarity" shortLabel="Clear" score={assessment.clarity} />
            <ScoreBar label="Action" shortLabel="Action" score={assessment.actionability} />
          </div>
        </div>

        {/* Missing Sections */}
        {assessment.missingSections.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Missing Sections
            </div>
            <div className="flex flex-wrap gap-1.5">
              {assessment.missingSections.map((section, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs font-normal">
                  {section}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {assessment.suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              Suggestions
            </div>
            <ul className="space-y-1.5">
              {assessment.suggestions.slice(0, 3).map((suggestion, idx) => (
                <li key={idx} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="text-amber-500 shrink-0">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
