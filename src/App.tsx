import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { MissionControlPage } from './components/mission-control'
import { TasksPage } from './components/tasks/TasksPage'
import { AgentsPage } from './components/agents/AgentsPage'
import { SessionsPage } from './components/dashboard/SessionsPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { PRDList } from './components/prd/PRDList'
import { PRDTemplateSelector } from './components/prd/PRDTemplateSelector'
import { PRDEditor } from './components/prd/PRDEditor'
import { PRDChatPanel } from './components/prd/PRDChatPanel'
import { ToastContainer } from './components/ui/toast'
import { useProjectStore } from './stores/projectStore'

function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<MissionControlPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="prds" element={<PRDList />} />
          <Route path="prds/new" element={<PRDTemplateSelector />} />
          <Route path="prds/chat" element={<PRDChatPanel />} />
          <Route path="prds/:id" element={<PRDEditor />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
