import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './components/dashboard/DashboardPage'
import { TasksPage } from './components/tasks/TasksPage'
import { AgentsPage } from './components/agents/AgentsPage'
import { SessionsPage } from './components/dashboard/SessionsPage'
import { SettingsPage } from './components/settings/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
