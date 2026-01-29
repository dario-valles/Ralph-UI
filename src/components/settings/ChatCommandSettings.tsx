import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  AlertCircle,
  Loader2,
  MessageSquareText,
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  Globe,
  Package,
  Star,
  StarOff,
  Save,
  RotateCcw,
  X,
} from 'lucide-react'
import { useChatCommandStore } from '@/stores/chatCommandStore'
import { useProjectStore } from '@/stores/projectStore'
import type { ChatCommandConfig } from '@/types'

export function ChatCommandSettings() {
  const {
    commands,
    loading,
    error,
    loadCommands,
    toggleEnabled,
    toggleFavorite,
    updateCommand,
    createCommand,
    deleteCommand,
    resetCommand,
  } = useChatCommandStore()

  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const projects = useProjectStore((state) => state.projects)
  const activeProjectInfo = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : undefined

  // Local state for editing
  const [selectedCommand, setSelectedCommand] = useState<ChatCommandConfig | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Form state for editing/creating
  const [formId, setFormId] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTemplate, setFormTemplate] = useState('')
  const [formScope, setFormScope] = useState<'project' | 'global'>('global')

  // Load commands on mount
  useEffect(() => {
    loadCommands(activeProjectInfo?.path)
  }, [loadCommands, activeProjectInfo?.path])

  // Reset form when selection changes
  useEffect(() => {
    if (selectedCommand) {
      setFormId(selectedCommand.id)
      setFormLabel(selectedCommand.label)
      setFormDescription(selectedCommand.description)
      setFormTemplate(selectedCommand.template)
    }
  }, [selectedCommand])

  // Handle selecting a command
  const handleSelectCommand = (command: ChatCommandConfig) => {
    if (isEditing || isCreating) return
    setSelectedCommand(command)
    setLocalError(null)
  }

  // Handle starting edit mode
  const handleStartEdit = () => {
    if (!selectedCommand) return
    setIsEditing(true)
    setLocalError(null)
  }

  // Handle starting create mode
  const handleStartCreate = () => {
    setIsCreating(true)
    setSelectedCommand(null)
    setFormId('')
    setFormLabel('')
    setFormDescription('')
    setFormTemplate('')
    setFormScope('global')
    setLocalError(null)
  }

  // Handle cancel
  const handleCancel = () => {
    setIsEditing(false)
    setIsCreating(false)
    setLocalError(null)
    if (selectedCommand) {
      setFormLabel(selectedCommand.label)
      setFormDescription(selectedCommand.description)
      setFormTemplate(selectedCommand.template)
    }
  }

  // Handle save
  const handleSave = async () => {
    setSaving(true)
    setLocalError(null)

    try {
      if (isCreating) {
        // Validate form
        if (!formId.trim()) {
          throw new Error('Command ID is required')
        }
        if (!formLabel.trim()) {
          throw new Error('Label is required')
        }
        if (!formTemplate.trim()) {
          throw new Error('Template is required')
        }

        await createCommand(
          {
            id: formId.trim().toLowerCase().replace(/\s+/g, '-'),
            label: formLabel.trim(),
            description: formDescription.trim(),
            template: formTemplate,
          },
          formScope
        )

        setIsCreating(false)
      } else if (isEditing && selectedCommand) {
        await updateCommand(
          selectedCommand.id,
          {
            label: formLabel.trim(),
            description: formDescription.trim(),
            template: formTemplate,
          },
          selectedCommand.scope === 'builtin' ? 'global' : selectedCommand.scope
        )

        setIsEditing(false)
        // Reload to get updated command
        await loadCommands(activeProjectInfo?.path)
        // Re-select the command to show updated values
        const updated = commands.find((c) => c.id === selectedCommand.id)
        if (updated) setSelectedCommand(updated)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedCommand || selectedCommand.scope === 'builtin') return

    setSaving(true)
    setLocalError(null)

    try {
      await deleteCommand(selectedCommand.id, selectedCommand.scope)
      setSelectedCommand(null)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  // Handle reset
  const handleReset = async () => {
    if (!selectedCommand || selectedCommand.scope !== 'builtin') return

    setSaving(true)
    setLocalError(null)

    try {
      await resetCommand(selectedCommand.id)
      // Re-select to show reset values
      await loadCommands(activeProjectInfo?.path)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setSaving(false)
    }
  }

  // Separate favorites and regular commands
  const favoriteCommands = commands.filter((c) => c.favorite && c.enabled)
  const regularCommands = commands.filter((c) => !c.favorite || !c.enabled)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5" />
                Chat Commands
              </CardTitle>
              <CardDescription>
                Customize slash commands for PRD Chat. Enable, disable, or create custom commands.
              </CardDescription>
            </div>
            <Button
              onClick={handleStartCreate}
              disabled={loading || isEditing || isCreating}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Command
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(error || localError) && (
            <div className="mb-4 p-3 rounded-md border border-destructive bg-destructive/10">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{localError || error}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Command List */}
            <div className="lg:col-span-1">
              <div className="border rounded-lg">
                <div className="p-3 border-b bg-muted/30">
                  <h4 className="text-sm font-medium">Available Commands</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeProjectInfo ? `Project: ${activeProjectInfo.name}` : 'No project selected'}
                  </p>
                </div>
                <ScrollArea className="h-[400px]">
                  {loading ? (
                    <div className="flex items-center justify-center h-20">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : commands.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No commands found.
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {/* Favorites Section */}
                      {favoriteCommands.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            Favorites
                          </div>
                          {favoriteCommands.map((command) => (
                            <CommandListItem
                              key={command.id}
                              command={command}
                              isSelected={selectedCommand?.id === command.id}
                              isDisabled={isEditing || isCreating}
                              onSelect={handleSelectCommand}
                              onToggleEnabled={(id) => toggleEnabled(id)}
                              onToggleFavorite={(id) => toggleFavorite(id)}
                            />
                          ))}
                          <div className="border-t border-border/50 my-2" />
                        </>
                      )}

                      {/* All Commands Section */}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        All Commands
                      </div>
                      {regularCommands.map((command) => (
                        <CommandListItem
                          key={command.id}
                          command={command}
                          isSelected={selectedCommand?.id === command.id}
                          isDisabled={isEditing || isCreating}
                          onSelect={handleSelectCommand}
                          onToggleEnabled={(id) => toggleEnabled(id)}
                          onToggleFavorite={(id) => toggleFavorite(id)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Command Editor/Viewer */}
            <div className="lg:col-span-2">
              {isCreating ? (
                <CreateCommandForm
                  formId={formId}
                  setFormId={setFormId}
                  formLabel={formLabel}
                  setFormLabel={setFormLabel}
                  formDescription={formDescription}
                  setFormDescription={setFormDescription}
                  formTemplate={formTemplate}
                  setFormTemplate={setFormTemplate}
                  formScope={formScope}
                  setFormScope={setFormScope}
                  activeProject={activeProjectInfo}
                  saving={saving}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              ) : selectedCommand ? (
                <CommandEditor
                  command={selectedCommand}
                  isEditing={isEditing}
                  formLabel={formLabel}
                  setFormLabel={setFormLabel}
                  formDescription={formDescription}
                  setFormDescription={setFormDescription}
                  formTemplate={formTemplate}
                  setFormTemplate={setFormTemplate}
                  saving={saving}
                  onStartEdit={handleStartEdit}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  onDelete={handleDelete}
                  onReset={handleReset}
                />
              ) : (
                <div className="border rounded-lg h-full min-h-[400px] flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <MessageSquareText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Select a command to view or edit</p>
                    <p className="text-xs mt-1">Or click "New Command" to create one</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Command list item component
interface CommandListItemProps {
  command: ChatCommandConfig
  isSelected: boolean
  isDisabled: boolean
  onSelect: (command: ChatCommandConfig) => void
  onToggleEnabled: (id: string) => void
  onToggleFavorite: (id: string) => void
}

function CommandListItem({
  command,
  isSelected,
  isDisabled,
  onSelect,
  onToggleEnabled,
  onToggleFavorite,
}: CommandListItemProps) {
  return (
    <div
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
        isSelected
          ? 'bg-primary/10 border border-primary'
          : 'hover:bg-muted border border-transparent'
      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
        !command.enabled ? 'opacity-60' : ''
      }`}
      onClick={() => !isDisabled && onSelect(command)}
    >
      {/* Enable/Disable Switch */}
      <Switch
        checked={command.enabled}
        onCheckedChange={() => onToggleEnabled(command.id)}
        onClick={(e) => e.stopPropagation()}
        className="data-[state=checked]:bg-emerald-500"
        aria-label={`${command.enabled ? 'Disable' : 'Enable'} ${command.label}`}
      />

      {/* Command Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{command.label}</span>
          <Badge variant="outline" className="text-xs shrink-0">
            {command.scope}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{command.description}</p>
      </div>

      {/* Favorite Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite(command.id)
        }}
        aria-label={`${command.favorite ? 'Unfavorite' : 'Favorite'} ${command.label}`}
      >
        {command.favorite ? (
          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
        ) : (
          <StarOff className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </div>
  )
}

// Create command form component
interface CreateCommandFormProps {
  formId: string
  setFormId: (id: string) => void
  formLabel: string
  setFormLabel: (label: string) => void
  formDescription: string
  setFormDescription: (description: string) => void
  formTemplate: string
  setFormTemplate: (template: string) => void
  formScope: 'project' | 'global'
  setFormScope: (scope: 'project' | 'global') => void
  activeProject: { id: string; name: string; path: string } | undefined
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

function CreateCommandForm({
  formId,
  setFormId,
  formLabel,
  setFormLabel,
  formDescription,
  setFormDescription,
  formTemplate,
  setFormTemplate,
  formScope,
  setFormScope,
  activeProject,
  saving,
  onSave,
  onCancel,
}: CreateCommandFormProps) {
  return (
    <div className="border rounded-lg">
      <div className="p-3 border-b bg-muted/30">
        <h4 className="text-sm font-medium">Create New Command</h4>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="command-id">Command ID</Label>
            <Input
              id="command-id"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              placeholder="my-command"
              pattern="[a-z0-9-]+"
            />
            <p className="text-xs text-muted-foreground">
              Use lowercase letters, numbers, and hyphens
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="command-scope">Save To</Label>
            <Select
              id="command-scope"
              value={formScope}
              onChange={(e) => setFormScope(e.target.value as 'project' | 'global')}
            >
              <option value="project" disabled={!activeProject}>
                Project ({activeProject?.name || 'no project'})
              </option>
              <option value="global">Global (~/.ralph-ui/)</option>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="command-label">Label</Label>
          <Input
            id="command-label"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="My Command"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="command-description">Description</Label>
          <Input
            id="command-description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Brief description of what this command does"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="command-template">Template</Label>
          <Textarea
            id="command-template"
            value={formTemplate}
            onChange={(e) => setFormTemplate(e.target.value)}
            className="font-mono text-sm h-[200px] resize-none"
            placeholder="Enter the text that will be inserted when this command is selected..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !formId.trim() || !formLabel.trim()}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Create Command
          </Button>
        </div>
      </div>
    </div>
  )
}

// Command editor component
interface CommandEditorProps {
  command: ChatCommandConfig
  isEditing: boolean
  formLabel: string
  setFormLabel: (label: string) => void
  formDescription: string
  setFormDescription: (description: string) => void
  formTemplate: string
  setFormTemplate: (template: string) => void
  saving: boolean
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onReset: () => void
}

function CommandEditor({
  command,
  isEditing,
  formLabel,
  setFormLabel,
  formDescription,
  setFormDescription,
  formTemplate,
  setFormTemplate,
  saving,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  onReset,
}: CommandEditorProps) {
  // Get scope icon
  const scopeIcon =
    command.scope === 'project' ? (
      <FolderOpen className="h-3 w-3" />
    ) : command.scope === 'global' ? (
      <Globe className="h-3 w-3" />
    ) : (
      <Package className="h-3 w-3" />
    )

  return (
    <div className="border rounded-lg">
      <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2">
            {scopeIcon}
            {command.label}
          </h4>
          <p className="text-xs text-muted-foreground">{command.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {command.scope === 'builtin' ? (
            <>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={onStartEdit}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Customize
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
                    Cancel
                  </Button>
                  <Button variant="outline" size="sm" onClick={onReset} disabled={saving}>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                  <Button size="sm" onClick={onSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={onStartEdit}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDelete}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onSave} disabled={saving}>
                    {saving ? (
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
        </div>
      </div>

      <div className="p-4">
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-label">Label</Label>
              <Input
                id="edit-label"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-template">Template</Label>
              <Textarea
                id="edit-template"
                value={formTemplate}
                onChange={(e) => setFormTemplate(e.target.value)}
                className="font-mono text-sm h-[280px] resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Scope:</span>
              <Badge variant="outline">{command.scope}</Badge>
              <span className="text-muted-foreground ml-4">Status:</span>
              <Badge variant={command.enabled ? 'success' : 'secondary'}>
                {command.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              {command.favorite && (
                <>
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500 ml-4" />
                  <span className="text-sm text-amber-600 dark:text-amber-400">Favorite</span>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <ScrollArea className="h-[300px] border rounded-md p-3 bg-muted/30">
                <pre className="font-mono text-sm whitespace-pre-wrap break-words">
                  {command.template}
                </pre>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
