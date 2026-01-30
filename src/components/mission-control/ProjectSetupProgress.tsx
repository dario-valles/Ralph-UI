// Project Setup Progress card for Home dashboard
// Shows setup checklist and next step recommendation for a project

import { Link } from 'react-router-dom'
import { Check, BookOpen, FileText, ArrowRight, FolderOpen, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProjectSetupStatus, getSetupProgress, getNextSetupStep } from '@/hooks/useProjectSetupStatus'
import type { Project } from '@/types'

interface ProjectSetupProgressProps {
  project: Project
  className?: string
}

interface SetupStep {
  id: 'project' | 'context' | 'prd'
  label: string
  icon: React.ElementType
  linkTo?: string
}

const SETUP_STEPS: SetupStep[] = [
  {
    id: 'project',
    label: 'Project Added',
    icon: FolderOpen,
  },
  {
    id: 'context',
    label: 'Context',
    icon: BookOpen,
    linkTo: '/context/chat',
  },
  {
    id: 'prd',
    label: 'First PRD',
    icon: FileText,
    linkTo: '/prds/chat',
  },
]

export function ProjectSetupProgress({ project, className }: ProjectSetupProgressProps) {
  const setupStatus = useProjectSetupStatus(project.path)
  const progress = getSetupProgress(setupStatus)
  const nextStep = getNextSetupStep(setupStatus)

  // Don't show if setup is complete
  if (nextStep === 'complete') {
    return null
  }

  const getStepStatus = (stepId: 'project' | 'context' | 'prd'): 'completed' | 'current' | 'upcoming' => {
    switch (stepId) {
      case 'project':
        return 'completed'
      case 'context':
        if (setupStatus.hasContext) return 'completed'
        return nextStep === 'context' ? 'current' : 'upcoming'
      case 'prd':
        if (setupStatus.hasFirstPrd) return 'completed'
        return nextStep === 'prd' ? 'current' : 'upcoming'
    }
  }

  const nextStepInfo = SETUP_STEPS.find((s) => s.id === nextStep)
  const completedSteps = SETUP_STEPS.filter((s) => getStepStatus(s.id) === 'completed').length

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Gradient accent bar */}
      <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/40" style={{ width: `${progress}%` }} />

      <CardContent className="p-4 space-y-4">
        {/* Header with project name and progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium leading-none mb-0.5">Getting Started</h3>
              <p className="text-xs text-muted-foreground">{project.name}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{completedSteps}</span>
            <span className="text-sm text-muted-foreground">/{SETUP_STEPS.length}</span>
          </div>
        </div>

        {/* Horizontal step indicators */}
        <div className="flex items-center gap-2">
          {SETUP_STEPS.map((step, index) => {
            const status = getStepStatus(step.id)
            const isCompleted = status === 'completed'
            const isCurrent = status === 'current'
            const Icon = step.icon

            return (
              <div key={step.id} className="flex items-center gap-2 flex-1">
                {/* Step indicator */}
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all',
                    isCompleted && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                    isCurrent && 'bg-primary text-primary-foreground ring-4 ring-primary/10',
                    !isCompleted && !isCurrent && 'bg-muted/60 text-muted-foreground/50'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>

                {/* Connector line */}
                {index < SETUP_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 rounded-full transition-colors',
                      isCompleted ? 'bg-emerald-500/30' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Step labels */}
        <div className="flex">
          {SETUP_STEPS.map((step) => {
            const status = getStepStatus(step.id)
            const isCompleted = status === 'completed'
            const isCurrent = status === 'current'

            return (
              <div key={step.id} className="flex-1 first:text-left text-center last:text-right">
                <span
                  className={cn(
                    'text-xs',
                    isCompleted && 'text-emerald-600 dark:text-emerald-400',
                    isCurrent && 'text-foreground font-medium',
                    !isCompleted && !isCurrent && 'text-muted-foreground/60'
                  )}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Next step CTA */}
        {nextStepInfo && nextStepInfo.linkTo && (
          <Link
            to={nextStepInfo.linkTo}
            state={{ projectPath: project.path }}
            className="block"
          >
            <Button variant="default" size="sm" className="w-full group">
              {nextStep === 'context' ? 'Set Up Context' : 'Create First PRD'}
              <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
