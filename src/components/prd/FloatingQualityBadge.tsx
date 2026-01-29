import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { QualityAssessment } from '@/types'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { QualityScoreCard } from './QualityScoreCard'

interface FloatingQualityBadgeProps {
  assessment: QualityAssessment | null
  loading: boolean
  onRefresh: () => void
  /** Callback when a missing section badge is clicked */
  onMissingSectionClick?: (section: string) => void
}

// Get gradient colors based on score
function getScoreGradient(score: number): { from: string; to: string; glow: string } {
  if (score >= 80) return {
    from: 'from-emerald-400',
    to: 'to-teal-500',
    glow: 'shadow-emerald-500/40'
  }
  if (score >= 60) return {
    from: 'from-amber-400',
    to: 'to-yellow-500',
    glow: 'shadow-amber-500/40'
  }
  if (score >= 40) return {
    from: 'from-orange-400',
    to: 'to-red-500',
    glow: 'shadow-orange-500/40'
  }
  return {
    from: 'from-red-400',
    to: 'to-rose-600',
    glow: 'shadow-red-500/40'
  }
}

// Get status label
function getStatusLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Great'
  if (score >= 70) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 40) return 'Needs Work'
  return 'Poor'
}

// Circular progress ring component
function CircularProgress({
  score,
  size = 48,
  strokeWidth = 3
}: {
  score: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 100) * circumference

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-white/10"
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
      {/* Gradient definition */}
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.5)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function FloatingQualityBadge({ assessment, loading, onRefresh, onMissingSectionClick }: FloatingQualityBadgeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const isMobile = useIsMobile()

  // Don't show badge if no assessment
  if (!assessment && !loading) {
    return null
  }

  const score = assessment?.overall ?? 0
  const { from, to, glow } = getScoreGradient(score)
  const statusLabel = getStatusLabel(score)

  // Common positioning
  const badgePosition = 'absolute bottom-[4.5rem] right-3 sm:bottom-20 sm:right-4 z-10'

  // Loading state with pulsing animation
  if (loading && !assessment) {
    return (
      <div
        className={cn(
          badgePosition,
          'w-12 h-12 sm:w-14 sm:h-14 rounded-full',
          'bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800',
          'shadow-lg flex items-center justify-center',
          'animate-pulse'
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
      </div>
    )
  }

  // Badge content with circular progress
  const BadgeContent = (
    <div
      className={cn(
        'relative w-12 h-12 sm:w-14 sm:h-14 rounded-full cursor-pointer',
        'bg-gradient-to-br', from, to,
        'shadow-lg', glow,
        'transition-all duration-300 ease-out',
        'hover:shadow-xl hover:scale-110',
        'active:scale-95',
        'flex items-center justify-center',
        // Glass overlay effect
        'before:absolute before:inset-0 before:rounded-full',
        'before:bg-gradient-to-b before:from-white/25 before:to-transparent',
        'before:pointer-events-none'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Progress ring */}
      <CircularProgress score={score} size={isMobile ? 48 : 56} strokeWidth={3} />

      {/* Score display */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        ) : (
          <>
            <span className="text-white font-bold text-base sm:text-lg leading-none tracking-tight drop-shadow-sm">
              {score}
            </span>
            {/* Sparkle indicator for high scores */}
            {score >= 80 && (
              <Sparkles
                className={cn(
                  'absolute -top-1 -right-1 h-3 w-3 text-white/80',
                  'transition-opacity duration-300',
                  isHovered ? 'opacity-100' : 'opacity-60'
                )}
              />
            )}
          </>
        )}
      </div>

      {/* Hover tooltip - desktop only */}
      {!isMobile && (
        <div
          className={cn(
            'absolute -top-8 left-1/2 -translate-x-1/2',
            'px-2 py-0.5 rounded-md text-xs font-medium',
            'bg-foreground text-background',
            'whitespace-nowrap pointer-events-none',
            'transition-all duration-200',
            isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          )}
        >
          {statusLabel}
        </div>
      )}
    </div>
  )

  // Mobile: use Sheet
  if (isMobile) {
    return (
      <div className={badgePosition}>
        <button
          onClick={() => setSheetOpen(true)}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
          aria-label={`Quality score: ${score}% - ${statusLabel}`}
        >
          {BadgeContent}
        </button>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[50vh] p-0 flex flex-col rounded-t-2xl">
            <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mini badge in header */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      'bg-gradient-to-br', from, to,
                      'text-white font-bold text-sm'
                    )}
                  >
                    {score}
                  </div>
                  <div>
                    <SheetTitle className="text-base">Quality Score</SheetTitle>
                    <p className="text-xs text-muted-foreground">{statusLabel}</p>
                  </div>
                </div>
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
              <QualityScoreCard
                assessment={assessment}
                loading={loading}
                onRefresh={onRefresh}
                onMissingSectionClick={onMissingSectionClick}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  // Desktop: use DropdownMenu (positioned upward)
  return (
    <div className={badgePosition}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
            aria-label={`Quality score: ${score}% - ${statusLabel}`}
          >
            {BadgeContent}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-80 p-0 overflow-hidden rounded-xl border-0 shadow-2xl"
        >
          {/* Header with gradient */}
          <div className={cn(
            'px-4 py-3 flex items-center justify-between',
            'bg-gradient-to-r', from, to
          )}>
            <div className="flex items-center gap-3">
              <div className="text-white">
                <div className="text-2xl font-bold leading-none">{score}</div>
                <div className="text-xs text-white/80 mt-0.5">{statusLabel}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault()
                onRefresh()
              }}
              disabled={loading}
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>

          {/* Score card content */}
          <div className="bg-popover">
            <QualityScoreCard
              assessment={assessment}
              loading={loading}
              onRefresh={onRefresh}
              onMissingSectionClick={onMissingSectionClick}
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
