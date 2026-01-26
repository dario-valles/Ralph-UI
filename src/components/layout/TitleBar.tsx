import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Menu, PanelLeft, Settings, Terminal } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher'
import { ConnectionIndicatorCompact } from '@/components/shared/ConnectionIndicator'
import { PendingActionsIndicatorCompact } from '@/components/shared/PendingActionsIndicator'
import { Tooltip } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/useMediaQuery'

export function TitleBar() {
  const { sidebarCollapsed, toggleSidebar, toggleSidebarDrawer } = useUIStore()
  const { terminals, panelMode, togglePanel, createTerminal } = useTerminalStore()
  const { getActiveProject } = useProjectStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const handleTerminalClick = () => {
    if (terminals.length === 0) {
      // Create terminal in active project's directory
      const activeProject = getActiveProject()
      createTerminal(activeProject?.path)
    } else {
      togglePanel()
    }
  }

  const handleMenuClick = () => {
    if (isMobile) {
      toggleSidebarDrawer()
    } else {
      toggleSidebar()
    }
  }

  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-[var(--z-header)] flex items-center h-12 md:h-10 border-b bg-card select-none"
    >
      {/* Left section - hamburger (mobile) or sidebar toggle (desktop) */}
      <div className="flex items-center pl-2 md:pl-[70px] pr-2">
        <Tooltip
          content={isMobile ? 'Menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          side="bottom"
        >
          <button
            onClick={handleMenuClick}
            className="flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:h-8 md:w-8 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-ring"
            aria-label={
              isMobile ? 'Open menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
          >
            {isMobile ? (
              <Menu className="h-5 w-5" />
            ) : (
              <PanelLeft className={cn('h-3.5 w-3.5', !sidebarCollapsed && 'text-primary')} />
            )}
          </button>
        </Tooltip>
      </div>

      {/* Center - Project Switcher */}
      <div className="flex-1 flex justify-center" data-tauri-drag-region>
        <ProjectSwitcher compact />
      </div>

      {/* Right section - Connection, Terminal and Settings */}
      <div className="flex items-center gap-1 pr-2 md:pr-3">
        {/* Pending actions indicator - shows when actions are queued (US-5) */}
        <PendingActionsIndicatorCompact />
        {/* Connection indicator - only shows when disconnected/reconnecting */}
        <ConnectionIndicatorCompact className="mr-1" />

        <Tooltip content="Terminal" side="bottom">
          <button
            onClick={handleTerminalClick}
            className={cn(
              'flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:h-8 md:w-8 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-ring',
              panelMode !== 'closed' && 'text-primary'
            )}
            aria-label="Toggle terminal"
          >
            <Terminal className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="bottom">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:h-8 md:w-8 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-ring"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
