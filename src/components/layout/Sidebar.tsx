import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Gauge,
  ListTodo,
  Bot,
  FolderGit2,
  FileText,
  MessageSquare,
  Repeat,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { usePRDChatStore } from '@/stores/prdChatStore'

const navigation = [
  { name: 'Mission Control', to: '/', icon: Gauge },
  { name: 'PRDs', to: '/prds', icon: FileText },
  { name: 'PRD Chat', to: '/prds/chat', icon: MessageSquare },
  { name: 'Ralph Loop', to: '/ralph-loop', icon: Repeat },
  { name: 'Tasks', to: '/tasks', icon: ListTodo },
  { name: 'Agents', to: '/agents', icon: Bot },
  { name: 'Sessions', to: '/sessions', icon: FolderGit2 },
]

export function Sidebar() {
  const { sidebarCollapsed } = useUIStore()
  const processingSessionId = usePRDChatStore((state) => state.processingSessionId)

  if (sidebarCollapsed) {
    return null
  }

  return (
    <div className="flex flex-col w-48 border-r bg-card">
      <nav className="flex-1 space-y-0.5 p-1.5">
        {navigation.map((item) => {
          const Icon = item.icon
          const showProcessingBadge = item.to === '/prds/chat' && processingSessionId !== null
          const navItem = (
            <NavLink
              key={item.name}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md py-1.5 px-2.5 text-sm font-medium transition-colors relative',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <div className="relative">
                <Icon className="h-4 w-4 flex-shrink-0" />
                {showProcessingBadge && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                )}
              </div>
              <span>{item.name}</span>
              {showProcessingBadge && (
                <span className="ml-auto text-xs text-yellow-500 animate-pulse">●</span>
              )}
            </NavLink>
          )

          return navItem
        })}
      </nav>
    </div>
  )
}
