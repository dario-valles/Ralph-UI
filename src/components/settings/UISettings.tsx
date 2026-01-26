import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { KeyBarCustomizer } from './KeyBarCustomizer'
import { GestureSettings } from './GestureSettings'
import type { UISettings as UISettingsType } from './hooks/useSettingsState'

interface UISettingsProps {
  uiSettings: UISettingsType
  updateUISettingsLocal: (updates: Partial<UISettingsType>) => void
}

export function UISettings({ uiSettings, updateUISettingsLocal }: UISettingsProps) {
  return (
    <div className="space-y-4">
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
                value={uiSettings.theme}
                onChange={(e) =>
                  updateUISettingsLocal({
                    theme: e.target.value as 'light' | 'dark' | 'system',
                  })
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fontSize">
                Terminal Font Size: {uiSettings.terminalFontSize}px
              </Label>
              <Slider
                id="fontSize"
                min={10}
                max={24}
                step={1}
                value={[uiSettings.terminalFontSize]}
                onValueChange={([v]) => updateUISettingsLocal({ terminalFontSize: v })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Display Options</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showTokenCounts"
                  checked={uiSettings.showTokenCounts}
                  onCheckedChange={(checked) =>
                    updateUISettingsLocal({ showTokenCounts: checked as boolean })
                  }
                />
                <Label htmlFor="showTokenCounts">Show token counts in UI</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="confirmDestructive"
                  checked={uiSettings.confirmDestructiveActions}
                  onCheckedChange={(checked) =>
                    updateUISettingsLocal({ confirmDestructiveActions: checked as boolean })
                  }
                />
                <Label htmlFor="confirmDestructive">Confirm destructive actions</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <KeyBarCustomizer />

      <GestureSettings />
    </div>
  )
}
