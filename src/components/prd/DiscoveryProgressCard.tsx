import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiscoveryProgress, DiscoveryCategory, DiscoveryQuestion } from '@/types'
import { DISCOVERY_QUESTIONS, getQuestionsByCategory } from '@/types/prd'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** Get list of missing discovery areas that still need coverage */
function getMissingAreas(progress: DiscoveryProgress | null): string[] {
  if (!progress) return ['WHAT', 'WHO', 'WHY', 'DONE']
  const missing: string[] = []
  if (!progress.problemCovered) missing.push('WHAT')
  if (!progress.usersCovered) missing.push('WHO')
  if (!progress.motivationCovered) missing.push('WHY')
  if (!progress.successCovered) missing.push('DONE')
  return missing
}

interface DiscoveryProgressCardProps {
  progress?: DiscoveryProgress | null
  className?: string
  /** Compact mode for sidebar display */
  compact?: boolean
  /** Show individual questions (expanded mode) */
  showQuestions?: boolean
  /** IDs of questions that have been answered */
  answeredQuestionIds?: string[]
}

interface ProgressItemProps {
  label: string
  shortLabel: string
  covered: boolean
  optional?: boolean
  compact?: boolean
}

function ProgressItem({ label, shortLabel, covered, optional, compact }: ProgressItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2',
        compact && 'gap-1.5',
        optional && !covered && 'opacity-60'
      )}
    >
      {covered ? (
        <CheckCircle2 className={cn('h-4 w-4 text-green-500', compact && 'h-3 w-3')} />
      ) : (
        <Circle className={cn('h-4 w-4 text-muted-foreground/50', compact && 'h-3 w-3')} />
      )}
      <span
        className={cn(
          'text-sm',
          compact && 'text-xs',
          covered ? 'text-foreground' : 'text-muted-foreground',
          optional && !covered && 'italic'
        )}
      >
        {compact ? shortLabel : label}
        {optional && !covered && !compact && ' (optional)'}
      </span>
    </div>
  )
}

/** Question item with answered/unanswered state */
function QuestionItem({
  question,
  answered,
  isNext,
}: {
  question: DiscoveryQuestion
  answered: boolean
  isNext: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors',
        isNext && !answered && 'bg-amber-500/10 border border-amber-500/30',
        answered && 'opacity-70'
      )}
    >
      {answered ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
      ) : (
        <Circle
          className={cn(
            'h-3.5 w-3.5 mt-0.5 shrink-0',
            isNext ? 'text-amber-500' : 'text-muted-foreground/50'
          )}
        />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn('text-xs', answered ? 'text-muted-foreground' : 'text-foreground', 'leading-snug')}
        >
          {question.question}
        </p>
        {!answered && isNext && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 italic">
            {question.followUpHint}
          </p>
        )}
      </div>
      {question.required && !answered && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
          Required
        </Badge>
      )}
    </div>
  )
}

/** Category section with questions */
function CategorySection({
  label,
  questions,
  answeredIds,
  nextQuestionId,
}: {
  category: DiscoveryCategory // Kept for potential future use
  label: string
  questions: DiscoveryQuestion[]
  answeredIds: Set<string>
  nextQuestionId?: string
}) {
  const answeredCount = questions.filter((q) => answeredIds.has(q.id)).length
  const totalCount = questions.length

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span
          className={cn(
            'text-xs font-semibold',
            answeredCount === totalCount
              ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
          )}
        >
          {answeredCount}/{totalCount}
        </span>
      </div>
      <div className="space-y-0.5">
        {questions.map((q) => (
          <QuestionItem
            key={q.id}
            question={q}
            answered={answeredIds.has(q.id)}
            isNext={q.id === nextQuestionId}
          />
        ))}
      </div>
    </div>
  )
}

export function DiscoveryProgressCard({
  progress,
  className,
  compact = false,
  showQuestions = false,
  answeredQuestionIds = [],
}: DiscoveryProgressCardProps) {
  const [expanded, setExpanded] = useState(showQuestions)

  // Default to empty progress if not provided
  const p = progress ?? {
    problemCovered: false,
    usersCovered: false,
    motivationCovered: false,
    successCovered: false,
    techCovered: false,
    scopeCovered: false,
  }

  // Map progress to question IDs
  const progressToQuestionIds = (): Set<string> => {
    const ids = new Set<string>(answeredQuestionIds)
    // Map old progress fields to question IDs
    if (p.problemCovered) {
      ids.add('problem')
      ids.add('solution')
    }
    if (p.usersCovered) ids.add('users')
    if (p.motivationCovered) {
      // Motivation maps to problem understanding
    }
    if (p.successCovered) ids.add('metrics')
    if (p.techCovered) {
      ids.add('codebase')
      ids.add('stack')
    }
    if (p.scopeCovered) ids.add('constraints')
    return ids
  }

  const answeredIds = progressToQuestionIds()

  // Find the next unanswered question
  const getNextQuestionId = (): string | undefined => {
    // Priority: required questions first, then by category order
    const requiredQuestions = DISCOVERY_QUESTIONS.filter((q) => q.required)
    const unansweredRequired = requiredQuestions.find((q) => !answeredIds.has(q.id))
    if (unansweredRequired) return unansweredRequired.id

    // Then optional questions
    const optionalQuestions = DISCOVERY_QUESTIONS.filter((q) => !q.required)
    const unansweredOptional = optionalQuestions.find((q) => !answeredIds.has(q.id))
    return unansweredOptional?.id
  }

  const nextQuestionId = getNextQuestionId()

  // Count required areas covered
  const requiredCount = [
    p.problemCovered,
    p.usersCovered,
    p.motivationCovered,
    p.successCovered,
  ].filter(Boolean).length
  const isComplete = requiredCount === 4

  // Get questions by category
  const essentialQuestions = getQuestionsByCategory('essential')
  const technicalQuestions = getQuestionsByCategory('technical')
  const implementationQuestions = getQuestionsByCategory('implementation')

  // Calculate totals
  const totalAnswered = answeredIds.size
  const totalQuestions = DISCOVERY_QUESTIONS.length

  // Get missing areas for display
  const missingAreas = getMissingAreas(p)

  if (compact) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="py-2.5 px-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-medium text-foreground">Discovery</span>
            </div>
            <span
              className={cn(
                'text-xs font-semibold',
                isComplete
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {requiredCount}/4
            </span>
          </div>
          <div className="space-y-1">
            <ProgressItem label="Problem" shortLabel="WHAT" covered={p.problemCovered} compact />
            <ProgressItem label="Users" shortLabel="WHO" covered={p.usersCovered} compact />
            <ProgressItem label="Value" shortLabel="WHY" covered={p.motivationCovered} compact />
            <ProgressItem label="Success" shortLabel="DONE" covered={p.successCovered} compact />
          </div>
          {/* Missing areas badges */}
          {missingAreas.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1 flex-wrap">
                <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-[10px] text-muted-foreground">Still need:</span>
                {missingAreas.map((area) => (
                  <Badge
                    key={area}
                    variant="outline"
                    className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    {area}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Discovery Progress</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isComplete ? 'success' : 'outline'}
              className="text-xs"
            >
              {totalAnswered}/{totalQuestions} questions
            </Badge>
            {isComplete && (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                Ready for PRD
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 px-4 pb-3">
        {/* Required areas summary */}
        <div className="space-y-1.5">
          <ProgressItem
            label="Problem Statement"
            shortLabel="WHAT"
            covered={p.problemCovered}
          />
          <ProgressItem label="Target Users" shortLabel="WHO" covered={p.usersCovered} />
          <ProgressItem
            label="Motivation / Value"
            shortLabel="WHY"
            covered={p.motivationCovered}
          />
          <ProgressItem label="Success Criteria" shortLabel="DONE" covered={p.successCovered} />
        </div>

        {/* Optional areas */}
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <ProgressItem
            label="Technical Constraints"
            shortLabel="TECH"
            covered={p.techCovered}
            optional
          />
          <ProgressItem
            label="Scope Boundaries"
            shortLabel="SCOPE"
            covered={p.scopeCovered}
            optional
          />
        </div>

        {/* Expandable questions section */}
        <div className="pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-foreground p-1 h-auto"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                Hide Questions
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Show {totalQuestions} Discovery Questions
              </>
            )}
          </Button>

          {expanded && (
            <div className="mt-3 space-y-4">
              <CategorySection
                category="essential"
                label="Essential (Required)"
                questions={essentialQuestions}
                answeredIds={answeredIds}
                nextQuestionId={nextQuestionId}
              />
              <CategorySection
                category="technical"
                label="Technical (Optional)"
                questions={technicalQuestions}
                answeredIds={answeredIds}
                nextQuestionId={nextQuestionId}
              />
              <CategorySection
                category="implementation"
                label="Implementation (Optional)"
                questions={implementationQuestions}
                answeredIds={answeredIds}
                nextQuestionId={nextQuestionId}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
