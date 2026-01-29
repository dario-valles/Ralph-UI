import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Sparkles, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestioningContext } from '@/types/gsd'

interface ContextImprovementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalContext: QuestioningContext
  improvedContext: QuestioningContext
  onApply: (context: QuestioningContext) => void
  isLoading?: boolean
}

export function ContextImprovementModal({
  open,
  onOpenChange,
  originalContext,
  improvedContext,
  onApply,
  isLoading = false,
}: ContextImprovementModalProps) {
  const contextFields: Array<{
    key: keyof QuestioningContext
    label: string
    icon: string
  }> = [
    { key: 'what', label: 'What', icon: '🎯' },
    { key: 'why', label: 'Why', icon: '💡' },
    { key: 'who', label: 'Who', icon: '👥' },
    { key: 'done', label: 'Done', icon: '✅' },
  ]

  const handleApply = () => {
    onApply(improvedContext)
    onOpenChange(false)
  }

  const hasImprovements = contextFields.some(
    (field) => improvedContext[field.key] && improvedContext[field.key] !== originalContext[field.key]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI-Improved Context
          </DialogTitle>
          <DialogDescription>
            Review the AI-enhanced version of your project context. You can apply individual
            improvements or use all of them.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Generating improvements...</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              {contextFields.map((field) => {
                const originalValue = originalContext[field.key]
                const improvedValue = improvedContext[field.key]
                const hasImprovement = improvedValue && improvedValue !== originalValue

                return (
                  <Card
                    key={field.key}
                    className={cn(
                      'transition-all',
                      hasImprovement && 'border-green-500/30 bg-green-500/5'
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <span className="text-base">{field.icon}</span>
                          {field.label}
                          {hasImprovement && (
                            <Badge variant="success" className="ml-2">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Improved
                            </Badge>
                          )}
                        </CardTitle>
                        {hasImprovement && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(String(improvedValue))
                            }}
                          >
                            Copy
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Original */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-medium text-muted-foreground">Original:</p>
                        </div>
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2.5 min-h-[60px]">
                          {originalValue || (
                            <span className="italic text-muted-foreground/50">(empty)</span>
                          )}
                        </p>
                      </div>

                      {/* Improved */}
                      {hasImprovement && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                            <p className="text-xs font-medium text-green-600 dark:text-green-400">
                              Improved:
                            </p>
                          </div>
                          <p className="text-sm bg-green-500/10 dark:bg-green-500/5 border border-green-500/20 rounded-md p-2.5 min-h-[60px]">
                            {improvedValue}
                          </p>
                        </div>
                      )}

                      {!hasImprovement && (
                        <div className="text-sm text-muted-foreground italic py-2">
                          No improvements suggested for this field.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!hasImprovements || isLoading}
            className="gap-2"
          >
            Apply All Improvements
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
