import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ExportProgress {
  active: boolean
  step: number
  message: string
}

interface ExportProgressOverlayProps {
  progress: ExportProgress | null
}

/**
 * Overlay component showing export progress with step indicator.
 */
export function ExportProgressOverlay({ progress }: ExportProgressOverlayProps) {
  if (!progress?.active) {
    return null
  }

  return (
    <div
      data-testid="export-progress"
      className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20"
    >
      <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-lg shadow-lg border max-w-sm mx-4">
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-primary">{progress.step}</span>
          </div>
        </div>
        <div className="text-center">
          <p className="font-medium text-foreground">Exporting PRD</p>
          <p className="text-sm text-muted-foreground mt-1">{progress.message}</p>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                step <= progress.step ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
