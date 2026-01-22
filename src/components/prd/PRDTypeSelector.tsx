import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  FolderOpen,
  ChevronDown,
  Workflow,
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
} from 'lucide-react'
import { ProjectPicker } from '@/components/projects/ProjectPicker'
import { ImportGitHubIssuesDialog } from './ImportGitHubIssuesDialog'
import type { PRDTypeValue } from '@/types'
import { cn } from '@/lib/utils'

type WorkflowMode = 'guided' | 'gsd' | 'github'

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
    label: 'Guided Interview',
    description: 'AI asks structured questions to build your PRD step by step',
    icon: <MessageSquareText className="h-6 w-6" />,
    features: [
      'Type-specific questions',
      'Iterative refinement',
      'Quick for small tasks',
    ],
  },
  {
    id: 'gsd',
    label: 'GSD Workflow',
    description: 'Full spec-driven workflow for comprehensive project planning',
    icon: <Workflow className="h-6 w-6" />,
    badge: 'Recommended for new projects',
    features: [
      'Deep questioning phase',
      'Research agents',
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

interface PRDTypeOption {
  value: PRDTypeValue
  label: string
  description: string
  icon: LucideIcon
  color: string
}

const PRD_TYPES: PRDTypeOption[] = [
  {
    value: 'new_feature',
    label: 'New Feature',
    description: 'Build something new from scratch',
    icon: Sparkles,
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  },
  {
    value: 'full_new_app',
    label: 'Full New App',
    description: 'Design and plan an entirely new application',
    icon: Rocket,
    color: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
  },
  {
    value: 'bug_fix',
    label: 'Bug Fix',
    description: 'Fix an existing problem or issue',
    icon: Bug,
    color: 'bg-red-50 border-red-200 hover:bg-red-100',
  },
  {
    value: 'refactoring',
    label: 'Refactoring',
    description: 'Improve code without changing behavior',
    icon: RefreshCcw,
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
  },
  {
    value: 'api_integration',
    label: 'API Integration',
    description: 'Integrate with external APIs or services',
    icon: Plug,
    color: 'bg-green-50 border-green-200 hover:bg-green-100',
  },
  {
    value: 'general',
    label: 'General',
    description: 'Other product requirements',
    icon: FileText,
    color: 'bg-gray-50 border-gray-200 hover:bg-gray-100',
  },
]

interface PRDTypeSelectorProps {
  onSelect: (prdType: PRDTypeValue, guidedMode: boolean, projectPath?: string, gsdMode?: boolean) => void
  loading?: boolean
  className?: string
  defaultProjectPath?: string
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

  // Derive project name from path
  const projectName = projectPath ? projectPath.split('/').pop() || projectPath : ''

  const handleModeSelect = (mode: WorkflowMode) => {
    setSelectedMode(mode)
    if (mode === 'guided') {
      // For guided mode, go to type selection step
      setStep('type')
    } else if (mode === 'github') {
      // For GitHub mode, show the import dialog
      setShowGitHubImport(true)
    }
  }

  const handleBack = () => {
    setStep('mode')
    setSelectedType(null)
  }

  const handleContinue = () => {
    if (selectedMode === 'gsd') {
      // GSD mode - use default type
      onSelect('new_feature', false, projectPath || undefined, true)
    } else if (selectedMode === 'guided' && selectedType) {
      // Guided mode with selected type
      onSelect(selectedType, true, projectPath || undefined, false)
    }
  }

  const canContinue = selectedMode === 'gsd' || (selectedMode === 'guided' && selectedType)

  // Step 1: Workflow Mode Selection
  if (step === 'mode') {
    return (
      <Card className={cn('w-full max-w-2xl mx-auto', className)}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">How would you like to create your PRD?</CardTitle>
          <CardDescription>
            Choose a workflow that fits your project needs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workflow Mode Selection */}
          <div className="grid grid-cols-1 gap-4">
            {WORKFLOW_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleModeSelect(option.id)}
                disabled={loading}
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
                  <div className={cn(
                    'shrink-0 p-2 rounded-lg',
                    selectedMode === option.id
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base">{option.label}</span>
                      {option.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {option.description}
                    </p>
                    <ul className="space-y-1">
                      {option.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
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

          {/* Continue Button (only for GSD mode, guided goes to next step automatically) */}
          {selectedMode === 'gsd' && (
            <div className="flex justify-end">
              <Button
                onClick={handleContinue}
                disabled={loading}
                className="gap-2"
              >
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
          )}
        </CardContent>

        {/* GitHub Import Dialog */}
        <ImportGitHubIssuesDialog
          open={showGitHubImport}
          onOpenChange={setShowGitHubImport}
          projectPath={projectPath}
          onSuccess={(result) => {
            setShowGitHubImport(false)
            // Navigate to the imported PRD if any issues were imported
            if (result.importedCount > 0) {
              onSelect('general', false, projectPath || undefined, false)
            }
          }}
        />
      </Card>
    )
  }

  // Step 2: PRD Type Selection (only for Guided Interview)
  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">What type of PRD are you creating?</CardTitle>
        <CardDescription>
          Select a type to get tailored questions and guidance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* PRD Type Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRD_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                disabled={loading}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
                  type.color,
                  selectedType === type.value
                    ? 'ring-2 ring-primary ring-offset-2'
                    : 'border-transparent',
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

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={loading}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!canContinue || loading}
            className="gap-2"
          >
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
      </CardContent>
    </Card>
  )
}
