import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { MissionControlPage } from './components/mission-control'
import { SettingsPage } from './components/settings/SettingsPage'
import { PRDList } from './components/prd/PRDList'
import { PRDEditor } from './components/prd/PRDEditor'
import { PRDFileEditor } from './components/prd/PRDFileEditor'
import { PRDChatPanel } from './components/prd/PRDChatPanel'
import { RalphLoopPage } from './components/ralph-loop'
import { ToastContainer } from './components/ui/toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useProjectStore } from './stores/projectStore'
import { ralphLoopApi } from './lib/tauri-api'

function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Cleanup stale Ralph Loop executions on app startup
  // This handles crash recovery - marks interrupted iterations properly
  useEffect(() => {
    const cleanupStaleExecutions = async () => {
      try {
        // Check for executions that haven't had a heartbeat in 2 minutes
        const staleExecutions = await ralphLoopApi.checkStaleExecutions(120)

        if (staleExecutions.length > 0) {
          for (const exec of staleExecutions) {
            try {
              await ralphLoopApi.recoverStaleIterations(exec.executionId)
            } catch (err) {
              console.warn(`[App] Failed to recover execution ${exec.executionId}:`, err)
            }
          }
        }

        // Also cleanup old iteration history (keep 30 days)
        try {
          await ralphLoopApi.cleanupIterationHistory(30)
        } catch (err) {
          console.warn('[App] Failed to cleanup old iterations:', err)
        }
      } catch (err) {
        // Best-effort cleanup, don't fail app startup
        console.warn('[App] Failed to check for stale executions:', err)
      }
    }

    cleanupStaleExecutions()
  }, [])
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<MissionControlPage />} />
            <Route path="prds" element={<PRDList />} />
            <Route path="prds/new" element={<Navigate to="/prds/chat" replace />} />
            <Route path="prds/chat" element={<PRDChatPanel />} />
            <Route path="prds/file" element={<PRDFileEditor />} />
            <Route path="prds/:id" element={<PRDEditor />} />
            <Route path="ralph-loop" element={<RalphLoopPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
