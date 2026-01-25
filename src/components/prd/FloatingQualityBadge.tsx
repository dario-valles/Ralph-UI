import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Loader2, RefreshCw } from 'lucide-react'
import type { QualityAssessment } from '@/types'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { QualityScoreCard } from './QualityScoreCard'
import { getProgressColor } from './quality-utils'

interface FloatingQualityBadgeProps {
  assessment: QualityAssessment | null
  loading: boolean
  onRefresh: () => void
}

export function FloatingQualityBadge({ assessment, loading, onRefresh }: FloatingQualityBadgeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const isMobile = useIsMobile()

  // Don't show badge if no assessment
  if (!assessment && !loading) {
    return null
  }

  const score = assessment?.overall ?? 0
  const bgColor = getProgressColor(score)

  // Loading state
  if (loading && !assessment) {
    return (
      <div
        className={cn(
          'absolute bottom-4 right-4 z-10',
          'flex items-center justify-center',
          'w-11 h-11 rounded-full',
          'bg-muted shadow-lg',
          'animate-pulse'
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Mobile: use Sheet
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setSheetOpen(true)}
          className={cn(
            'absolute bottom-4 right-4 z-10',
            'flex items-center justify-center',
            'w-11 h-11 rounded-full',
            'shadow-lg',
            'transition-transform hover:scale-105 active:scale-95',
            'text-white font-bold text-sm',
            bgColor
          )}
          aria-label={`Quality score: ${score}%`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : score}
        </button>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[50vh] p-0 flex flex-col">
            <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base">Quality Assessment</SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRefresh}
                  disabled={loading}
                  className="h-8 w-8"
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </Button>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              <QualityScoreCard assessment={assessment} loading={loading} onRefresh={onRefresh} />
            </div>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // Desktop: use DropdownMenu (positioned upward)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'absolute bottom-4 right-4 z-10',
            'flex items-center justify-center',
            'w-11 h-11 rounded-full',
            'shadow-lg',
            'transition-transform hover:scale-105 active:scale-95',
            'text-white font-bold text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            bgColor
          )}
          aria-label={`Quality score: ${score}%`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : score}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
      >
        <QualityScoreCard assessment={assessment} loading={loading} onRefresh={onRefresh} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
