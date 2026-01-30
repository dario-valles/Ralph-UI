import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { MissionControlPage } from './components/mission-control'
import { PRDList } from './components/prd/PRDList'
import { PRDFileEditor } from './components/prd/PRDFileEditor'
import { PRDChatPanel } from './components/prd/PRDChatPanel'
import { ContextChatPage } from './components/context'
import { ToastContainer } from './components/ui/toast'
import { ServerUpdateBanner } from './components/ServerUpdateBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ServerConnectionDialog } from './components/ServerConnectionDialog'
import { AgentSetupDialog } from './components/onboarding/AgentSetupDialog'
import { useServerConnection } from './hooks/useServerConnection'
import { useProjectStore } from './stores/projectStore'
import { ralphLoopApi } from './lib/backend-api'
import { useRalphLoopNotifications } from './hooks/useRalphLoopNotifications'
import { setupGlobalSyncListeners } from './hooks/useCrossDeviceSync'

// Lazy-loaded routes for better code splitting
const RalphLoopPage = lazy(() =>
  import('./components/ralph-loop').then((m) => ({ default: m.RalphLoopPage }))
    .catch((err) => {
      console.error('[App] Failed to load RalphLoopPage:', err)
      // Return a fallback component
      return { default: () => <div className="p-4">Failed to load Ralph Loop page</div> }
    })
)
const SettingsPage = lazy(() =>
  import('./components/settings/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  }))
    .catch((err) => {
      console.error('[App] Failed to load SettingsPage:', err)
      return { default: () => <div className="p-4">Failed to load Settings page</div> }
    })
)

/** Component that mounts global notification listeners inside the router */
function GlobalNotificationListener(): null {
  useRalphLoopNotifications()
  return null
}

/** Track route changes for debugging */
function RouteChangeTracker(): null {
  const location = useLocation()
  useEffect(() => {
    console.log('[App] Route changed to:', location.pathname)
  }, [location])
  return null
}

function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const projects = useProjectStore((state) => state.projects)
  const { isConnected, showDialog, showAgentSetup, handleConnected, handleAgentSetupComplete } =
    useServerConnection()

  // Log app mount for debugging
  useEffect(() => {
    console.log('[App] App component mounted')
  }, [])

  useEffect(() => {
    // Only load projects and setup listeners when connected
    if (isConnected) {
      console.log('[App] Connected to server, loading projects')
      loadProjects()
      // Setup global cross-device sync listeners (tool calls, status changes)
      setupGlobalSyncListeners()
    }
  }, [loadProjects, isConnected])

  // Cleanup stale Ralph Loop executions on app startup
  // This handles crash recovery - marks interrupted iterations properly
  useEffect(() => {
    if (projects.length === 0) return

    const cleanupStaleExecutions = async () => {
      for (const project of projects) {
        try {
          // Check for executions that haven't had a heartbeat in 2 minutes
          const staleExecutions = await ralphLoopApi.checkStaleExecutions(project.path, 120)

          if (staleExecutions.length > 0) {
            for (const exec of staleExecutions) {
              try {
                await ralphLoopApi.recoverStaleIterations(project.path, exec.executionId)
              } catch (err) {
                console.warn(`[App] Failed to recover execution ${exec.executionId}:`, err)
              }
            }
          }

          // Also cleanup old iteration history (keep 30 days)
          try {
            await ralphLoopApi.cleanupIterationHistory(project.path, 30)
          } catch (err) {
            console.warn('[App] Failed to cleanup old iterations:', err)
          }
        } catch (err) {
          // Best-effort cleanup, don't fail app startup
          console.warn(`[App] Failed to check for stale executions in ${project.path}:`, err)
        }
      }
    }

    cleanupStaleExecutions()
  }, [projects])
  return (
    <>
      {/* Show connection dialog in browser mode when not connected */}
      {showDialog && <ServerConnectionDialog onConnected={handleConnected} />}

      {/* Show agent setup dialog after connection for first-time users */}
      <AgentSetupDialog open={showAgentSetup} onComplete={handleAgentSetupComplete} />

      <ErrorBoundary>
        <BrowserRouter>
          <GlobalNotificationListener />
          <RouteChangeTracker />
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<MissionControlPage />} />
              <Route path="prds" element={<PRDList />} />
              <Route path="prds/new" element={<Navigate to="/prds/chat" replace />} />
              <Route path="prds/chat" element={<PRDChatPanel />} />
              <Route path="prds/file" element={<PRDFileEditor />} />
              <Route path="context/chat" element={<ContextChatPage />} />
              <Route
                path="ralph-loop"
                element={
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center min-h-screen">
                        <div className="text-center">
                          <p className="text-lg font-medium mb-2">Loading Ralph Loop...</p>
                          <p className="text-sm text-muted-foreground">Please wait while we load the page.</p>
                        </div>
                      </div>
                    }
                  >
                    <RalphLoopPage />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center min-h-screen">
                        <div className="text-center">
                          <p className="text-lg font-medium mb-2">Loading Settings...</p>
                          <p className="text-sm text-muted-foreground">Please wait while we load the page.</p>
                        </div>
                      </div>
                    }
                  >
                    <SettingsPage />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
          <ToastContainer />
          <ServerUpdateBanner />
        </BrowserRouter>
      </ErrorBoundary>
    </>
  )
}

export default App
