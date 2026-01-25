import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertCircle,
  Loader2,
  FileCode,
  Plus,
  Pencil,
  Trash2,
  Copy,
  FolderOpen,
  Globe,
  Package,
  Eye,
  EyeOff,
  Save,
  Info,
} from 'lucide-react'
import type { RalphConfig, RalphTemplateConfig, TemplateInfo, TemplatePreviewResult } from '@/types'

interface TemplateSettingsProps {
  config: RalphConfig | null
  templates: TemplateInfo[]
  templatesLoading: boolean
  selectedTemplate: TemplateInfo | null
  templateContent: string
  setTemplateContent: (content: string) => void
  templateContentLoading: boolean
  isEditingTemplate: boolean
  setIsEditingTemplate: (editing: boolean) => void
  isCreatingTemplate: boolean
  newTemplateName: string
  setNewTemplateName: (name: string) => void
  newTemplateScope: 'project' | 'global'
  setNewTemplateScope: (scope: 'project' | 'global') => void
  templateSaving: boolean
  templateError: string | null
  isPreviewOpen: boolean
  setIsPreviewOpen: (open: boolean) => void
  previewLoading: boolean
  previewResult: TemplatePreviewResult | null
  setPreviewResult: (result: TemplatePreviewResult | null) => void
  activeProject: { id: string; name: string; path: string } | undefined
  savedMessage: string | null
  setSavedMessage: (message: string | null) => void
  updateTemplatesConfig: (updates: Partial<RalphTemplateConfig>) => void
  loadTemplateContent: (template: TemplateInfo) => Promise<void>
  handleSaveTemplate: () => Promise<void>
  handleDeleteTemplate: () => Promise<void>
  handleCreateNew: () => void
  handleCancelEdit: () => void
  handlePreviewTemplate: () => Promise<void>
}

export function TemplateSettings({
  config,
  templates,
  templatesLoading,
  selectedTemplate,
  templateContent,
  setTemplateContent,
  templateContentLoading,
  isEditingTemplate,
  setIsEditingTemplate,
  isCreatingTemplate,
  newTemplateName,
  setNewTemplateName,
  newTemplateScope,
  setNewTemplateScope,
  templateSaving,
  templateError,
  isPreviewOpen,
  setIsPreviewOpen,
  previewLoading,
  previewResult,
  setPreviewResult,
  activeProject,
  setSavedMessage,
  updateTemplatesConfig,
  loadTemplateContent,
  handleSaveTemplate,
  handleDeleteTemplate,
  handleCreateNew,
  handleCancelEdit,
  handlePreviewTemplate,
}: TemplateSettingsProps) {
  // Get source icon for template
  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'project':
        return <FolderOpen className="h-3 w-3" />
      case 'global':
        return <Globe className="h-3 w-3" />
      case 'builtin':
        return <Package className="h-3 w-3" />
      default:
        return <FileCode className="h-3 w-3" />
    }
  }

  // Apply syntax highlighting to Tera/Jinja2 template code
  const highlightedContent = useMemo(() => {
    if (!templateContent) return ''
    // Simple highlighting for display (actual editing uses plain textarea)
    return templateContent
      .replace(/(\{\{.*?\}\})/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>')
      .replace(/(\{%.*?%\})/g, '<span class="text-purple-600 dark:text-purple-400">$1</span>')
      .replace(/(\{#.*?#\})/g, '<span class="text-gray-500 dark:text-gray-400 italic">$1</span>')
  }, [templateContent])

  return (
    <div className="space-y-4">
      {/* Default Template Setting (US-014) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Default Template
          </CardTitle>
          <CardDescription>
            Select the default template for Ralph Loop executions. This can be overridden when
            starting a new execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="default-template">Default Template</Label>
                <Select
                  id="default-template"
                  value={config.templates.defaultTemplate || ''}
                  onChange={(e) =>
                    updateTemplatesConfig({
                      defaultTemplate: e.target.value || undefined,
                    })
                  }
                  disabled={templatesLoading}
                  data-testid="default-template-select"
                >
                  <option value="">Use first available template</option>
                  {templates.map((t) => (
                    <option key={`${t.source}-${t.name}`} value={t.name}>
                      {t.name} ({t.source})
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  The template to use by default when starting new Ralph Loop executions.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Backend configuration not available. Running in development mode.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Template Editor Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Template Editor
              </CardTitle>
              <CardDescription>
                Create and edit prompt templates for AI agent tasks. Templates use Tera/Jinja2
                syntax.
              </CardDescription>
            </div>
            <Button onClick={handleCreateNew} disabled={templatesLoading || isEditingTemplate}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {templateError && (
            <div className="mb-4 p-3 rounded-md border border-destructive bg-destructive/10">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{templateError}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Template List */}
            <div className="lg:col-span-1">
              <div className="border rounded-lg">
                <div className="p-3 border-b bg-muted/30">
                  <h4 className="text-sm font-medium">Available Templates</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeProject ? `Project: ${activeProject.name}` : 'No project selected'}
                  </p>
                </div>
                <ScrollArea className="h-[400px]">
                  {templatesLoading ? (
                    <div className="flex items-center justify-center h-20">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No templates found. Create one to get started.
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {templates.map((template) => (
                        <button
                          key={`${template.source}-${template.name}`}
                          onClick={() => loadTemplateContent(template)}
                          disabled={isEditingTemplate}
                          className={`w-full text-left p-2 rounded-md transition-colors ${
                            selectedTemplate?.name === template.name &&
                            selectedTemplate?.source === template.source
                              ? 'bg-primary/10 border border-primary'
                              : 'hover:bg-muted border border-transparent'
                          } ${isEditingTemplate ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            {getSourceIcon(template.source)}
                            <span className="font-medium text-sm truncate">{template.name}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge
                              variant={template.source === 'builtin' ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {template.source}
                            </Badge>
                            {template.source === 'builtin' && (
                              <span className="text-xs text-muted-foreground">(read-only)</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Template Editor/Viewer */}
            <div className="lg:col-span-2">
              {isCreatingTemplate ? (
                <div className="border rounded-lg">
                  <div className="p-3 border-b bg-muted/30">
                    <h4 className="text-sm font-medium">Create New Template</h4>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="template-name">Template Name</Label>
                        <Input
                          id="template-name"
                          value={newTemplateName}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          placeholder="my_template"
                          pattern="[a-z0-9_-]+"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use lowercase letters, numbers, underscores, and hyphens
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="template-scope">Save To</Label>
                        <Select
                          id="template-scope"
                          value={newTemplateScope}
                          onChange={(e) =>
                            setNewTemplateScope(e.target.value as 'project' | 'global')
                          }
                        >
                          <option value="project" disabled={!activeProject}>
                            Project ({activeProject?.name || 'no project'})
                          </option>
                          <option value="global">Global (~/.ralph-ui/templates/)</option>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="template-content">Template Content</Label>
                      <Textarea
                        id="template-content"
                        value={templateContent}
                        onChange={(e) => setTemplateContent(e.target.value)}
                        className="font-mono text-sm h-[280px] resize-none"
                        placeholder="Enter Tera/Jinja2 template content..."
                      />
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="text-muted-foreground">Syntax:</span>
                        <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                          {'{{ variable }}'}
                        </code>
                        <code className="px-1 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                          {'{% if condition %}'}
                        </code>
                        <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                          {'{# comment #}'}
                        </code>
                      </div>
                    </div>

                    {/* Preview panel for new template (US-013) */}
                    {isPreviewOpen && previewResult && (
                      <div className="space-y-3 p-3 border rounded-md bg-muted/20">
                        {!previewResult.success && previewResult.error && (
                          <div className="p-2 rounded border border-destructive bg-destructive/10">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-destructive">Syntax Error</p>
                                <p className="text-xs text-destructive/80 font-mono mt-1">
                                  {previewResult.error}
                                </p>
                                {previewResult.errorLine && (
                                  <p className="text-xs text-destructive/70 mt-1">
                                    Line {previewResult.errorLine}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 text-xs">
                          <span className="text-muted-foreground">Used:</span>
                          {previewResult.variablesUsed.map((v) => (
                            <Badge
                              key={v}
                              variant="default"
                              className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-100"
                            >
                              {v}
                            </Badge>
                          ))}
                          <span className="text-muted-foreground ml-2">Unused:</span>
                          {previewResult.variablesUnused.slice(0, 3).map((v) => (
                            <Badge key={v} variant="outline" className="text-xs opacity-60">
                              {v}
                            </Badge>
                          ))}
                          {previewResult.variablesUnused.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{previewResult.variablesUnused.length - 3} more
                            </span>
                          )}
                        </div>
                        {previewResult.success && previewResult.output && (
                          <ScrollArea className="h-[120px] border rounded p-2 bg-background">
                            <pre className="font-mono text-xs whitespace-pre-wrap">
                              {previewResult.output}
                            </pre>
                          </ScrollArea>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handlePreviewTemplate}
                        disabled={previewLoading || !templateContent.trim()}
                      >
                        {previewLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4 mr-2" />
                        )}
                        Preview
                      </Button>
                      <Button
                        onClick={handleSaveTemplate}
                        disabled={templateSaving || !newTemplateName.trim()}
                      >
                        {templateSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Create Template
                      </Button>
                    </div>
                  </div>
                </div>
              ) : selectedTemplate ? (
                <div className="border rounded-lg">
                  <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        {getSourceIcon(selectedTemplate.source)}
                        {selectedTemplate.name}
                      </h4>
                      <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTemplate.source !== 'builtin' && (
                        <>
                          {!isEditingTemplate ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditingTemplate(true)}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDeleteTemplate}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSaveTemplate}
                                disabled={templateSaving}
                              >
                                {templateSaving ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3 mr-1" />
                                )}
                                Save
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviewTemplate}
                        disabled={previewLoading || !templateContent.trim()}
                      >
                        {previewLoading ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : isPreviewOpen ? (
                          <EyeOff className="h-3 w-3 mr-1" />
                        ) : (
                          <Eye className="h-3 w-3 mr-1" />
                        )}
                        {isPreviewOpen ? 'Hide' : 'Preview'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(templateContent)
                          setSavedMessage('Template copied to clipboard')
                          setTimeout(() => setSavedMessage(null), 2000)
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4">
                    {templateContentLoading ? (
                      <div className="flex items-center justify-center h-[300px]">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : isPreviewOpen && previewResult ? (
                      /* Template Preview Panel (US-013) */
                      <div className="space-y-4">
                        {/* Error display with line number */}
                        {!previewResult.success && previewResult.error && (
                          <div className="p-3 rounded-md border border-destructive bg-destructive/10">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-destructive">Syntax Error</p>
                                <p className="text-sm text-destructive/80 font-mono mt-1">
                                  {previewResult.error}
                                </p>
                                {previewResult.errorLine && (
                                  <p className="text-xs text-destructive/70 mt-1">
                                    Error on line {previewResult.errorLine}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Variable highlighting */}
                        <div className="flex flex-wrap gap-2 items-center text-xs">
                          <span className="text-muted-foreground font-medium">Variables:</span>
                          {previewResult.variablesUsed.map((v) => (
                            <Badge
                              key={v}
                              variant="default"
                              className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                            >
                              {v}
                            </Badge>
                          ))}
                          {previewResult.variablesUnused.map((v) => (
                            <Badge
                              key={v}
                              variant="outline"
                              className="text-muted-foreground opacity-60"
                            >
                              {v}
                            </Badge>
                          ))}
                        </div>

                        {/* Rendered output */}
                        {previewResult.success && previewResult.output && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium">Rendered Output</h5>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (previewResult.output) {
                                    navigator.clipboard.writeText(previewResult.output)
                                    setSavedMessage('Rendered output copied')
                                    setTimeout(() => setSavedMessage(null), 2000)
                                  }
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <ScrollArea className="h-[200px] border rounded-md p-3 bg-muted/30">
                              <pre className="font-mono text-sm whitespace-pre-wrap break-words">
                                {previewResult.output}
                              </pre>
                            </ScrollArea>
                          </div>
                        )}

                        {/* Sample context info */}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            Sample context used for preview
                          </summary>
                          <div className="mt-2 p-2 border rounded-md bg-muted/20 space-y-1">
                            <p>
                              <strong>Task:</strong> {previewResult.sampleContext.taskTitle}
                            </p>
                            <p>
                              <strong>PRD Progress:</strong>{' '}
                              {previewResult.sampleContext.prdCompletedCount}/
                              {previewResult.sampleContext.prdTotalCount} stories
                            </p>
                            <p>
                              <strong>Date:</strong> {previewResult.sampleContext.currentDate}
                            </p>
                          </div>
                        </details>

                        {/* Close preview button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsPreviewOpen(false)
                            setPreviewResult(null)
                          }}
                        >
                          <EyeOff className="h-3 w-3 mr-1" />
                          Close Preview
                        </Button>
                      </div>
                    ) : isEditingTemplate ? (
                      <div className="space-y-2">
                        <Textarea
                          value={templateContent}
                          onChange={(e) => setTemplateContent(e.target.value)}
                          className="font-mono text-sm h-[320px] resize-none"
                        />
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="text-muted-foreground">Syntax:</span>
                          <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                            {'{{ variable }}'}
                          </code>
                          <code className="px-1 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                            {'{% if condition %}'}
                          </code>
                          <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                            {'{# comment #}'}
                          </code>
                        </div>
                      </div>
                    ) : (
                      <ScrollArea className="h-[340px]">
                        <pre
                          className="font-mono text-sm whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: highlightedContent }}
                        />
                      </ScrollArea>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg h-full min-h-[400px] flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <FileCode className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Select a template to view or edit</p>
                    <p className="text-xs mt-1">Or click "New Template" to create one</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Available Variables Reference */}
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Available Template Variables</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">{'{{ task.title }}'}</code>
                <p className="text-muted-foreground mt-0.5">Task title</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">{'{{ task.description }}'}</code>
                <p className="text-muted-foreground mt-0.5">Task description</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">
                  {'{{ acceptance_criteria }}'}
                </code>
                <p className="text-muted-foreground mt-0.5">Acceptance criteria list</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">{'{{ recent_progress }}'}</code>
                <p className="text-muted-foreground mt-0.5">Recent progress entries</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">
                  {'{{ codebase_patterns }}'}
                </code>
                <p className="text-muted-foreground mt-0.5">From CLAUDE.md</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">
                  {'{{ prd_completed_count }}'}
                </code>
                <p className="text-muted-foreground mt-0.5">Completed story count</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">{'{{ current_date }}'}</code>
                <p className="text-muted-foreground mt-0.5">Today's date</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <code className="text-blue-600 dark:text-blue-400">{'{{ timestamp }}'}</code>
                <p className="text-muted-foreground mt-0.5">ISO timestamp</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
