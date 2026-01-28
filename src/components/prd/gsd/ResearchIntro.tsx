import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, ArrowRight, X, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ResearchIntroProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
  className?: string
}

export function ResearchIntro({ onNext, onSkip, onBack, className }: ResearchIntroProps) {
  return (
    <Card className={cn('w-full max-w-2xl mx-auto overflow-hidden shadow-lg border-2', className)}>
      <div className="flex justify-between items-center p-4 border-b bg-muted/10">
        <div className="flex gap-1">
          <div className="h-1.5 w-8 rounded-full bg-primary" />
          <div className="h-1.5 w-8 rounded-full bg-muted" />
          <div className="h-1.5 w-8 rounded-full bg-muted" />
          <div className="h-1.5 w-8 rounded-full bg-muted" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="text-muted-foreground hover:text-foreground"
        >
          Skip
          <X className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <CardHeader className="text-center pt-10 pb-6">
        <div className="mx-auto mb-6 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-full w-fit ring-1 ring-yellow-100 dark:ring-yellow-900">
          <Sparkles className="h-10 w-10 text-yellow-500" />
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight">
          Let's plan your project together
        </CardTitle>
      </CardHeader>

      <CardContent className="text-center px-12 pb-10">
        <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
          I'll help you create a comprehensive plan for your project through a few simple steps.
          We'll clarify your idea, research technical approaches, and build a roadmap.
        </p>
      </CardContent>

      <CardFooter className="flex justify-between p-6 bg-muted/30 border-t">
        <Button variant="outline" onClick={onBack} size="lg" className="min-w-[100px]">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          size="lg"
          className="min-w-[140px] bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Next
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}
