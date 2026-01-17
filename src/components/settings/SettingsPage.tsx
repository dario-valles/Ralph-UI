import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save, RotateCcw } from 'lucide-react'
import type { AgentType } from '@/types'

// Settings types
interface AgentSettings {
  defaultAgentType: AgentType
  maxParallel: number
  maxIterations: number
  maxRetries: number
  autoCreatePRs: boolean
  draftPRs: boolean
  runTests: boolean
  runLint: boolean
}

interface GitSettings {
  branchPrefix: string
  commitMessagePrefix: string
  autoStage: boolean
  signCommits: boolean
}

interface UISettings {
  theme: 'light' | 'dark' | 'system'
  terminalFontSize: number
  showTokenCounts: boolean
  confirmDestructiveActions: boolean
}

interface AppSettings {
  agent: AgentSettings
  git: GitSettings
  ui: UISettings
}

const defaultSettings: AppSettings = {
  agent: {
    defaultAgentType: 'claude',
    maxParallel: 3,
    maxIterations: 10,
    maxRetries: 2,
    autoCreatePRs: true,
    draftPRs: true,
    runTests: true,
    runLint: true,
  },
  git: {
    branchPrefix: 'ralph/',
    commitMessagePrefix: '',
    autoStage: false,
    signCommits: false,
  },
  ui: {
    theme: 'system',
    terminalFontSize: 14,
    showTokenCounts: true,
    confirmDestructiveActions: true,
  },
}

const SETTINGS_KEY = 'ralph-ui-settings'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [hasChanges, setHasChanges] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setSettings({ ...defaultSettings, ...parsed })
      } catch {
        console.error('Failed to parse stored settings')
      }
    }
  }, [])

  const updateAgentSettings = (updates: Partial<AgentSettings>) => {
    setSettings((prev) => ({
      ...prev,
      agent: { ...prev.agent, ...updates },
    }))
    setHasChanges(true)
  }

  const updateGitSettings = (updates: Partial<GitSettings>) => {
    setSettings((prev) => ({
      ...prev,
      git: { ...prev.git, ...updates },
    }))
    setHasChanges(true)
  }

  const updateUISettings = (updates: Partial<UISettings>) => {
    setSettings((prev) => ({
      ...prev,
      ui: { ...prev.ui, ...updates },
    }))
    setHasChanges(true)
  }

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    setHasChanges(false)
    setSavedMessage('Settings saved successfully')
    setTimeout(() => setSavedMessage(null), 3000)
  }

  const handleReset = () => {
    setSettings(defaultSettings)
    setHasChanges(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure your Ralph UI preferences</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      {savedMessage && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4">
            <p className="text-green-700">{savedMessage}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="agent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agent">Agent Configuration</TabsTrigger>
          <TabsTrigger value="git">Git Preferences</TabsTrigger>
          <TabsTrigger value="ui">UI Preferences</TabsTrigger>
        </TabsList>

        {/* Agent Settings */}
        <TabsContent value="agent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Configuration</CardTitle>
              <CardDescription>Configure default settings for AI agents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agentType">Default Agent Type</Label>
                  <Select
                    id="agentType"
                    value={settings.agent.defaultAgentType}
                    onChange={(e) =>
                      updateAgentSettings({ defaultAgentType: e.target.value as AgentType })
                    }
                  >
                    <option value="claude">Claude</option>
                    <option value="opencode">OpenCode</option>
                    <option value="cursor">Cursor</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxParallel">
                    Max Parallel Agents: {settings.agent.maxParallel}
                  </Label>
                  <Slider
                    id="maxParallel"
                    min={1}
                    max={10}
                    step={1}
                    value={[settings.agent.maxParallel]}
                    onValueChange={([v]) => updateAgentSettings({ maxParallel: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxIterations">
                    Max Iterations: {settings.agent.maxIterations}
                  </Label>
                  <Slider
                    id="maxIterations"
                    min={1}
                    max={50}
                    step={1}
                    value={[settings.agent.maxIterations]}
                    onValueChange={([v]) => updateAgentSettings({ maxIterations: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxRetries">Max Retries: {settings.agent.maxRetries}</Label>
                  <Slider
                    id="maxRetries"
                    min={0}
                    max={5}
                    step={1}
                    value={[settings.agent.maxRetries]}
                    onValueChange={([v]) => updateAgentSettings({ maxRetries: v })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Automation Options</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="autoCreatePRs"
                      checked={settings.agent.autoCreatePRs}
                      onCheckedChange={(checked) =>
                        updateAgentSettings({ autoCreatePRs: checked as boolean })
                      }
                    />
                    <Label htmlFor="autoCreatePRs">Automatically create pull requests</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="draftPRs"
                      checked={settings.agent.draftPRs}
                      onCheckedChange={(checked) =>
                        updateAgentSettings({ draftPRs: checked as boolean })
                      }
                    />
                    <Label htmlFor="draftPRs">Create PRs as draft</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="runTests"
                      checked={settings.agent.runTests}
                      onCheckedChange={(checked) =>
                        updateAgentSettings({ runTests: checked as boolean })
                      }
                    />
                    <Label htmlFor="runTests">Run tests before completion</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="runLint"
                      checked={settings.agent.runLint}
                      onCheckedChange={(checked) =>
                        updateAgentSettings({ runLint: checked as boolean })
                      }
                    />
                    <Label htmlFor="runLint">Run linter before completion</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Git Settings */}
        <TabsContent value="git" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Git Preferences</CardTitle>
              <CardDescription>Configure git-related settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="branchPrefix">Branch Prefix</Label>
                  <Input
                    id="branchPrefix"
                    value={settings.git.branchPrefix}
                    onChange={(e) => updateGitSettings({ branchPrefix: e.target.value })}
                    placeholder="ralph/"
                  />
                  <p className="text-xs text-muted-foreground">
                    Prefix for branches created by agents
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commitPrefix">Commit Message Prefix</Label>
                  <Input
                    id="commitPrefix"
                    value={settings.git.commitMessagePrefix}
                    onChange={(e) =>
                      updateGitSettings({ commitMessagePrefix: e.target.value })
                    }
                    placeholder="[Ralph]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Prefix for commit messages (optional)
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Git Options</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="autoStage"
                      checked={settings.git.autoStage}
                      onCheckedChange={(checked) =>
                        updateGitSettings({ autoStage: checked as boolean })
                      }
                    />
                    <Label htmlFor="autoStage">Auto-stage changes before commit</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="signCommits"
                      checked={settings.git.signCommits}
                      onCheckedChange={(checked) =>
                        updateGitSettings({ signCommits: checked as boolean })
                      }
                    />
                    <Label htmlFor="signCommits">Sign commits with GPG</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* UI Settings */}
        <TabsContent value="ui" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>UI Preferences</CardTitle>
              <CardDescription>Customize the application appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select
                    id="theme"
                    value={settings.ui.theme}
                    onChange={(e) =>
                      updateUISettings({ theme: e.target.value as 'light' | 'dark' | 'system' })
                    }
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fontSize">
                    Terminal Font Size: {settings.ui.terminalFontSize}px
                  </Label>
                  <Slider
                    id="fontSize"
                    min={10}
                    max={24}
                    step={1}
                    value={[settings.ui.terminalFontSize]}
                    onValueChange={([v]) => updateUISettings({ terminalFontSize: v })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Display Options</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showTokenCounts"
                      checked={settings.ui.showTokenCounts}
                      onCheckedChange={(checked) =>
                        updateUISettings({ showTokenCounts: checked as boolean })
                      }
                    />
                    <Label htmlFor="showTokenCounts">Show token counts in UI</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="confirmDestructive"
                      checked={settings.ui.confirmDestructiveActions}
                      onCheckedChange={(checked) =>
                        updateUISettings({ confirmDestructiveActions: checked as boolean })
                      }
                    />
                    <Label htmlFor="confirmDestructive">
                      Confirm destructive actions
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
