import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectTypeSelector } from './ProjectTypeSelector'
import { ArrowRight, Sparkles, X, Check, Search, ListTodo } from 'lucide-react'
import type { ProjectType } from '@/types/gsd'
import { cn } from '@/lib/utils'

interface GSDOnboardingTourProps {
  onComplete: (selectedType?: ProjectType) => void
  onSkip: () => void
}

const STEPS = [
  {
    id: 'welcome',
    title: "Let's plan your project together",
    content:
      "I'll help you create a comprehensive plan for your project through a few simple steps. We'll clarify your idea, research technical approaches, and build a roadmap.",
    icon: Sparkles,
    color: 'text-yellow-500',
  },
  {
    id: 'project-type',
    title: 'What are you building?',
    content:
      'Knowing your project type helps me ask better questions and provide relevant suggestions.',
    component: 'ProjectTypeSelector',
  },
  {
    id: 'questioning',
    title: 'Tell me about your idea',
    content:
      "You can chat naturally, or use the checklist to fill in the details. Don't worry about being perfect - I'll help you refine it.",
    icon: ListTodo,
    color: 'text-blue-500',
  },
  {
    id: 'research-preview',
    title: 'AI-powered research',
    content:
      "Once we understand your project, I'll run parallel research agents to explore architecture, libraries, and best practices for you.",
    icon: Search,
    color: 'text-purple-500',
  },
]

export function GSDOnboardingTour({ onComplete, onSkip }: GSDOnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedType, setSelectedType] = useState<ProjectType | undefined>()

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete(selectedType)
    }
  }

  const step = STEPS[currentStep]
  const isLastStep = currentStep === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl overflow-hidden shadow-2xl border-2">
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex gap-1">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-1.5 w-8 rounded-full transition-colors',
                  idx <= currentStep ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            Skip
            <X className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex-1"
          >
            <CardHeader className="text-center pt-8 pb-4">
              {step.icon && (
                <div className="mx-auto mb-4 p-3 bg-muted/50 rounded-full w-fit">
                  <step.icon className={cn('h-8 w-8', step.color)} />
                </div>
              )}
              <CardTitle className="text-2xl">{step.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-center px-8 pb-8">
              <p className="text-lg text-muted-foreground mb-6 max-w-lg mx-auto">{step.content}</p>

              {step.component === 'ProjectTypeSelector' && (
                <div className="text-left mt-6 max-h-[50vh] min-h-[300px] overflow-y-auto pr-2 border rounded-lg p-2 bg-muted/30">
                  <ProjectTypeSelector
                    selectedType={selectedType}
                    onSelect={(type) => {
                      setSelectedType(type)
                      // Optional: auto-advance on selection? No, let them confirm.
                    }}
                    className="grid-cols-1 md:grid-cols-2" // 2 columns for compact view
                  />
                </div>
              )}
            </CardContent>
          </motion.div>
        </AnimatePresence>

        <CardFooter className="flex justify-between p-6 bg-muted/30 border-t">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button onClick={handleNext} size="lg" className="gap-2">
            {isLastStep ? 'Get Started' : 'Next'}
            {isLastStep ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
