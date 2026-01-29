import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { RalphConfig, RalphGitConfig } from '@/types'

interface GitSettingsProps {
  config: RalphConfig | null
  updateGitConfig: (updates: Partial<RalphGitConfig>) => void
}

export function GitSettings({ config, updateGitConfig }: GitSettingsProps) {
  const branchPattern = config?.git.branchPattern

  // Validate branch pattern
  const branchPatternValidation = useMemo(() => {
    if (!branchPattern) {
      return { valid: false, error: 'Branch pattern is required' }
    }
    if (!branchPattern.includes('{task_id}')) {
      return { valid: false, error: 'Pattern must include {task_id} placeholder' }
    }
    // Check for invalid characters
    const invalidChars = /[^a-zA-Z0-9/_\-{}]/
    if (invalidChars.test(branchPattern)) {
      return { valid: false, error: 'Pattern contains invalid characters' }
    }
    return { valid: true, error: null }
  }, [branchPattern])

  // Generate preview with example task ID
  const branchPreview = useMemo(() => {
    if (!branchPattern) return ''
    return branchPattern.replace('{task_id}', 'fix-login-bug')
  }, [branchPattern])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Git Preferences</CardTitle>
        <CardDescription>Configure git-related settings for agents</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {config ? (
          <>
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Pull Request Options</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoCreatePrs"
                    checked={config.git.autoCreatePrs}
                    onCheckedChange={(checked) =>
                      updateGitConfig({ autoCreatePrs: checked as boolean })
                    }
                  />
                  <Label htmlFor="autoCreatePrs">Automatically create pull requests</Label>
                </div>

                <div
                  className={`flex items-center space-x-2 ${!config.git.autoCreatePrs ? 'opacity-50' : ''}`}
                >
                  <Checkbox
                    id="draftPrs"
                    checked={config.git.draftPrs}
                    onCheckedChange={(checked) => updateGitConfig({ draftPrs: checked as boolean })}
                    disabled={!config.git.autoCreatePrs}
                  />
                  <Label htmlFor="draftPrs">Create PRs as draft</Label>
                </div>
              </div>
            </div>

            <div
              className={`space-y-4 ${!config.git.autoCreatePrs ? 'opacity-50' : ''}`}
            >
              <div className="space-y-2">
                <Label htmlFor="branchPattern">Branch Pattern</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="branchPattern"
                    value={config.git.branchPattern}
                    onChange={(e) => updateGitConfig({ branchPattern: e.target.value })}
                    placeholder="task/{task_id}"
                    disabled={!config.git.autoCreatePrs}
                    className={
                      !branchPatternValidation.valid && config.git.autoCreatePrs
                        ? 'border-destructive'
                        : ''
                    }
                  />
                  {config.git.autoCreatePrs && (
                    branchPatternValidation.valid ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                    )
                  )}
                </div>
                {!branchPatternValidation.valid && config.git.autoCreatePrs && (
                  <p className="text-xs text-destructive">{branchPatternValidation.error}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Pattern for branches created by agents. Use {'{task_id}'} as placeholder.
                  {!config.git.autoCreatePrs && ' (Enable auto-create PRs to configure)'}
                </p>
                {branchPatternValidation.valid && config.git.autoCreatePrs && branchPreview && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Preview:</span>
                    <code className="px-2 py-0.5 bg-muted rounded font-mono">{branchPreview}</code>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            Backend configuration not available. Running in development mode.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
