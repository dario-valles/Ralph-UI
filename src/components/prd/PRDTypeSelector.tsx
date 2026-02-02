import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RefreshCw,
  FolderOpen,
  ChevronDown,
  Sparkles,
  Bug,
  RefreshCcw,
  Plug,
  FileText,
  Rocket,
  LucideIcon,
  Github,
  Pencil,
} from 'lucide-react'
import { ProjectPicker } from '@/components/projects/ProjectPicker'
import { ImportGitHubIssuesDialog } from './ImportGitHubIssuesDialog'
import type { PRDTypeValue } from '@/types'
import { cn } from '@/lib/utils'

const QUICK_PRD_TYPES: PRDTypeOption[] = [
  {
    value: 'bug_fix',
    label: 'Bug Fix',
    description: 'Fix an existing problem or issue',
    icon: Bug,
    color: 'bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-900/50 dark:hover:bg-red-950/50',
  },
  {
    value: 'refactoring',
    label: 'Refactoring',
    description: 'Improve code without changing behavior',
    icon: RefreshCcw,
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/30 dark:border-purple-900/50 dark:hover:bg-purple-950/50',
  },
  {
    value: 'api_integration',
    label: 'API Integration',
    description: 'Integrate with external APIs or services',
    icon: Plug,
    color: 'bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-950/30 dark:border-green-900/50 dark:hover:bg-green-950/50',
  },
]

const FULL_PRD_TYPES: PRDTypeOption[] = [
  {
    value: 'new_feature',
    label: 'New Feature',
    description: 'Build something new from scratch',
    icon: Sparkles,
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50 dark:hover:bg-blue-950/50',
  },
  {
    value: 'full_new_app',
    label: 'Full New App',
    description: 'Design and plan an entirely new application',
    icon: Rocket,
    color: 'bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50 dark:hover:bg-amber-950/50',
  },
]

const GENERAL_PRD_TYPES: PRDTypeOption[] = [
  {
    value: 'general',
    label: 'General',
    description: 'Other product requirements',
    icon: FileText,
    color: 'bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-gray-800/50 dark:border-gray-700 dark:hover:bg-gray-800',
  },
]

interface PRDTypeOption {
  value: PRDTypeValue
  label: string
  description: string
  icon: LucideIcon
  color: string
}


interface PRDTypeSelectorProps {
  onSelect: (
    prdType: PRDTypeValue,
    guidedMode: boolean,
    projectPath?: string,
    title?: string
  ) => void
  loading?: boolean
  className?: string
  defaultProjectPath?: string
}

// Helper to get default title for PRD type
function getDefaultTitle(prdType: PRDTypeValue): string {
  const typeLabels: Record<PRDTypeValue, string> = {
    new_feature: 'My Feature',
    bug_fix: 'Bug Fix',
    refactoring: 'Refactoring',
    api_integration: 'API Integration',
    full_new_app: 'My Project',
    general: 'My PRD',
  }
  return typeLabels[prdType] || 'My Project'
}

// Check if a PRD type is a "quick" type (simpler workflow)
function isQuickPRDType(prdType: PRDTypeValue): boolean {
  return ['bug_fix', 'refactoring', 'api_integration'].includes(prdType)
}

export function PRDTypeSelector({
  onSelect,
  loading = false,
  className,
  defaultProjectPath,
}: PRDTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<PRDTypeValue | null>(null)
  const [projectPath, setProjectPath] = useState<string>(defaultProjectPath || '')
  const [showProjectPicker, setShowProjectPicker] = useState(!defaultProjectPath)
  const [showGitHubImport, setShowGitHubImport] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')

  // Derive project name from path
  const projectName = projectPath ? projectPath.split('/').pop() || projectPath : ''

  const handleTypeSelect = (prdType: PRDTypeValue) => {
    setSelectedType(prdType)
    setSessionTitle(getDefaultTitle(prdType))
    setShowNameDialog(true)
  }

  const handleConfirmName = () => {
    const title = sessionTitle.trim() || undefined
    if (selectedType) {
      // Quick PRD types use non-guided mode, full project types use guided mode
      const isGuided = !isQuickPRDType(selectedType)
      onSelect(selectedType, isGuided, projectPath || undefined, title)
    }
    setShowNameDialog(false)
  }

  const handleCancelName = () => {
    setShowNameDialog(false)
    setSessionTitle('')
    setSelectedType(null)
  }

  // Render a single type card
  const renderTypeCard = (type: PRDTypeOption) => {
    const Icon = type.icon
    return (
      <button
        key={type.value}
        onClick={() => handleTypeSelect(type.value)}
        disabled={loading}
        aria-label={type.label}
        className={cn(
          'flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
          type.color,
          'hover:shadow-sm',
          loading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="shrink-0 mt-0.5">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium text-sm">{type.label}</div>
          <div className="text-xs text-muted-foreground">{type.description}</div>
        </div>
      </button>
    )
  }

  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create a new PRD</CardTitle>
        <CardDescription>Select a type to get tailored questions and guidance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick PRD Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Quick PRD</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICK_PRD_TYPES.map(renderTypeCard)}
          </div>
        </div>

        {/* Full Project Plan Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Full Project Plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FULL_PRD_TYPES.map(renderTypeCard)}
          </div>
        </div>

        {/* General Option */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Other</h3>
          <div className="grid grid-cols-1 gap-3">
            {GENERAL_PRD_TYPES.map(renderTypeCard)}
          </div>
        </div>

        {/* Project Context */}
        <div className="p-4 bg-muted/50 rounded-lg">
          {projectPath && !showProjectPicker ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Project Context</Label>
              <button
                onClick={() => setShowProjectPicker(true)}
                disabled={loading}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2 rounded-md border bg-background text-left',
                  'hover:bg-accent transition-colors',
                  loading && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{projectName}</span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
              <p className="text-xs text-muted-foreground">
                Using active workspace. Click to change.
              </p>
            </div>
          ) : (
            <ProjectPicker
              value={projectPath}
              onChange={(path) => {
                setProjectPath(path)
                if (path) setShowProjectPicker(false)
              }}
              label="Project Context"
              placeholder="Select a project folder for context"
              disabled={loading}
            />
          )}
        </div>

        {/* GitHub Import as secondary action */}
        <div className="border-t border-border" />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowGitHubImport(true)}
          disabled={loading}
        >
          <Github className="h-4 w-4 mr-2" />
          Import from GitHub Issues
        </Button>

        {/* GitHub Import Dialog */}
        <ImportGitHubIssuesDialog
          open={showGitHubImport}
          onOpenChange={setShowGitHubImport}
          projectPath={projectPath}
          onSuccess={(result) => {
            setShowGitHubImport(false)
            // Navigate to the imported PRD if any issues were imported
            if (result.importedCount > 0) {
              onSelect('general', false, projectPath || undefined)
            }
          }}
        />

        {/* Name Session Dialog */}
        <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Name Your Session
              </DialogTitle>
              <DialogDescription>
                Give your PRD session a memorable name to easily find it later.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="session-name" className="text-sm font-medium">
                Session Name
              </Label>
              <Input
                id="session-name"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder="Enter a name for this session"
                className="mt-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmName()
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelName}>
                Cancel
              </Button>
              <Button onClick={handleConfirmName} disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Session'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
