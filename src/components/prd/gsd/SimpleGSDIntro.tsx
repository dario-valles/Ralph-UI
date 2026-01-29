import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'

interface SimpleGSDIntroProps {
  onStart: () => void
  onSkip: () => void
}

export function SimpleGSDIntro({ onStart, onSkip }: SimpleGSDIntroProps) {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <Sparkles className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <CardTitle>Let's plan your project together</CardTitle>
        <CardDescription>
          I'll guide you through creating a comprehensive PRD using the GSD (Get Stuff Done) workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="font-medium">1. Deep Questioning</div>
            <div className="text-muted-foreground">Clarify your idea</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="font-medium">2. Research</div>
            <div className="text-muted-foreground">Parallel AI agents</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="font-medium">3. Requirements</div>
            <div className="text-muted-foreground">Auto-generated</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="font-medium">4. Roadmap</div>
            <div className="text-muted-foreground">Visual planning</div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onStart}>
          Get Started
        </Button>
      </CardFooter>
    </Card>
  )
}
