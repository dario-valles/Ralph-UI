import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  QualityCheck,
  QualityCheckSeverity,
  DetailedQualityAssessment,
  EnhancedQualityCheck,
  EnhancedQualityReport,
  VagueLanguageWarning,
  QualityGrade,
} from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

// =============================================================================
// Props Types
// =============================================================================

interface QualityChecksListProps {
  assessment: DetailedQualityAssessment
  className?: string
  /** Maximum number of checks to show initially (default: 5) */
  initialLimit?: number
  /** Callback when a check is clicked (e.g., to navigate to the issue) */
  onCheckClick?: (check: QualityCheck) => void
}

interface EnhancedQualityChecksListProps {
  report: EnhancedQualityReport
  className?: string
  /** Maximum number of checks to show initially (default: all) */
  initialLimit?: number
  /** Callback when a check is clicked */
  onCheckClick?: (check: EnhancedQualityCheck) => void
}

// =============================================================================
// Grade Colors and Utilities
// =============================================================================

/** Get color classes for quality grade */
function getGradeColors(grade: QualityGrade) {
  switch (grade) {
    case 'EXCELLENT':
      return {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        text: 'text-green-600 dark:text-green-400',
        badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
      }
    case 'GOOD':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-600 dark:text-blue-400',
        badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
      }
    case 'ACCEPTABLE':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-600 dark:text-amber-400',
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
      }
    case 'NEEDS_WORK':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-600 dark:text-red-400',
        badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
      }
  }
}

/** Get grade display label */
function getGradeLabel(grade: QualityGrade): string {
  switch (grade) {
    case 'EXCELLENT':
      return 'Excellent'
    case 'GOOD':
      return 'Good'
    case 'ACCEPTABLE':
      return 'Acceptable'
    case 'NEEDS_WORK':
      return 'Needs Work'
  }
}

// =============================================================================
// Legacy Check Components (for DetailedQualityAssessment)
// =============================================================================

/** Get icon for severity level */
function getSeverityIcon(severity: QualityCheckSeverity) {
  switch (severity) {
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5" />
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5" />
    case 'info':
      return <Info className="h-3.5 w-3.5" />
  }
}

/** Get color classes for severity level */
function getSeverityColors(severity: QualityCheckSeverity) {
  switch (severity) {
    case 'error':
      return {
        badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
        icon: 'text-red-500 dark:text-red-400',
        bg: 'hover:bg-red-500/5 dark:hover:bg-red-500/10',
      }
    case 'warning':
      return {
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: 'text-amber-500 dark:text-amber-400',
        bg: 'hover:bg-amber-500/5 dark:hover:bg-amber-500/10',
      }
    case 'info':
      return {
        badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
        icon: 'text-blue-500 dark:text-blue-400',
        bg: 'hover:bg-blue-500/5 dark:hover:bg-blue-500/10',
      }
  }
}

/** Single quality check item (legacy) */
function QualityCheckItem({
  check,
  onClick,
}: {
  check: QualityCheck
  onClick?: (check: QualityCheck) => void
}) {
  const colors = getSeverityColors(check.severity)

  return (
    <div
      className={cn(
        'p-2.5 rounded-md border border-border/50 transition-colors cursor-default',
        colors.bg,
        onClick && 'cursor-pointer'
      )}
      onClick={() => onClick?.(check)}
    >
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 shrink-0', colors.icon)}>
          {getSeverityIcon(check.severity)}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-foreground">{check.name}</span>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', colors.badge)}>
              {check.severity}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{check.message}</p>
          {check.location && (
            <p className="text-[10px] text-muted-foreground/80 font-mono truncate">
              {check.location}
            </p>
          )}
          {check.suggestion && (
            <p className="text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
              <span className="font-medium text-foreground/80">Fix: </span>
              {check.suggestion}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Summary badges for quality check counts (legacy) */
function QualityChecksSummary({
  errorCount,
  warningCount,
  infoCount,
}: {
  errorCount: number
  warningCount: number
  infoCount: number
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {errorCount > 0 && (
        <Badge
          variant="outline"
          className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 gap-1"
        >
          <AlertCircle className="h-3 w-3" />
          {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
        </Badge>
      )}
      {warningCount > 0 && (
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1"
        >
          <AlertTriangle className="h-3 w-3" />
          {warningCount} {warningCount === 1 ? 'Warning' : 'Warnings'}
        </Badge>
      )}
      {infoCount > 0 && (
        <Badge
          variant="outline"
          className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1"
        >
          <Info className="h-3 w-3" />
          {infoCount} {infoCount === 1 ? 'Suggestion' : 'Suggestions'}
        </Badge>
      )}
      {errorCount === 0 && warningCount === 0 && infoCount === 0 && (
        <Badge variant="success" className="gap-1">
          No issues found
        </Badge>
      )}
    </div>
  )
}

// =============================================================================
// Enhanced Check Components (for EnhancedQualityReport)
// =============================================================================

/** Single enhanced quality check item with pass/fail and score */
function EnhancedCheckItem({
  check,
  onClick,
}: {
  check: EnhancedQualityCheck
  onClick?: (check: EnhancedQualityCheck) => void
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 py-2 px-2.5 rounded-md transition-colors',
        check.passed
          ? 'hover:bg-green-500/5 dark:hover:bg-green-500/10'
          : 'bg-red-500/5 dark:bg-red-500/10 hover:bg-red-500/10 dark:hover:bg-red-500/15',
        onClick && 'cursor-pointer'
      )}
      onClick={() => onClick?.(check)}
    >
      {/* Pass/Fail Icon */}
      {check.passed ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
      )}

      {/* Check Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-xs font-medium',
              check.passed ? 'text-foreground' : 'text-red-600 dark:text-red-400'
            )}
          >
            {check.name}
          </span>
          <span
            className={cn(
              'text-[10px] font-semibold shrink-0',
              check.passed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
            )}
          >
            {check.score}/{check.maxScore}
          </span>
        </div>

        <p
          className={cn(
            'text-xs',
            check.passed ? 'text-muted-foreground' : 'text-red-600/80 dark:text-red-400/80'
          )}
        >
          {check.message}
        </p>

        {check.location && (
          <p className="text-[10px] text-muted-foreground/80 font-mono truncate">
            {check.location}
          </p>
        )}

        {!check.passed && check.suggestion && (
          <p className="text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
            <span className="font-medium text-amber-600 dark:text-amber-400">Fix: </span>
            {check.suggestion}
          </p>
        )}
      </div>
    </div>
  )
}

/** Vague language warning item */
function VagueWarningItem({ warning }: { warning: VagueLanguageWarning }) {
  return (
    <div className="flex items-start gap-2 py-2 px-2.5 rounded-md bg-amber-500/5 dark:bg-amber-500/10">
      <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300">
            &quot;{warning.term}&quot;
          </code>
          <span className="text-[10px] text-muted-foreground">in {warning.location}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-amber-600 dark:text-amber-400">Suggestion: </span>
          {warning.suggestion}
        </p>
      </div>
    </div>
  )
}

/** Enhanced summary showing passed/total and grade */
function EnhancedChecksSummary({
  passedCount,
  totalChecks,
  percentage,
  grade,
  vagueWarningsCount,
}: {
  passedCount: number
  totalChecks: number
  percentage: number
  grade: QualityGrade
  vagueWarningsCount: number
}) {
  const gradeColors = getGradeColors(grade)

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Passed count badge */}
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5',
            passedCount === totalChecks
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
              : passedCount >= totalChecks * 0.75
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                : passedCount >= totalChecks * 0.5
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
          )}
        >
          <CheckCircle2 className="h-3 w-3" />
          {passedCount}/{totalChecks} checks passed
        </Badge>

        {/* Vague warnings count */}
        {vagueWarningsCount > 0 && (
          <Badge
            variant="outline"
            className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
          >
            <AlertTriangle className="h-3 w-3" />
            {vagueWarningsCount} vague {vagueWarningsCount === 1 ? 'term' : 'terms'}
          </Badge>
        )}
      </div>

      {/* Grade badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('font-semibold', gradeColors.badge)}>
          {getGradeLabel(grade)}
        </Badge>
        <span className={cn('text-sm font-bold', gradeColors.text)}>{percentage}%</span>
      </div>
    </div>
  )
}

// =============================================================================
// Main Components
// =============================================================================

/** Legacy quality checks list (for DetailedQualityAssessment) */
export function QualityChecksList({
  assessment,
  className,
  initialLimit = 5,
  onCheckClick,
}: QualityChecksListProps) {
  const [expanded, setExpanded] = useState(false)

  const { qualityChecks, errorCount, warningCount, infoCount } = assessment

  // Sort checks by severity (errors first, then warnings, then info)
  const sortedChecks = [...qualityChecks].sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })

  const displayedChecks = expanded ? sortedChecks : sortedChecks.slice(0, initialLimit)
  const hasMore = sortedChecks.length > initialLimit

  if (qualityChecks.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        <QualityChecksSummary
          errorCount={errorCount}
          warningCount={warningCount}
          infoCount={infoCount}
        />
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary badges */}
      <QualityChecksSummary
        errorCount={errorCount}
        warningCount={warningCount}
        infoCount={infoCount}
      />

      {/* Check items */}
      <div className="space-y-2">
        {displayedChecks.map((check, idx) => (
          <QualityCheckItem key={`${check.id}-${idx}`} check={check} onClick={onCheckClick} />
        ))}
      </div>

      {/* Show more/less button */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              Show {sortedChecks.length - initialLimit} more
            </>
          )}
        </Button>
      )}
    </div>
  )
}

/** Enhanced quality checks list (for EnhancedQualityReport with 13 checks) */
export function EnhancedQualityChecksList({
  report,
  className,
  onCheckClick,
}: Omit<EnhancedQualityChecksListProps, 'initialLimit'>) {
  const [showAllChecks, setShowAllChecks] = useState(false)
  const [showVagueWarnings, setShowVagueWarnings] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const { checks, vagueWarnings, passedCount, totalChecks, percentage, grade, readyForExport } =
    report

  // Separate passed and failed checks
  const failedChecks = checks.filter((c) => !c.passed)
  const passedChecks = checks.filter((c) => c.passed)

  // Determine which checks to display
  const displayedFailedChecks = failedChecks
  const displayedPassedChecks = showAllChecks ? passedChecks : passedChecks.slice(0, 3)
  const hasMorePassed = passedChecks.length > 3

  // Get checks with suggestions (failed checks that have suggestions)
  const checksWithSuggestions = failedChecks.filter((c) => c.suggestion)

  const gradeColors = getGradeColors(grade)

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={cn('h-4 w-4', gradeColors.text)} />
            <h3 className="text-sm font-semibold text-foreground">Quality Validation</h3>
          </div>
          {readyForExport && (
            <Badge variant="success" className="text-xs">
              Ready for Export
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0 px-4 pb-3">
        {/* Summary */}
        <EnhancedChecksSummary
          passedCount={passedCount}
          totalChecks={totalChecks}
          percentage={percentage}
          grade={grade}
          vagueWarningsCount={vagueWarnings.length}
        />

        {/* Failed checks (always shown) */}
        {failedChecks.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              Issues to Fix ({failedChecks.length})
            </span>
            <div className="space-y-1">
              {displayedFailedChecks.map((check) => (
                <EnhancedCheckItem key={check.id} check={check} onClick={onCheckClick} />
              ))}
            </div>
          </div>
        )}

        {/* Passed checks (collapsible) */}
        {passedChecks.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Passing ({passedChecks.length})
            </span>
            <div className="space-y-1">
              {displayedPassedChecks.map((check) => (
                <EnhancedCheckItem key={check.id} check={check} onClick={onCheckClick} />
              ))}
            </div>
            {hasMorePassed && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground p-1 h-auto"
                onClick={() => setShowAllChecks(!showAllChecks)}
              >
                {showAllChecks ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" />
                    Hide passing checks
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    Show {passedChecks.length - 3} more passing
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Vague language warnings (collapsible) */}
        {vagueWarnings.length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 p-1 h-auto justify-start"
              onClick={() => setShowVagueWarnings(!showVagueWarnings)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Vague Language Warnings ({vagueWarnings.length})
              {showVagueWarnings ? (
                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              )}
            </Button>
            {showVagueWarnings && (
              <div className="space-y-1.5 mt-2">
                {vagueWarnings.map((warning, idx) => (
                  <VagueWarningItem key={`${warning.term}-${idx}`} warning={warning} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fix suggestions (collapsible) */}
        {checksWithSuggestions.length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 p-1 h-auto justify-start"
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
              Fix Suggestions ({checksWithSuggestions.length})
              {showSuggestions ? (
                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              )}
            </Button>
            {showSuggestions && (
              <div className="space-y-2 mt-2">
                {checksWithSuggestions.map((check) => (
                  <div
                    key={check.id}
                    className="p-2.5 rounded-md bg-blue-500/5 dark:bg-blue-500/10 space-y-1"
                  >
                    <span className="text-xs font-medium text-foreground">{check.name}</span>
                    <p className="text-xs text-blue-600 dark:text-blue-400">{check.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary message */}
        <div
          className={cn(
            'p-2.5 rounded-md text-xs text-center',
            gradeColors.bg,
            gradeColors.border,
            'border'
          )}
        >
          <span className={gradeColors.text}>{report.summary}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export { QualityChecksSummary, EnhancedChecksSummary }
