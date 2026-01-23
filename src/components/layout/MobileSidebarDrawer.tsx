import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Gauge, FileText, MessageSquare, Repeat } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useUIStore } from '@/stores/uiStore'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher'

const navigation = [
  { name: 'Mission Control', to: '/', icon: Gauge },
  { name: 'PRDs', to: '/prds', icon: FileText },
  { name: 'PRD Chat', to: '/prds/chat', icon: MessageSquare },
  { name: 'Ralph Loop', to: '/ralph-loop', icon: Repeat },
]

export function MobileSidebarDrawer() {
  const { sidebarDrawerOpen, setSidebarDrawerOpen } = useUIStore()
  const processingSessionId = usePRDChatStore((state) => state.processingSessionId)
  const navigate = useNavigate()

  const handleNavClick = (to: string) => {
    setSidebarDrawerOpen(false)
    navigate(to)
  }

  return (
    <Sheet open={sidebarDrawerOpen} onOpenChange={setSidebarDrawerOpen}>
      <SheetContent side="left" className="w-[280px] p-0 safe-left">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Navigation</SheetTitle>
        </SheetHeader>

        {/* Project Switcher */}
        <div className="px-3 py-3 border-b">
          <ProjectSwitcher />
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-2">
          {navigation.map((item) => {
            const Icon = item.icon
            const showProcessingBadge = item.to === '/prds/chat' && processingSessionId !== null

            return (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={(e) => {
                  e.preventDefault()
                  handleNavClick(item.to)
                }}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 mx-2 rounded-md py-3 px-4 text-sm font-medium transition-colors relative touch-target',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80'
                  )
                }
              >
                <div className="relative">
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {showProcessingBadge && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse" />
                  )}
                </div>
                <span>{item.name}</span>
                {showProcessingBadge && (
                  <span className="ml-auto text-xs text-yellow-500 animate-pulse">Processing</span>
                )}
              </NavLink>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
