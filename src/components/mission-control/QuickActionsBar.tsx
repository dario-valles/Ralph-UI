// QuickActionsBar - A bar with quick action buttons for Mission Control

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QuickActionsBarProps {
  onRefreshAll?: () => Promise<void>
  isRefreshing?: boolean
}

export function QuickActionsBar({ onRefreshAll, isRefreshing }: QuickActionsBarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Refresh All Button */}
      {onRefreshAll && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshAll}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      )}
    </div>
  )
}
