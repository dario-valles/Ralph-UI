/**
 * Verification Results Component for GSD Workflow
 *
 * Displays the verification results showing coverage, gaps,
 * and issues with the planning documents.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { VerificationResult, VerificationIssue } from '@/types/planning'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Shield,
} from 'lucide-react'

interface VerificationResultsProps {
  /** Verification result */
  result: VerificationResult
  /** Callback to re-run verification */
  onRerun: () => Promise<void>
  /** Callback when ready to proceed */
  onProceed: () => void
  /** Whether the component is in loading state */
  isLoading?: boolean
}

interface IssueCardProps {
  issue: VerificationIssue
}

function IssueCard({ issue }: IssueCardProps) {
  const getIcon = () => {
    if (issue.severity === 'critical' || issue.severity === 'high') {
      return <XCircle className="h-4 w-4 text-red-500" />
    }
    if (issue.severity === 'medium') {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    }
    return <AlertTriangle className="h-4 w-4 text-muted-foreground" />
  }

  const getBadgeVariant = (): 'destructive' | 'outline' | 'secondary' => {
    if (issue.severity === 'critical' || issue.severity === 'high') {
      return 'destructive'
    }
    if (issue.severity === 'medium') {
      return 'outline'
    }
    return 'secondary'
  }

  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0">
      {getIcon()}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={getBadgeVariant()} className="text-xs">
            {issue.severity}
          </Badge>
          <Badge variant="outline" className="text-xs font-mono">
            {issue.code}
          </Badge>
        </div>
        <p className="text-sm">{issue.message}</p>
        {issue.relatedRequirements && issue.relatedRequirements.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Requirements: <span className="font-mono">{issue.relatedRequirements.join(', ')}</span>
          </p>
        )}
        {issue.suggestion && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            Suggestion: {issue.suggestion}
          </p>
        )}
      </div>
    </div>
  )
}

export function VerificationResults({
  result,
  onRerun,
  onProceed,
  isLoading = false,
}: VerificationResultsProps) {
  const { stats } = result

  // Calculate coverage color
  const coverageColor = useMemo(() => {
    if (result.coveragePercentage >= 100) return 'text-green-600'
    if (result.coveragePercentage >= 80) return 'text-yellow-600'
    return 'text-red-600'
  }, [result.coveragePercentage])

  // Group issues by severity
  const groupedIssues = useMemo(() => {
    const critical = result.issues.filter((i) => i.severity === 'critical' || i.severity === 'high')
    const warnings = result.issues.filter((i) => i.severity === 'medium' || i.severity === 'low')
    return { critical, warnings }
  }, [result.issues])

  const hasBlockingIssues = groupedIssues.critical.length > 0
  const canProceed = result.passed || !hasBlockingIssues

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Plan Verification</CardTitle>
          </div>
          <CardDescription>
            Checking that all requirements are covered and the roadmap is complete.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Overall status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {result.passed ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="text-lg font-semibold">
                  {result.passed ? 'Verification Passed' : 'Issues Found'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {groupedIssues.critical.length} critical, {groupedIssues.warnings.length} warnings
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold ${coverageColor}`}>
                {result.coveragePercentage}%
              </p>
              <p className="text-xs text-muted-foreground">Coverage</p>
            </div>
          </div>
          <Progress value={result.coveragePercentage} className="h-2 mt-4" />
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Requirements</p>
          <p className="text-2xl font-bold">{stats.totalRequirements}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">V1 Scope</p>
          <p className="text-2xl font-bold text-green-600">{stats.v1Count}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">In Roadmap</p>
          <p className="text-2xl font-bold text-blue-600">{stats.inRoadmapCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Not Mapped</p>
          <p className="text-2xl font-bold text-red-600">{stats.notInRoadmapCount}</p>
        </Card>
      </div>

      {/* Additional stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">V2 Scope</p>
              <p className="text-lg font-semibold">{stats.v2Count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Out of Scope</p>
              <p className="text-lg font-semibold">{stats.outOfScopeCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unscoped</p>
              <p className="text-lg font-semibold text-yellow-600">{stats.unscopedCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">With Dependencies</p>
              <p className="text-lg font-semibold">{stats.withDependenciesCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orphaned Deps</p>
              <p className="text-lg font-semibold text-red-600">{stats.orphanedDependencies}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issues */}
      {result.issues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {result.issues.map((issue, index) => (
                <IssueCard key={`${issue.code}-${index}`} issue={issue} />
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Warnings summary */}
      {result.warnings && result.warnings.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-700 dark:text-yellow-300">Warnings</p>
                <ul className="list-disc list-inside mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={onRerun}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Re-run Verification
            </Button>

            <Button
              onClick={onProceed}
              disabled={isLoading || !canProceed}
              className="gap-2"
            >
              {result.passed ? 'Export to Ralph' : 'Proceed Anyway'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {hasBlockingIssues && (
            <p className="text-sm text-red-500 mt-2">
              There are blocking errors that should be resolved before exporting.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
