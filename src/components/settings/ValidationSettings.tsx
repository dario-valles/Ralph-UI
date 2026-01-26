import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RalphConfig, RalphValidationConfig } from '@/types'

interface ValidationSettingsProps {
  config: RalphConfig | null
  updateValidationConfig: (updates: Partial<RalphValidationConfig>) => void
}

export function ValidationSettings({ config, updateValidationConfig }: ValidationSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation Configuration</CardTitle>
        <CardDescription>Configure test and lint settings for task validation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {config ? (
          <>
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Validation Options</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="runTests"
                    checked={config.validation.runTests}
                    onCheckedChange={(checked) =>
                      updateValidationConfig({ runTests: checked as boolean })
                    }
                  />
                  <Label htmlFor="runTests">Run tests before completion</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="runLint"
                    checked={config.validation.runLint}
                    onCheckedChange={(checked) =>
                      updateValidationConfig({ runLint: checked as boolean })
                    }
                  />
                  <Label htmlFor="runLint">Run linter before completion</Label>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={`space-y-2 ${!config.validation.runTests ? 'opacity-50' : ''}`}>
                <Label htmlFor="testCommand">Test Command (Optional)</Label>
                <Input
                  id="testCommand"
                  value={config.validation.testCommand || ''}
                  onChange={(e) =>
                    updateValidationConfig({
                      testCommand: e.target.value || undefined,
                    })
                  }
                  placeholder="npm test"
                  disabled={!config.validation.runTests}
                />
                <p className="text-xs text-muted-foreground">
                  Custom command to run tests. Leave empty for auto-detection.
                  {!config.validation.runTests && ' (Enable tests to configure)'}
                </p>
              </div>

              <div className={`space-y-2 ${!config.validation.runLint ? 'opacity-50' : ''}`}>
                <Label htmlFor="lintCommand">Lint Command (Optional)</Label>
                <Input
                  id="lintCommand"
                  value={config.validation.lintCommand || ''}
                  onChange={(e) =>
                    updateValidationConfig({
                      lintCommand: e.target.value || undefined,
                    })
                  }
                  placeholder="npm run lint"
                  disabled={!config.validation.runLint}
                />
                <p className="text-xs text-muted-foreground">
                  Custom command to run linter. Leave empty for auto-detection.
                  {!config.validation.runLint && ' (Enable linting to configure)'}
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
