/**
 * LearningAnalyticsCard - Displays learning statistics for a PRD
 *
 * US-6.3: Learning Analytics
 *
 * Features:
 * - Learning count by type (Gotcha, Pattern, Architecture, etc.)
 * - Most frequent gotchas with highlight styling
 * - Visual indicators for gotcha frequency
 * - Real-time updates
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  Building2,
  Lightbulb,
  FlaskConical,
  Wrench,
  FileText,
} from 'lucide-react'
import { ralphLoopApi } from '@/lib/backend-api'
import type { LearningType } from '@/types'

interface LearningStats {
  total: number
  byType: Record<LearningType, number>
  topGotchas: Array<{
    content: string
    count: number
    percentage: number
  }>
}

function LearningTypeIcon({
  type,
  className = 'h-4 w-4',
}: {
  type: LearningType
  className?: string
}) {
  switch (type) {
    case 'architecture':
      return <Building2 className={className} />
    case 'gotcha':
      return <AlertTriangle className={className} />
    case 'pattern':
      return <Lightbulb className={className} />
    case 'testing':
      return <FlaskConical className={className} />
    case 'tooling':
      return <Wrench className={className} />
    case 'general':
    default:
      return <FileText className={className} />
  }
}

const LEARNING_TYPE_LABELS: Record<LearningType, string> = {
  architecture: 'Architecture',
  gotcha: 'Gotcha',
  pattern: 'Pattern',
  testing: 'Testing',
  tooling: 'Tooling',
  general: 'General',
}

interface LearningAnalyticsCardProps {
  projectPath: string
  prdName: string
  className?: string
}

export function LearningAnalyticsCard({
  projectPath,
  prdName,
  className = '',
}: LearningAnalyticsCardProps): React.JSX.Element {
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const file = await ralphLoopApi.getLearnings(projectPath, prdName)

      // Calculate stats
      const byType: Record<LearningType, number> = {
        architecture: 0,
        gotcha: 0,
        pattern: 0,
        testing: 0,
        tooling: 0,
        general: 0,
      }

      // Count by type
      file.entries.forEach((entry) => {
        byType[entry.learningType]++
      })

      // Find most frequent gotchas
      const gotchas = file.entries.filter((e) => e.learningType === 'gotcha')
      const gotchaFrequency: Record<string, number> = {}

      gotchas.forEach((gotcha) => {
        gotchaFrequency[gotcha.content] = (gotchaFrequency[gotcha.content] || 0) + 1
      })

      const topGotchas = Object.entries(gotchaFrequency)
        .map(([content, count]) => ({
          content,
          count,
          percentage: (count / (gotchas.length || 1)) * 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3) // Top 3

      setStats({
        total: file.entries.length,
        byType,
        topGotchas,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('Failed to load learning analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [projectPath, prdName])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="text-sm text-destructive">{error}</div>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return (
      <Card className={className}>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Learning Analytics</CardTitle>
            <CardDescription className="text-xs">
              {stats.total} total learnings accumulated
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAnalytics}
            disabled={loading}
            className="h-8 w-8 p-0"
            title="Refresh analytics"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Learning count by type */}
        <div>
          <h4 className="text-sm font-medium mb-2">By Type</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(stats.byType).map(([type, count]) => {
              if (count === 0) return null
              return (
                <div
                  key={type}
                  className="p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <LearningTypeIcon type={type as LearningType} className="h-3 w-3" />
                    <span className="text-xs font-medium">
                      {LEARNING_TYPE_LABELS[type as LearningType]}
                    </span>
                  </div>
                  <div className="text-lg font-bold">{count}</div>
                </div>
              )
            })}
          </div>
          {stats.total === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">No learnings yet</div>
          )}
        </div>

        {/* Most frequent gotchas */}
        {stats.topGotchas.length > 0 && (
          <div className="pt-2 border-t">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Top Gotchas
            </h4>
            <div className="space-y-2">
              {stats.topGotchas.map((gotcha, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-md border-l-2 border-l-destructive bg-destructive/5 hover:bg-destructive/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs text-foreground flex-1">{gotcha.content}</p>
                    <Badge variant="destructive" className="text-xs flex-shrink-0">
                      {gotcha.count}x
                    </Badge>
                  </div>
                  {/* Frequency bar */}
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-destructive rounded-full transition-all"
                      style={{ width: `${gotcha.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
