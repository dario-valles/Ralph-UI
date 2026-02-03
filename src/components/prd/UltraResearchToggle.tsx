/**
 * Ultra Research Toggle - Enable/disable multi-agent deep research mode
 */
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { Microscope, Zap, Settings2 } from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'

interface UltraResearchToggleProps {
  disabled?: boolean
}

export function UltraResearchToggle({ disabled = false }: UltraResearchToggleProps) {
  const { ultraResearchConfig, toggleUltraResearch, openConfigModal, activeResearchSession } =
    usePRDChatStore()

  const isEnabled = ultraResearchConfig?.enabled ?? false
  const isResearching =
    activeResearchSession?.status &&
    !['complete', 'error', 'cancelled'].includes(activeResearchSession.status)

  const handleClick = () => {
    if (isEnabled) {
      // If already enabled, open config modal
      openConfigModal()
    } else {
      // If disabled, enable and open config
      toggleUltraResearch()
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip
        content={
          isEnabled
            ? 'Ultra Research Mode enabled - Click to configure'
            : 'Enable multi-agent deep research'
        }
        side="bottom"
      >
        <Button
          variant={isEnabled ? 'default' : 'outline'}
          size="sm"
          onClick={handleClick}
          disabled={disabled || isResearching}
          className={`h-7 sm:h-8 gap-1 px-2 ${
            isEnabled ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''
          }`}
        >
          <Microscope className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">Ultra</span>
          {isEnabled && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-purple-200 text-purple-800">
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              {ultraResearchConfig?.agents.length || 0}
            </Badge>
          )}
        </Button>
      </Tooltip>

      {isEnabled && (
        <Tooltip content="Configure Ultra Research" side="bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={openConfigModal}
            disabled={disabled || isResearching}
            className="h-7 w-7 sm:h-8 sm:w-8 p-0"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      )}
    </div>
  )
}
