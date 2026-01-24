/**
 * Export Phase Component
 *
 * Final step of GSD workflow - export to Ralph PRD format
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Rocket, ArrowLeft, Loader2, Settings, AlertTriangle, HelpCircle } from 'lucide-react'
import type { PrdExecutionConfig } from '@/types/planning'
import { validateExecutionConfig, hasAnyExecutionConfigFields } from '@/types/planning'

export interface ExportPhaseState {
  prdName: string
  branch: string
  includeV2: boolean
  showSettings: boolean
  executionConfig: PrdExecutionConfig
}

export interface ExportPhaseProps {
  exportState: ExportPhaseState
  onExportStateChange: (update: Partial<ExportPhaseState>) => void
  onExport: () => void
  onBack: () => void
  isLoading: boolean
}

export function ExportPhase({
  exportState,
  onExportStateChange,
  onExport,
  onBack,
  isLoading,
}: ExportPhaseProps) {
  const validationError = hasAnyExecutionConfigFields(exportState.executionConfig)
    ? validateExecutionConfig(exportState.executionConfig)
    : null

  return (
    <Card className="m-4">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <CardTitle>Export to Ralph</CardTitle>
        </div>
        <CardDescription>
          Convert your planning documents to Ralph PRD format for execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">PRD Name</label>
          <input
            type="text"
            value={exportState.prdName}
            onChange={(e) => onExportStateChange({ prdName: e.target.value })}
            placeholder="my-feature"
            className="w-full mt-1 px-3 py-2 border rounded-md"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Branch</label>
          <input
            type="text"
            value={exportState.branch}
            onChange={(e) => onExportStateChange({ branch: e.target.value })}
            placeholder="main"
            className="w-full mt-1 px-3 py-2 border rounded-md"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includeV2"
            checked={exportState.includeV2}
            onChange={(e) => onExportStateChange({ includeV2: e.target.checked })}
          />
          <label htmlFor="includeV2" className="text-sm">
            Include V2 requirements (as lower priority)
          </label>
        </div>

        {/* Execution Settings Section */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Execution Settings</span>
              <Tooltip
                content="Configure execution settings to store with this PRD. These settings will override global config when running. Leave empty to use your global config."
                side="right"
              >
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </Tooltip>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onExportStateChange({ showSettings: !exportState.showSettings })}
            >
              {exportState.showSettings ? 'Hide' : 'Configure'}
            </Button>
          </div>

          {exportState.showSettings && (
            <div className="space-y-3 pl-6 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Agent Type</label>
                    <Tooltip content="AI coding agent to use for this PRD" side="top">
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </Tooltip>
                  </div>
                  <select
                    value={exportState.executionConfig.agentType || ''}
                    onChange={(e) =>
                      onExportStateChange({
                        executionConfig: {
                          ...exportState.executionConfig,
                          agentType: e.target.value || undefined,
                        },
                      })
                    }
                    className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md"
                  >
                    <option value="">Use global config</option>
                    <option value="claude">Claude Code</option>
                    <option value="opencode">OpenCode</option>
                    <option value="cursor">Cursor Agent</option>
                    <option value="codex">Codex CLI</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Model</label>
                    <Tooltip content="Model name (e.g., claude-sonnet-4-5)" side="top">
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </Tooltip>
                  </div>
                  <input
                    type="text"
                    value={exportState.executionConfig.model || ''}
                    onChange={(e) =>
                      onExportStateChange({
                        executionConfig: {
                          ...exportState.executionConfig,
                          model: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="e.g., claude-sonnet-4-5"
                    className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Max Iterations
                    </label>
                    <Tooltip content="Maximum iterations before stopping" side="top">
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={exportState.executionConfig.maxIterations || ''}
                    onChange={(e) =>
                      onExportStateChange({
                        executionConfig: {
                          ...exportState.executionConfig,
                          maxIterations: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })
                    }
                    placeholder="Use global config"
                    className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Max Cost ($)
                    </label>
                    <Tooltip content="Maximum cost in dollars before stopping" side="top">
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </Tooltip>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={exportState.executionConfig.maxCost || ''}
                    onChange={(e) =>
                      onExportStateChange({
                        executionConfig: {
                          ...exportState.executionConfig,
                          maxCost: e.target.value ? parseFloat(e.target.value) : undefined,
                        },
                      })
                    }
                    placeholder="No limit"
                    className="w-full mt-1 px-2 py-1.5 text-sm border rounded-md"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <Tooltip content="Run tests after each iteration to verify changes" side="top">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportState.executionConfig.runTests ?? false}
                      onChange={(e) =>
                        onExportStateChange({
                          executionConfig: {
                            ...exportState.executionConfig,
                            runTests: e.target.checked || undefined,
                          },
                        })
                      }
                    />
                    <span>Run Tests</span>
                  </label>
                </Tooltip>
                <Tooltip content="Run linter after each iteration" side="top">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportState.executionConfig.runLint ?? false}
                      onChange={(e) =>
                        onExportStateChange({
                          executionConfig: {
                            ...exportState.executionConfig,
                            runLint: e.target.checked || undefined,
                          },
                        })
                      }
                    />
                    <span>Run Lint</span>
                  </label>
                </Tooltip>
                <Tooltip content="Run in a git worktree for isolation" side="top">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportState.executionConfig.useWorktree ?? true}
                      onChange={(e) =>
                        onExportStateChange({
                          executionConfig: {
                            ...exportState.executionConfig,
                            useWorktree: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Use Worktree</span>
                  </label>
                </Tooltip>
              </div>

              {hasAnyExecutionConfigFields(exportState.executionConfig) && (
                <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950 rounded-md text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    These settings will be stored with the PRD and used instead of your global
                    config when executing. You can clear them by clicking "Configure" and resetting
                    the values.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {validationError && (
          <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={onExport}
            disabled={!exportState.prdName || isLoading || !!validationError}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4 mr-2" />
            )}
            Export PRD
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
