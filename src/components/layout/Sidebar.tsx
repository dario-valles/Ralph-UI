import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ListTodo, Bot, Settings, FolderGit2 } from 'lucide-react'

const navigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Tasks', to: '/tasks', icon: ListTodo },
  { name: 'Agents', to: '/agents', icon: Bot },
  { name: 'Sessions', to: '/sessions', icon: FolderGit2 },
  { name: 'Settings', to: '/settings', icon: Settings },
]

export function Sidebar() {
  return (
    <div className="flex w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center justify-center border-b px-6">
        <h1 className="text-xl font-bold">Ralph UI</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.name}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          )
        })}
      </nav>
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">
          <p>Phase 1 - Foundation</p>
          <p className="mt-1">v0.1.0</p>
        </div>
      </div>
    </div>
  )
}
