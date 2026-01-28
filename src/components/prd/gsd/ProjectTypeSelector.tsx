import {
  Globe,
  Terminal,
  Server,
  Book,
  Smartphone,
  Monitor,
  Database,
  Wrench,
  FileText,
  MoreHorizontal,
  type LucideIcon,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ProjectType } from '@/types/gsd'

interface ProjectTypeOption {
  type: ProjectType
  label: string
  description: string
  icon: LucideIcon
}

const PROJECT_TYPES: ProjectTypeOption[] = [
  {
    type: 'web_app',
    label: 'Web Application',
    description: 'Full-stack web app with frontend and backend',
    icon: Globe,
  },
  {
    type: 'cli_tool',
    label: 'CLI Tool',
    description: 'Command-line interface or script',
    icon: Terminal,
  },
  {
    type: 'api_service',
    label: 'API Service',
    description: 'REST, GraphQL, or gRPC API backend',
    icon: Server,
  },
  {
    type: 'library',
    label: 'Library / Package',
    description: 'Reusable code library or SDK',
    icon: Book,
  },
  {
    type: 'mobile_app',
    label: 'Mobile App',
    description: 'iOS or Android mobile application',
    icon: Smartphone,
  },
  {
    type: 'desktop_app',
    label: 'Desktop App',
    description: 'Electron, Tauri, or native desktop app',
    icon: Monitor,
  },
  {
    type: 'data_pipeline',
    label: 'Data Pipeline',
    description: 'ETL, data processing, or analytics',
    icon: Database,
  },
  {
    type: 'devops_tool',
    label: 'DevOps Tool',
    description: 'Infrastructure, CI/CD, or internal tool',
    icon: Wrench,
  },
  {
    type: 'documentation',
    label: 'Documentation',
    description: 'Docs site, wiki, or knowledge base',
    icon: FileText,
  },
  {
    type: 'other',
    label: 'Other',
    description: 'Something else not listed here',
    icon: MoreHorizontal,
  },
]

interface ProjectTypeSelectorProps {
  selectedType?: ProjectType
  onSelect: (type: ProjectType) => void
  detectedType?: ProjectType
  className?: string
}

export function ProjectTypeSelector({
  selectedType,
  onSelect,
  detectedType,
  className,
}: ProjectTypeSelectorProps) {
  const handleKeyDown = (type: ProjectType, e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(type)
    }
  }

  return (
    <div
      className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}
      role="listbox"
      aria-label="Select project type"
    >
      {PROJECT_TYPES.map((option) => {
        const isSelected = selectedType === option.type
        const isDetected = detectedType === option.type

        return (
          <Card
            key={option.type}
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm relative overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card',
              isDetected && !isSelected && 'border-blue-500/50 bg-blue-500/5'
            )}
            onClick={() => onSelect(option.type)}
            onKeyDown={(e) => handleKeyDown(option.type, e)}
            tabIndex={0}
            role="option"
            aria-selected={isSelected}
            aria-label={`${option.label}: ${option.description}${isDetected ? ' (Auto-detected)' : ''}`}
            aria-describedby={`project-type-${option.type}-desc`}
          >
            {isDetected && (
              <div className="absolute top-0 right-0 bg-blue-500 dark:bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-bl-md font-medium" role="status" aria-live="polite">
                Detected
              </div>
            )}
            {isSelected && (
              <div className="absolute top-2 right-2 text-primary" aria-hidden="true">
                <Check className="h-4 w-4" />
              </div>
            )}
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2 rounded-md',
                    isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                  aria-hidden="true"
                >
                  <option.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm font-medium leading-none">{option.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <CardDescription id={`project-type-${option.type}-desc`} className="text-xs">
                {option.description}
              </CardDescription>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
