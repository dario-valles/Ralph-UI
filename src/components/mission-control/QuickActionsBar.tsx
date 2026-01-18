// QuickActionsBar - A bar with quick action buttons for Mission Control

import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewSessionModal } from './NewSessionModal'
import { useProjectStore } from '@/stores/projectStore'

interface QuickActionsBarProps {
  onRefreshAll?: () => Promise<void>
  isRefreshing?: boolean
}

export function QuickActionsBar({ onRefreshAll, isRefreshing }: QuickActionsBarProps) {
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)
  const activeProject = useProjectStore((s) => s.getActiveProject())

  return (
    <>
      <div className="flex items-center gap-2">
        {/* New Session Button */}
        <Button
          variant="default"
          size="sm"
          onClick={() => setIsNewSessionModalOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Session
        </Button>

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

      {/* New Session Modal */}
      <NewSessionModal
        open={isNewSessionModalOpen}
        onOpenChange={setIsNewSessionModalOpen}
        defaultProjectPath={activeProject?.path}
      />
    </>
  )
}
