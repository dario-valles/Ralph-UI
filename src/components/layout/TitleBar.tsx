import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PanelLeft, Settings, Terminal } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher'
import { Tooltip } from '@/components/ui/tooltip'

export function TitleBar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { terminals, panelMode, togglePanel, createTerminal } = useTerminalStore()
  const { getActiveProject } = useProjectStore()
  const navigate = useNavigate()

  const handleTerminalClick = () => {
    if (terminals.length === 0) {
      // Create terminal in active project's directory
      const activeProject = getActiveProject()
      createTerminal(activeProject?.path)
    } else {
      togglePanel()
    }
  }

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-9 border-b bg-card select-none"
    >
      {/* Left section - traffic lights space + sidebar toggle */}
      <div className="flex items-center pl-[70px] pr-2">
        <Tooltip content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="bottom">
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <PanelLeft className={cn('h-3.5 w-3.5', !sidebarCollapsed && 'text-primary')} />
          </button>
        </Tooltip>
      </div>

      {/* Center - Project Switcher */}
      <div className="flex-1 flex justify-center" data-tauri-drag-region>
        <ProjectSwitcher compact />
      </div>

      {/* Right section - Terminal and Settings */}
      <div className="flex items-center gap-1 pr-3">
        <Tooltip content="Terminal" side="bottom">
          <button
            onClick={handleTerminalClick}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
              panelMode !== 'closed' && 'text-primary'
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="bottom">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
