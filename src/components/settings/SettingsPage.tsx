import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save, RotateCcw, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { useSettingsState } from './hooks/useSettingsState'
import { ExecutionSettings } from './ExecutionSettings'
import { GitSettings } from './GitSettings'
import { ValidationSettings } from './ValidationSettings'
import { FallbackSettings } from './FallbackSettings'
import { NotificationSettings } from './NotificationSettings'
import { TemplateSettings } from './TemplateSettings'
import { UISettings } from './UISettings'
import { ApiProviderSettings } from './ApiProviderSettings'
import { AgentsTab } from './AgentsTab'
import { ChatCommandSettings } from './ChatCommandSettings'

export function SettingsPage() {
  const {
    // Backend config state
    config,
    loading,
    saving,
    error,

    // UI settings
    uiSettings,

    // Track changes
    hasChanges,
    savedMessage,
    setSavedMessage,

    // Template state
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

    // Template preview state
    isPreviewOpen,
    setIsPreviewOpen,
    previewLoading,
    previewResult,
    setPreviewResult,

    // Active project
    activeProject,

    // Update functions
    updateExecutionConfig,
    updateGitConfig,
    updateValidationConfig,
    updateFallbackConfig,
    updateTemplatesConfig,
    updateUISettingsLocal,

    // Actions
    handleSave,
    handleReset,
    handleReload,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleCreateNew,
    handleCancelEdit,
    handlePreviewTemplate,
    loadTemplateContent,
  } = useSettingsState()

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure your Ralph UI preferences
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleReload} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Reload from Files</span>
            <span className="sm:hidden">Reload</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={loading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Reset to Defaults</span>
            <span className="sm:hidden">Reset</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            <span className="hidden sm:inline">Save Changes</span>
            <span className="sm:hidden">Save</span>
          </Button>
        </div>
      </div>

      {/* Success message */}
      {savedMessage && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-4">
            <p className="text-green-700 dark:text-green-300">{savedMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Error message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="execution" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="execution" className="text-xs sm:text-sm">
            Execution
          </TabsTrigger>
          <TabsTrigger value="agents" className="text-xs sm:text-sm">
            Agents
          </TabsTrigger>
          <TabsTrigger value="git" className="text-xs sm:text-sm">
            Git
          </TabsTrigger>
          <TabsTrigger value="validation" className="text-xs sm:text-sm">
            Validation
          </TabsTrigger>
          <TabsTrigger value="fallback" className="text-xs sm:text-sm">
            Fallback
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs sm:text-sm">
            Notifications
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs sm:text-sm">
            Templates
          </TabsTrigger>
          <TabsTrigger value="chat-commands" className="text-xs sm:text-sm">
            Chat Commands
          </TabsTrigger>
          <TabsTrigger value="providers" className="text-xs sm:text-sm">
            Providers
          </TabsTrigger>
          <TabsTrigger value="ui" className="text-xs sm:text-sm">
            UI
          </TabsTrigger>
        </TabsList>

        {/* Execution Settings */}
        <TabsContent value="execution" className="space-y-4">
          <ExecutionSettings config={config} updateExecutionConfig={updateExecutionConfig} />
        </TabsContent>

        {/* Agents Settings */}
        <TabsContent value="agents" className="space-y-4">
          <AgentsTab />
        </TabsContent>

        {/* Git Settings */}
        <TabsContent value="git" className="space-y-4">
          <GitSettings config={config} updateGitConfig={updateGitConfig} />
        </TabsContent>

        {/* Validation Settings */}
        <TabsContent value="validation" className="space-y-4">
          <ValidationSettings config={config} updateValidationConfig={updateValidationConfig} />
        </TabsContent>

        {/* Fallback Settings */}
        <TabsContent value="fallback" className="space-y-4">
          <FallbackSettings config={config} updateFallbackConfig={updateFallbackConfig} />
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-4">
          <NotificationSettings
            uiSettings={uiSettings}
            updateUISettingsLocal={updateUISettingsLocal}
          />
        </TabsContent>

        {/* Template Settings */}
        <TabsContent value="templates" className="space-y-4">
          <TemplateSettings
            config={config}
            templates={templates}
            templatesLoading={templatesLoading}
            selectedTemplate={selectedTemplate}
            templateContent={templateContent}
            setTemplateContent={setTemplateContent}
            templateContentLoading={templateContentLoading}
            isEditingTemplate={isEditingTemplate}
            setIsEditingTemplate={setIsEditingTemplate}
            isCreatingTemplate={isCreatingTemplate}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
            newTemplateScope={newTemplateScope}
            setNewTemplateScope={setNewTemplateScope}
            templateSaving={templateSaving}
            templateError={templateError}
            isPreviewOpen={isPreviewOpen}
            setIsPreviewOpen={setIsPreviewOpen}
            previewLoading={previewLoading}
            previewResult={previewResult}
            setPreviewResult={setPreviewResult}
            activeProject={activeProject}
            savedMessage={savedMessage}
            setSavedMessage={setSavedMessage}
            updateTemplatesConfig={updateTemplatesConfig}
            loadTemplateContent={loadTemplateContent}
            handleSaveTemplate={handleSaveTemplate}
            handleDeleteTemplate={handleDeleteTemplate}
            handleCreateNew={handleCreateNew}
            handleCancelEdit={handleCancelEdit}
            handlePreviewTemplate={handlePreviewTemplate}
          />
        </TabsContent>

        {/* Chat Command Settings */}
        <TabsContent value="chat-commands" className="space-y-4">
          <ChatCommandSettings />
        </TabsContent>

        {/* API Provider Settings */}
        <TabsContent value="providers" className="space-y-4">
          <ApiProviderSettings />
        </TabsContent>

        {/* UI Settings */}
        <TabsContent value="ui" className="space-y-4">
          <UISettings uiSettings={uiSettings} updateUISettingsLocal={updateUISettingsLocal} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
