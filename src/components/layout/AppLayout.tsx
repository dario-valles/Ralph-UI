import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { MobileSidebarDrawer } from './MobileSidebarDrawer'
import { TerminalPanel } from '@/components/terminal'
import { useTerminalShortcuts } from '@/hooks/useTerminalShortcuts'

export function AppLayout() {
  // Register terminal keyboard shortcuts
  useTerminalShortcuts()

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Skip link for accessibility */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile navigation drawer */}
        <MobileSidebarDrawer />

        {/* Desktop sidebar - hidden on mobile */}
        <Sidebar className="hidden md:flex" />

        <div className="flex-1 flex flex-col overflow-hidden">
          <main id="main" className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
            <Outlet />
          </main>
          <TerminalPanel />
        </div>
      </div>
    </div>
  )
}
