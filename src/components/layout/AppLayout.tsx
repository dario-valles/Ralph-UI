import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { MobileSidebarDrawer } from './MobileSidebarDrawer'
import { TerminalPanel } from '@/components/terminal'
import { OfflineIndicator } from '@/components/shared/OfflineBanner'
import { FailedActionsBanner } from '@/components/shared/PendingActionsIndicator'
import { useTerminalShortcuts } from '@/hooks/useTerminalShortcuts'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

export function AppLayout() {
  // Register terminal keyboard shortcuts
  useTerminalShortcuts()

  // Register network and visibility status listeners for mobile resilience
  useNetworkStatus()

  return (
    <div className="flex flex-col h-dvh md:h-screen bg-background">
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

      {/* Offline indicator - floating at bottom when offline */}
      <OfflineIndicator />

      {/* Failed actions banner - shows when sync fails */}
      <FailedActionsBanner />
    </div>
  )
}
