import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Sparkles,
  Bug,
  RefreshCw,
  Plug,
  FileText,
  ArrowRight,
  FolderOpen,
  X,
  LucideIcon,
} from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { PRD_TYPES as PRD_TYPE_CONFIG, type PRDTypeConfig } from '@/config/prdTypes'
import type { PRDTypeValue } from '@/types'
import { cn } from '@/lib/utils'

// Map icon string names to actual Lucide icons
const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Bug,
  RefreshCw,
  Link: Plug,  // Using Plug for Link
  FileText,
}

interface PRDTypeOption {
  value: PRDTypeValue
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

// Transform config to component-specific format with rendered icons
const PRD_TYPES: PRDTypeOption[] = PRD_TYPE_CONFIG.map((config: PRDTypeConfig) => {
  const IconComponent = ICON_MAP[config.icon] || FileText
  return {
    value: config.value,
    label: config.label,
    description: config.description,
    icon: <IconComponent className="h-5 w-5" />,
    color: getColorClass(config.value),
  }
})

function getColorClass(value: PRDTypeValue): string {
  switch (value) {
    case 'new_feature':
      return 'bg-blue-50 border-blue-200 hover:bg-blue-100'
    case 'bug_fix':
      return 'bg-red-50 border-red-200 hover:bg-red-100'
    case 'refactoring':
      return 'bg-purple-50 border-purple-200 hover:bg-purple-100'
    case 'api_integration':
      return 'bg-green-50 border-green-200 hover:bg-green-100'
    default:
      return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
  }
}

interface PRDTypeSelectorProps {
  onSelect: (prdType: PRDTypeValue, guidedMode: boolean, projectPath?: string) => void
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
  const [selectedType, setSelectedType] = useState<PRDTypeValue | null>(null)
  const [guidedMode, setGuidedMode] = useState(true)
  const [projectPath, setProjectPath] = useState<string | undefined>(defaultProjectPath)

  useEffect(() => {
    setProjectPath(defaultProjectPath)
  }, [defaultProjectPath])

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      })
      if (selected && typeof selected === 'string') {
        setProjectPath(selected)
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error)
    }
  }

  const handleClearFolder = () => {
    setProjectPath(undefined)
  }

  const handleContinue = () => {
    if (selectedType) {
      onSelect(selectedType, guidedMode, projectPath)
    }
  }

  // Get display name for project path
  const getProjectDisplayName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
  }

  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">What type of PRD are you creating?</CardTitle>
        <CardDescription>
          Select a type to get tailored guidance and questions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Type Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRD_TYPES.map((type) => (
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
              <div className="shrink-0 mt-0.5">{type.icon}</div>
              <div>
                <div className="font-medium">{type.label}</div>
                <div className="text-sm text-muted-foreground">{type.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Project Path Selector */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Project Context</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectFolder}
              disabled={loading}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              {projectPath ? 'Change' : 'Select Folder'}
            </Button>
          </div>
          {projectPath ? (
            <div className="flex items-center gap-2 p-2 bg-background rounded border">
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate flex-1" title={projectPath}>
                {getProjectDisplayName(projectPath)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFolder}
                disabled={loading}
                className="h-6 w-6 p-0 shrink-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a project folder for better context-aware PRD generation
            </p>
          )}
        </div>

        {/* Guided Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="guided-mode" className="text-sm font-medium">
              Guided Interview Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              AI will ask structured questions to build your PRD
            </p>
          </div>
          <Switch
            id="guided-mode"
            checked={guidedMode}
            onCheckedChange={setGuidedMode}
            disabled={loading}
          />
        </div>

        {/* Continue Button */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {selectedType ? (
              <Badge variant="outline">
                {PRD_TYPES.find((t) => t.value === selectedType)?.label}
              </Badge>
            ) : (
              'Select a type to continue'
            )}
          </div>
          <Button
            onClick={handleContinue}
            disabled={!selectedType || loading}
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
