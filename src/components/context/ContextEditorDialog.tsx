/**
 * ContextEditorDialog - Manual editor for project context files
 *
 * Features:
 * - View and edit context files
 * - Switch between single/multi-file modes
 * - Configure injection settings
 * - Show token count with warning for large files
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  FileText,
  Settings2,
  Save,
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
  Check,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useContextStore } from '@/stores/contextStore'
import {
  capitalizeContextFileName,
  estimateTokens,
  MAX_CONTEXT_FILE_SIZE,
  CONTEXT_FILE_NAMES,
  DEFAULT_CONTEXT_TEMPLATE,
} from '@/types'
import type { ContextConfig, ContextFile } from '@/types'

// ============================================================================
// File Editor Tab
// ============================================================================

interface FileEditorProps {
  file: ContextFile | null
  fileName: string
  onSave: (content: string) => Promise<void>
  onCreate: () => Promise<void>
  onDelete: () => void
  saving?: boolean
}

function FileEditor({ file, fileName, onSave, onCreate, onDelete, saving }: FileEditorProps) {
  // Initialize with file content - parent uses key prop to reset on file change
  const [content, setContent] = useState(file?.content || '')
  const [isDirty, setIsDirty] = useState(false)

  const tokenCount = estimateTokens(content)
  const isOverLimit = content.length > MAX_CONTEXT_FILE_SIZE

  const handleSave = async () => {
    await onSave(content)
    setIsDirty(false)
  }

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium mb-2">{capitalizeContextFileName(fileName)} not created</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Create this file to add {fileName} context to your project.
        </p>
        <Button onClick={onCreate} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Create {capitalizeContextFileName(fileName)}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            ~{tokenCount} tokens
          </Badge>
          {isOverLimit && (
            <Badge variant="warning" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Over 2KB limit
            </Badge>
          )}
          {isDirty && (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Editor */}
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setIsDirty(true)
        }}
        className={cn(
          'min-h-[300px] font-mono text-sm',
          isOverLimit && 'border-amber-500 focus-visible:ring-amber-500'
        )}
        placeholder={`Enter ${capitalizeContextFileName(fileName).toLowerCase()} context...`}
      />

      {/* Warning */}
      {isOverLimit && (
        <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            This file exceeds the recommended 2KB limit. Large context files may increase
            token usage and slow down agent responses.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Settings Tab
// ============================================================================

interface SettingsTabProps {
  config: ContextConfig
  onSave: (config: ContextConfig) => Promise<void>
  saving?: boolean
}

function SettingsTab({ config, onSave, saving }: SettingsTabProps) {
  // Initialize with config - parent uses key prop to reset on config change
  const [localConfig, setLocalConfig] = useState(config)
  const [isDirty, setIsDirty] = useState(false)

  const updateConfig = (updates: Partial<ContextConfig>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }))
    setIsDirty(true)
  }

  const handleSave = async () => {
    await onSave(localConfig)
    setIsDirty(false)
  }

  return (
    <div className="space-y-6">
      {/* Injection Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Injection Settings</h3>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled">Enable Context Injection</Label>
            <p className="text-xs text-muted-foreground">
              Include context in AI agent prompts
            </p>
          </div>
          <Switch
            id="enabled"
            checked={localConfig.enabled}
            onCheckedChange={(checked) => updateConfig({ enabled: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="prdChat">PRD Chat</Label>
            <p className="text-xs text-muted-foreground">
              Include in PRD Chat conversations
            </p>
          </div>
          <Switch
            id="prdChat"
            checked={localConfig.includeInPrdChat}
            onCheckedChange={(checked) => updateConfig({ includeInPrdChat: checked })}
            disabled={!localConfig.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="ralphLoop">Ralph Loop</Label>
            <p className="text-xs text-muted-foreground">
              Include in Ralph Loop agent prompts
            </p>
          </div>
          <Switch
            id="ralphLoop"
            checked={localConfig.includeInRalphLoop}
            onCheckedChange={(checked) => updateConfig({ includeInRalphLoop: checked })}
            disabled={!localConfig.enabled}
          />
        </div>
      </div>

      {/* Mode Settings */}
      <div className="space-y-4 border-t border-border/50 pt-4">
        <h3 className="text-sm font-medium">File Mode</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => updateConfig({ mode: 'single' })}
            className={cn(
              'p-3 rounded-lg border text-left transition-colors',
              localConfig.mode === 'single'
                ? 'border-primary bg-primary/5'
                : 'border-border/50 hover:border-border'
            )}
          >
            <div className="font-medium text-sm mb-1">Single File</div>
            <p className="text-xs text-muted-foreground">
              One context.md file for all context
            </p>
          </button>
          <button
            onClick={() => updateConfig({ mode: 'multi' })}
            className={cn(
              'p-3 rounded-lg border text-left transition-colors',
              localConfig.mode === 'multi'
                ? 'border-primary bg-primary/5'
                : 'border-border/50 hover:border-border'
            )}
          >
            <div className="font-medium text-sm mb-1">Multi File</div>
            <p className="text-xs text-muted-foreground">
              Separate files for each section
            </p>
          </button>
        </div>
      </div>

      {/* Enabled Files (Multi-file mode) */}
      {localConfig.mode === 'multi' && (
        <div className="space-y-3 border-t border-border/50 pt-4">
          <h3 className="text-sm font-medium">Enabled Files</h3>
          <div className="space-y-2">
            {CONTEXT_FILE_NAMES.map((fileName) => (
              <div key={fileName} className="flex items-center justify-between">
                <Label htmlFor={`file-${fileName}`} className="text-sm">
                  {capitalizeContextFileName(fileName)}
                </Label>
                <Switch
                  id={`file-${fileName}`}
                  checked={localConfig.enabledFiles.includes(fileName)}
                  onCheckedChange={(checked) => {
                    const newFiles = checked
                      ? [...localConfig.enabledFiles, fileName]
                      : localConfig.enabledFiles.filter((f) => f !== fileName)
                    updateConfig({ enabledFiles: newFiles })
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-border/50">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : isDirty ? (
            <Save className="h-4 w-4 mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {isDirty ? 'Save Settings' : 'Settings Saved'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Main Dialog Component
// ============================================================================

interface ContextEditorDialogProps {
  projectPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContextEditorDialog({ projectPath, open, onOpenChange }: ContextEditorDialogProps) {
  const [activeTab, setActiveTab] = useState('context')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    projectContext,
    loading,
    loadProjectContext,
    saveContextFile,
    saveContextConfig,
    deleteContextFile,
    getDefaultContextTemplate,
  } = useContextStore()

  // Load context when dialog opens
  useEffect(() => {
    if (open && projectPath) {
      loadProjectContext(projectPath)
    }
  }, [open, projectPath, loadProjectContext])

  const config = projectContext?.config
  const files = useMemo(() => projectContext?.files || [], [projectContext?.files])
  const mode = config?.mode || 'single'

  // Get file by name
  const getFile = useCallback(
    (name: string): ContextFile | null => {
      return files.find((f) => f.name === name) || null
    },
    [files]
  )

  // Save file handler
  const handleSaveFile = useCallback(
    async (name: string, content: string) => {
      setSaving(true)
      try {
        await saveContextFile(projectPath, name, content, mode)
      } finally {
        setSaving(false)
      }
    },
    [projectPath, mode, saveContextFile]
  )

  // Create file handler
  const handleCreateFile = useCallback(
    async (name: string) => {
      setSaving(true)
      try {
        const template =
          name === 'context' ? await getDefaultContextTemplate() : DEFAULT_CONTEXT_TEMPLATE
        await saveContextFile(projectPath, name, template, mode)
      } finally {
        setSaving(false)
      }
    },
    [projectPath, mode, saveContextFile, getDefaultContextTemplate]
  )

  // Delete file handler
  const handleDeleteFile = useCallback(async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await deleteContextFile(projectPath, deleteTarget)
      setDeleteTarget(null)
    } finally {
      setSaving(false)
    }
  }, [projectPath, deleteTarget, deleteContextFile])

  // Save config handler
  const handleSaveConfig = useCallback(
    async (newConfig: ContextConfig) => {
      setSaving(true)
      try {
        await saveContextConfig(projectPath, newConfig)
      } finally {
        setSaving(false)
      }
    },
    [projectPath, saveContextConfig]
  )

  // Tab items based on mode
  const tabItems =
    mode === 'single'
      ? [{ id: 'context', label: 'Context' }]
      : CONTEXT_FILE_NAMES.map((name) => ({
          id: name,
          label: capitalizeContextFileName(name),
        }))

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Project Context
            </DialogTitle>
            <DialogDescription>
              Edit your project context files and configure injection settings.
            </DialogDescription>
          </DialogHeader>

          {loading && !projectContext ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 overflow-hidden flex flex-col"
            >
              <TabsList className="w-full justify-start overflow-x-auto">
                {tabItems.map((item) => (
                  <TabsTrigger key={item.id} value={item.id} className="text-xs">
                    {item.label}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="settings" className="text-xs">
                  <Settings2 className="h-3 w-3 mr-1" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto py-4">
                {/* File tabs */}
                {tabItems.map((item) => {
                  const file = getFile(item.id)
                  // Use file content hash as key to reset state when content changes
                  const fileKey = `${item.id}-${file?.updatedAt || 'new'}`
                  return (
                    <TabsContent key={item.id} value={item.id} className="mt-0">
                      <FileEditor
                        key={fileKey}
                        file={file}
                        fileName={item.id}
                        onSave={(content) => handleSaveFile(item.id, content)}
                        onCreate={() => handleCreateFile(item.id)}
                        onDelete={() => setDeleteTarget(item.id)}
                        saving={saving}
                      />
                    </TabsContent>
                  )
                })}

                {/* Settings tab */}
                <TabsContent value="settings" className="mt-0">
                  {config && (
                    <SettingsTab
                      key={`settings-${config.lastUpdated || 'default'}`}
                      config={config}
                      onSave={handleSaveConfig}
                      saving={saving}
                    />
                  )}
                </TabsContent>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Context File?</DialogTitle>
            <DialogDescription>
              This will permanently delete the{' '}
              {deleteTarget && capitalizeContextFileName(deleteTarget)} context file. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteFile}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
