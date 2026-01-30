// Project Setup Wizard - Shows after a new project is added
// Guides users through Context → PRD → Execute workflow

import { useNavigate } from 'react-router-dom'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Button } from '@/components/ui/button'
import { BookOpen, FileText, Repeat, Check, ArrowRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

interface ProjectSetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
}

interface StepInfo {
  id: 'context' | 'prd' | 'execute'
  title: string
  description: string
  icon: React.ElementType
}

const SETUP_STEPS: StepInfo[] = [
  { id: 'context', title: 'Context', description: 'Help AI understand your project', icon: BookOpen },
  { id: 'prd', title: 'First PRD', description: 'Define what you\'re building', icon: FileText },
  { id: 'execute', title: 'Execute', description: 'Run AI agents', icon: Repeat },
]

export function ProjectSetupWizard({ open, onOpenChange, project }: ProjectSetupWizardProps) {
  const navigate = useNavigate()

  const handleSetupContext = () => {
    onOpenChange(false)
    navigate('/context/chat', { state: { projectPath: project.path } })
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  const footer = (
    <div className="flex flex-col gap-2 w-full sm:flex-row">
      <Button variant="ghost" onClick={handleSkip} className="flex-1 text-muted-foreground">
        Skip for now
      </Button>
      <Button onClick={handleSetupContext} className="flex-1 group">
        Set Up Context
        <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
      </Button>
    </div>
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title=""
      size="md"
      footer={footer}
    >
      <div className="space-y-6">
        {/* Success header with animated checkmark */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/25 animate-in zoom-in-50 duration-300">
            <Check className="h-7 w-7 text-white" strokeWidth={3} />
          </div>
          <div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
            <h2 className="text-xl font-semibold tracking-tight">Project Added</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{project.name}</span> is ready for AI-assisted development
            </p>
          </div>
        </div>

        {/* Workflow steps - horizontal on desktop, vertical on mobile */}
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300 delay-200">
          <div className="relative p-4 rounded-xl bg-gradient-to-b from-muted/50 to-muted/30 border border-border/50">
            {/* Subtle grid pattern overlay */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none rounded-xl"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />

            <div className="relative flex flex-col sm:flex-row gap-3 sm:gap-0">
              {SETUP_STEPS.map((step, index) => {
                const Icon = step.icon
                const isFirst = index === 0
                const isLast = index === SETUP_STEPS.length - 1

                return (
                  <div key={step.id} className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1 relative">
                    {/* Connector line - horizontal on desktop */}
                    {!isLast && (
                      <div className="hidden sm:block absolute top-5 left-[60%] right-0 h-px bg-gradient-to-r from-border to-transparent" />
                    )}
                    {/* Connector line - vertical on mobile */}
                    {!isLast && (
                      <div className="sm:hidden absolute left-5 top-12 bottom-0 w-px bg-gradient-to-b from-border to-transparent h-6" />
                    )}

                    {/* Step circle */}
                    <div
                      className={cn(
                        'relative flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-all',
                        isFirst
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-4 ring-primary/10'
                          : 'bg-muted/80 text-muted-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {isFirst && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                        </span>
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 sm:text-center">
                      <div className="flex items-center gap-2 sm:justify-center">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            isFirst ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {step.title}
                        </span>
                        {isFirst && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold sm:hidden">
                            Start
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground hidden sm:block">{step.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Benefits callout */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-300">
          <div className="flex gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 dark:bg-amber-500/10">
            <div className="shrink-0 mt-0.5">
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Better AI, fewer mistakes</p>
              <p className="text-xs text-muted-foreground">
                Project context helps AI agents understand your codebase patterns and conventions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  )
}
