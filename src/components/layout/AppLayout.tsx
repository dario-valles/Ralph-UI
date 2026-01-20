import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { TerminalPanel } from '@/components/terminal'
import { useTerminalShortcuts } from '@/hooks/useTerminalShortcuts'

export function AppLayout() {
  // Register terminal keyboard shortcuts
  useTerminalShortcuts()

  return (
    <div className="flex flex-col h-screen bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10 p-6">
            <Outlet />
          </main>
          <TerminalPanel />
        </div>
      </div>
    </div>
  )
}
