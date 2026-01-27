import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Repeat, GitBranch, FileCode } from 'lucide-react'
import { ralphLoopApi, templateApi } from '@/lib/backend-api'
import type { PRDFile, TemplateInfo } from '@/types'
import { useAgentModelSelector } from '@/hooks/useAgentModelSelector'
import { AgentModelSelector } from '@/components/shared/AgentModelSelector'
import { getModelName } from '@/lib/model-api'
import { Input } from '@/components/ui/input'

// LocalStorage key for last-used template per project
const LAST_TEMPLATE_KEY = 'ralph-ui-last-template'

interface LastTemplateStorage {
  [projectPath: string]: string // projectPath -> templateName
}

/** Get last-used template for a project from localStorage */
function getLastUsedTemplate(projectPath: string): string | null {
  try {
    const stored = localStorage.getItem(LAST_TEMPLATE_KEY)
    if (stored) {
      const data: LastTemplateStorage = JSON.parse(stored)
      return data[projectPath] || null
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null
}

/** Save last-used template for a project to localStorage */
function setLastUsedTemplate(projectPath: string, templateName: string): void {
  try {
    const stored = localStorage.getItem(LAST_TEMPLATE_KEY)
    const data: LastTemplateStorage = stored ? JSON.parse(stored) : {}
    data[projectPath] = templateName
    localStorage.setItem(LAST_TEMPLATE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}


interface PRDFileExecutionDialogProps {
  file: PRDFile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function PRDFileExecutionDialog({
  file,
  open,
  onOpenChange,
  onSuccess,
}: PRDFileExecutionDialogProps): React.JSX.Element {
  const navigate = useNavigate()
  const [executing, setExecuting] = useState(false)
  const [useWorktree, setUseWorktree] = useState(true)
  const [maxCost, setMaxCost] = useState<string>('')
  const [maxIterations, setMaxIterations] = useState(50)
  const [runTests, setRunTests] = useState(true)
  const [runLint, setRunLint] = useState(true)

  // Template selection state (US-014)
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

  // Use the combined agent/model selector hook (supports provider variants)
  const {
    agentType,
    providerId,
    modelId,
    setModelId,
    models,
    modelsLoading,
    agentOptions,
    agentsLoading,
    handleAgentOptionChange,
    currentAgentOptionValue,
  } = useAgentModelSelector({ initialAgent: 'claude' })

  // Load templates when dialog opens (US-014)
  const loadTemplates = useCallback(async () => {
    if (!file?.projectPath) return

    setTemplatesLoading(true)
    try {
      const loadedTemplates = await templateApi.list(file.projectPath)
      setTemplates(loadedTemplates)

      // Set initial template selection:
      // 1. Last-used template for this project
      // 2. First template in list (usually default/builtin)
      const lastUsed = getLastUsedTemplate(file.projectPath)
      if (lastUsed && loadedTemplates.some((t) => t.name === lastUsed)) {
        setSelectedTemplate(lastUsed)
      } else if (loadedTemplates.length > 0) {
        // Default to first template (usually 'task_prompt' builtin)
        setSelectedTemplate(loadedTemplates[0].name)
      }
    } catch (err) {
      console.error('[PRD Execution] Failed to load templates:', err)
    } finally {
      setTemplatesLoading(false)
    }
  }, [file?.projectPath])

  // Load templates when dialog opens
  useEffect(() => {
    if (open && file?.projectPath) {
      loadTemplates()
    }
  }, [open, file?.projectPath, loadTemplates])

  async function handleExecute(): Promise<void> {
    if (!file) {
      console.error('[Ralph Loop] No file provided')
      return
    }

    setExecuting(true)
    try {
      // Extract prdName from file.id (e.g., "file:new-feature-prd-abc123" -> "new-feature-prd-abc123")
      const prdName = file.id.replace('file:', '')
      const branch = `ralph-${prdName.slice(0, 30)}`

      // Save last-used template for this project
      if (selectedTemplate) {
        setLastUsedTemplate(file.projectPath, selectedTemplate)
      }

      // Convert file PRD to Ralph format
      await ralphLoopApi.convertPrdFileToRalph({
        projectPath: file.projectPath,
        prdName,
        branch,
        agentType: agentType,
        model: modelId,
        providerId: providerId, // Pass provider for Claude variants (e.g., Z.AI)
        maxIterations: maxIterations,
        maxCost: maxCost ? parseFloat(maxCost) : undefined,
        runTests: runTests,
        runLint: runLint,
        useWorktree,
        templateName: selectedTemplate || undefined,
      })

      onOpenChange(false)
      onSuccess?.()

      // Navigate to Ralph Loop page with the project path and PRD name
      navigate(
        `/ralph-loop?project=${encodeURIComponent(file.projectPath)}&prd=${encodeURIComponent(prdName)}`
      )
    } catch (err) {
      console.error('[PRD Execution] Failed:', err)
    } finally {
      setExecuting(false)
    }
  }

  // Get selected template info for display
  const selectedTemplateInfo = templates.find((t) => t.name === selectedTemplate)

  // Get the display name for the current agent option (for summary)
  const currentAgentLabel = agentOptions.find((o) => o.value === currentAgentOptionValue)?.label || agentType

  // Derive quality gates label from state
  const qualityGatesLabel = [runTests && 'tests', runLint && 'lint'].filter(Boolean).join(', ') || 'none'

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Execute PRD: ${file?.title || ''}`}
      description="Configure how the PRD will be executed using the Ralph Loop technique. Progress persists in files with a fresh agent each iteration."
      size="2xl"
      fullPageOnMobile={true}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={executing}
            className="min-h-11 sm:min-h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExecute}
            disabled={executing || !file}
            className="min-h-11 sm:min-h-9"
          >
            {executing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <Repeat className="mr-2 h-4 w-4" />
                Start Ralph Loop
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Agent Type and Model - with provider variants support */}
        <AgentModelSelector
          agentType={agentType}
          modelId={modelId}
          onModelChange={setModelId}
          models={models}
          modelsLoading={modelsLoading}
          agentOptions={agentOptions}
          currentAgentOptionValue={currentAgentOptionValue}
          onAgentOptionChange={handleAgentOptionChange}
          agentsLoading={agentsLoading}
          variant="default"
        />

        {/* Template Selection (US-014) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="template">Prompt Template</Label>
          </div>
          <Select
            id="template"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            disabled={templatesLoading}
            data-testid="template-select"
            className="min-h-11 sm:min-h-9 text-base sm:text-sm"
          >
            {templatesLoading ? (
              <option>Loading templates...</option>
            ) : templates.length === 0 ? (
              <option value="">No templates available</option>
            ) : (
              templates.map((t) => (
                <option key={`${t.source}-${t.name}`} value={t.name}>
                  {t.name} ({t.source})
                </option>
              ))
            )}
          </Select>
          {selectedTemplateInfo && (
            <p className="text-xs text-muted-foreground">
              {selectedTemplateInfo.description ||
                `Template from ${selectedTemplateInfo.source} scope`}
            </p>
          )}
        </div>

        {/* Max Iterations and Max Cost */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="max-iterations">Max Iterations</Label>
            <Select
              id="max-iterations"
              value={maxIterations.toString()}
              onChange={(e) => setMaxIterations(parseInt(e.target.value))}
              className="min-h-11 sm:min-h-9 text-base sm:text-sm"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Total iterations before the loop stops (safety limit)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-cost">Max Cost ($)</Label>
            <Input
              id="max-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              placeholder="No limit"
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
              className="min-h-11 sm:min-h-9 text-base sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">Stop when API costs exceed this limit</p>
          </div>
        </div>

        {/* Worktree Isolation Option */}
        <div className="rounded-md border border-dashed border-green-500/50 bg-green-500/5 p-4">
          <label className="flex items-start gap-3">
            <Checkbox
              checked={useWorktree}
              onCheckedChange={(checked) => setUseWorktree(checked as boolean)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <span className="text-sm font-medium flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Use Worktree Isolation
                <span className="text-xs text-muted-foreground font-normal">(Recommended)</span>
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Work happens in an isolated git worktree, keeping the main branch clean. The
                worktree is preserved after completion for review.
              </p>
            </div>
          </label>
        </div>

        {/* Quality Gates */}
        <div className="space-y-3">
          <Label>Quality Gates</Label>
          <div className="space-y-3">
            {[
              { key: 'tests', checked: runTests, onChange: setRunTests, label: 'Run tests before marking tasks complete' },
              { key: 'lint', checked: runLint, onChange: setRunLint, label: 'Run linter before marking tasks complete' },
            ].map(({ key, checked, onChange, label }) => (
              <label key={key} className="flex items-center gap-3 min-h-11 sm:min-h-auto">
                <Checkbox checked={checked} onCheckedChange={(c) => onChange(c as boolean)} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-md bg-muted p-4">
          <p className="text-sm font-medium">Summary:</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>• Agent: {currentAgentLabel}</li>
            <li>• Model: {getModelName(models, modelId)}</li>
            <li>
              • Template: {selectedTemplate || 'default'}
              {selectedTemplateInfo ? ` (${selectedTemplateInfo.source})` : ''}
            </li>
            <li>• Max iterations: {maxIterations}</li>
            <li>• Max cost: {maxCost ? `$${maxCost}` : 'no limit'}</li>
            <li>• Worktree isolation: {useWorktree ? 'enabled' : 'disabled'}</li>
            <li>• Quality gates: {qualityGatesLabel}</li>
            <li className="text-green-600 dark:text-green-400">• PRD file: {file?.filePath}</li>
            <li className="text-green-600 dark:text-green-400">
              • Each iteration spawns a fresh agent
            </li>
          </ul>
        </div>
      </div>
    </ResponsiveModal>
  )
}
