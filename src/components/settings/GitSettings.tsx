import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RalphConfig, RalphGitConfig } from '@/types'

interface GitSettingsProps {
  config: RalphConfig | null
  updateGitConfig: (updates: Partial<RalphGitConfig>) => void
}

export function GitSettings({ config, updateGitConfig }: GitSettingsProps) {
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
              className={`grid gap-4 md:grid-cols-2 ${!config.git.autoCreatePrs ? 'opacity-50' : ''}`}
            >
              <div className="space-y-2">
                <Label htmlFor="branchPattern">Branch Pattern</Label>
                <Input
                  id="branchPattern"
                  value={config.git.branchPattern}
                  onChange={(e) => updateGitConfig({ branchPattern: e.target.value })}
                  placeholder="ralph/{task_id}"
                  disabled={!config.git.autoCreatePrs}
                />
                <p className="text-xs text-muted-foreground">
                  Pattern for branches created by agents. Use {'{task_id}'} as placeholder.
                  {!config.git.autoCreatePrs && ' (Enable auto-create PRs to configure)'}
                </p>
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
