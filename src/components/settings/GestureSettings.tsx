// Gesture settings component - allows enabling/disabling and configuring gesture controls

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { useGestureStore } from '@/stores/gestureStore'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function GestureSettings() {
  const { settings, toggleHistoryNavigation, setHistorySwipeThreshold, resetToDefaults } =
    useGestureStore()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gesture Controls</CardTitle>
        <CardDescription>Configure swipe gestures for mobile terminal navigation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Command History Navigation */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Command History Navigation</Label>
              <p className="text-sm text-muted-foreground">
                Swipe up/down on terminal to navigate command history
              </p>
            </div>
            <Switch
              checked={settings.enableHistoryNavigation}
              onCheckedChange={toggleHistoryNavigation}
              aria-label="Toggle command history navigation"
            />
          </div>

          {settings.enableHistoryNavigation && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="historyThreshold" className="text-sm">
                Swipe Sensitivity: {settings.historySwipeThreshold}px
              </Label>
              <p className="text-xs text-muted-foreground">
                Minimum swipe distance to register gesture (lower = more sensitive)
              </p>
              <Slider
                id="historyThreshold"
                min={10}
                max={100}
                step={5}
                value={[settings.historySwipeThreshold]}
                onValueChange={([v]) => setHistorySwipeThreshold(v)}
                className="w-full"
              />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>10px (very sensitive)</span>
                <span className="ml-auto">100px (less sensitive)</span>
              </div>
            </div>
          )}
        </div>

        {/* Future gesture features - placeholder for upcoming stories */}
        <div className="space-y-3 text-sm text-muted-foreground p-4 bg-secondary/20 rounded-lg border">
          <p className="font-medium">Coming Soon</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Cursor movement with left/right swipes</li>
            <li>Page scrolling with two-finger swipes</li>
            <li>Extended arrow key gestures</li>
            <li>Pinch-to-zoom for terminal font size</li>
          </ul>
        </div>

        {/* Reset button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
