import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Sparkles, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestioningContext, ProjectType, ContextQualityReport } from '@/types/gsd'
import { gsdApi } from '@/lib/api/gsd-api'

interface ContextQualityIndicatorProps {
  context: QuestioningContext
  projectType?: ProjectType
  onImprove: (suggestions: string[]) => void
  className?: string
}

export function ContextQualityIndicator({
  context,
  projectType,
  onImprove,
  className,
}: ContextQualityIndicatorProps) {
  const [report, setReport] = useState<ContextQualityReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastAnalyzedContext, setLastAnalyzedContext] = useState<string>('')

  // Debounced analysis
  useEffect(() => {
    const contextStr = JSON.stringify(context)
    if (contextStr === lastAnalyzedContext) return

    // Simple check to avoid analyzing empty context
    const hasContent = Object.values(context).some(
      (v) => typeof v === 'string' && v.trim().length > 10
    )
    if (!hasContent) {
      setReport(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const result = await gsdApi.analyzeContextQuality(context, projectType)
        setReport(result)
        setLastAnalyzedContext(contextStr)
      } catch (err) {
        console.error('Failed to analyze quality:', err)
      } finally {
        setIsLoading(false)
      }
    }, 1000) // 1s debounce

    return () => clearTimeout(timer)
  }, [context, projectType, lastAnalyzedContext])

  if (!report) return null

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500 dark:text-green-400'
    if (score >= 50) return 'text-yellow-500 dark:text-yellow-400'
    return 'text-red-500 dark:text-red-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500 dark:bg-green-600'
    if (score >= 50) return 'bg-yellow-500 dark:bg-yellow-600'
    return 'bg-red-500 dark:bg-red-600'
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="p-3 pb-2 bg-muted/30 dark:bg-muted/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Quality Score
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-bold', getScoreColor(report.overallScore))} aria-live="polite">
              {report.overallScore}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {/* Score Bars */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Specificity</span>
            <span>{report.specificityScore}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted dark:bg-muted/50 rounded-full overflow-hidden" role="progressbar" aria-valuenow={report.specificityScore} aria-valuemin={0} aria-valuemax={100} aria-label="Specificity score">
            <div className={cn('h-full rounded-full transition-all', getScoreBg(report.specificityScore))} style={{ width: `${report.specificityScore}%` }} />
          </div>
        </div>

        {/* Issues */}
        {report.issues.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase">Issues</p>
            <ul className="space-y-1.5" role="list" aria-label="Quality issues">
              {report.issues.slice(0, 3).map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {issue.severity === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : issue.severity === 'warning' ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action */}
        {!report.isGoodEnough && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7 gap-1.5"
            onClick={() => onImprove(report.suggestions)}
            disabled={isLoading}
            aria-label="View improvement suggestions"
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            View Suggestions
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
