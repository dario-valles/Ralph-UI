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
  ArrowRight,
  ArrowLeft,
  FolderOpen,
  ChevronDown,
  MessageSquareText,
  Check,
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

type WorkflowMode = 'guided' | 'github'

interface WorkflowOption {
  id: WorkflowMode
  label: string
  description: string
  icon: React.ReactNode
  badge?: string
  features: string[]
}

const WORKFLOW_OPTIONS: WorkflowOption[] = [
  {
    id: 'guided',
    label: 'Full Project Plan',
    description: 'AI-guided workflow with research, requirements, and roadmap',
    icon: <MessageSquareText className="h-6 w-6" />,
    badge: 'Recommended',
    features: [
      'Deep questioning session',
      'Parallel research agents',
      'Requirements scoping',
      'Roadmap generation',
    ],
  },
  {
    id: 'github',
    label: 'Import from GitHub',
    description: 'Convert GitHub issues into a PRD with stories',
    icon: <Github className="h-6 w-6" />,
    features: [
      'Pull issues from any repo',
      'Filter by labels/milestone',
      'Auto-extract acceptance criteria',
    ],
  },
]

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
    new_feature: 'My Feature',        // Shorter, more user-friendly
    bug_fix: 'Bug Fix',
    refactoring: 'Refactoring',
    api_integration: 'API Integration',
    full_new_app: 'My Project',        // Changed from "Full New App PRD"
    general: 'My PRD',
  }
  return typeLabels[prdType] || 'My Project'
}

export function PRDTypeSelector({
  onSelect,
  loading = false,
  className,
  defaultProjectPath,
}: PRDTypeSelectorProps) {
  const [step, setStep] = useState<'mode' | 'type'>('mode')
  const [selectedMode, setSelectedMode] = useState<WorkflowMode | null>(null)
  const [selectedType, setSelectedType] = useState<PRDTypeValue | null>(null)
  const [projectPath, setProjectPath] = useState<string>(defaultProjectPath || '')
  const [showProjectPicker, setShowProjectPicker] = useState(!defaultProjectPath)
  const [showGitHubImport, setShowGitHubImport] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')

  // Derive project name from path
  const projectName = projectPath ? projectPath.split('/').pop() || projectPath : ''

  const handleModeSelect = (mode: WorkflowMode) => {
    setSelectedMode(mode)

    if (mode === 'github') {
      setShowGitHubImport(true)
      return
    }

    // Go straight to type selection
    setStep('type')
  }

  const handleBack = () => {
    setStep('mode')
    setSelectedType(null)
  }

  const handleContinue = () => {
    if (selectedMode === 'guided' && selectedType) {
      // All types go directly to naming dialog
      setSessionTitle(getDefaultTitle(selectedType))
      setShowNameDialog(true)
    }
  }

  const handleQuickPRDSelect = (prdType: PRDTypeValue) => {
    setSelectedType(prdType)
    setSessionTitle(getDefaultTitle(prdType))
    setShowNameDialog(true)
    // Set selectedMode to null to indicate this is a quick PRD (not guided)
    setSelectedMode(null)
  }

  const handleConfirmName = () => {
    const title = sessionTitle.trim() || undefined
    if (selectedType) {
      // If selectedMode is null, it's a quick PRD (guidedMode: false)
      // Otherwise, it's a full project plan (guidedMode: true)
      const isGuided = selectedMode === 'guided'
      onSelect(selectedType, isGuided, projectPath || undefined, title)
    }
    setShowNameDialog(false)
  }

  const handleCancelName = () => {
    setShowNameDialog(false)
    setSessionTitle('')
  }

  const canContinue = selectedMode === 'guided' && selectedType

  const nameSessionDialog = (
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
  )

  // Step 1: Workflow Mode Selection
  if (step === 'mode') {
    return (
      <Card className={cn('w-full max-w-2xl mx-auto', className)}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">How would you like to create your PRD?</CardTitle>
          <CardDescription>Choose a workflow that fits your project needs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workflow Mode Selection */}
          <div className="grid grid-cols-1 gap-4">
            {WORKFLOW_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleModeSelect(option.id)}
                disabled={loading}
                aria-label={option.label}
                className={cn(
                  'flex flex-col p-5 rounded-lg border-2 text-left transition-all',
                  'hover:border-primary/50 hover:bg-accent/50',
                  selectedMode === option.id
                    ? 'ring-2 ring-primary ring-offset-2 border-primary bg-primary/5'
                    : 'border-border',
                  loading && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'shrink-0 p-2 rounded-lg',
                      selectedMode === option.id
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base">{option.label}</span>
                      {option.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {option.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{option.description}</p>
                    <ul className="space-y-1">
                      {option.features.map((feature, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </button>
            ))}
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
        </CardContent>
      </Card>
    )
  }

  // Step 2: PRD Type Selection (only for Guided Interview)
  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">What type of PRD are you creating?</CardTitle>
        <CardDescription>Select a type to get tailored questions and guidance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick PRD Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Quick PRD</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICK_PRD_TYPES.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.value}
                  onClick={() => handleQuickPRDSelect(type.value)}
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
            })}
          </div>
        </div>

        {/* Full Project Plan Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Full Project Plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FULL_PRD_TYPES.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  disabled={loading}
                  aria-label={type.label}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
                    type.color,
                    selectedType === type.value
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'border-transparent',
                    'hover:shadow-sm',
                    loading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{type.label}</div>
                    <div className="text-sm text-muted-foreground">{type.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* General Option */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Other</h3>
          <div className="grid grid-cols-1 gap-3">
            {GENERAL_PRD_TYPES.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  disabled={loading}
                  aria-label={type.label}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
                    type.color,
                    selectedType === type.value
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'border-transparent',
                    'hover:shadow-sm',
                    loading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{type.label}</div>
                    <div className="text-sm text-muted-foreground">{type.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={handleBack} disabled={loading} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue || loading} className="gap-2">
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {/* Name Session Dialog */}
        {nameSessionDialog}
      </CardContent>
    </Card>
  )
}
