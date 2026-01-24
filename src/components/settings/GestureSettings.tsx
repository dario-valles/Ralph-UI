// Gesture settings component - allows enabling/disabling and configuring gesture controls

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { useGestureStore } from '@/stores/gestureStore'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function GestureSettings() {
  const {
    settings,
    toggleHistoryNavigation,
    setHistorySwipeThreshold,
    toggleCursorMovement,
    setCursorSwipeThreshold,
    togglePageScroll,
    setPageSwipeThreshold,
    toggleExtendedArrows,
    setExtendedSwipeThreshold,
    togglePinchZoom,
    toggleHaptics,
    setTerminalFontSize,
    resetToDefaults,
  } = useGestureStore()

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

        {/* Cursor Movement */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Cursor Movement with Gestures</Label>
              <p className="text-sm text-muted-foreground">
                Swipe left/right to move cursor. Fast swipes move by word.
              </p>
            </div>
            <Switch
              checked={settings.enableCursorMovement}
              onCheckedChange={toggleCursorMovement}
              aria-label="Toggle cursor movement gestures"
            />
          </div>

          {settings.enableCursorMovement && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="cursorThreshold" className="text-sm">
                Swipe Sensitivity: {settings.cursorSwipeThreshold}px
              </Label>
              <p className="text-xs text-muted-foreground">
                Minimum swipe distance for character movement (fast swipes move by word at 2x this distance)
              </p>
              <Slider
                id="cursorThreshold"
                min={10}
                max={100}
                step={5}
                value={[settings.cursorSwipeThreshold]}
                onValueChange={([v]) => setCursorSwipeThreshold(v)}
                className="w-full"
              />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>10px (very sensitive)</span>
                <span className="ml-auto">100px (less sensitive)</span>
              </div>
            </div>
          )}
        </div>

        {/* Page Scrolling */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Page Scrolling</Label>
              <p className="text-sm text-muted-foreground">
                Two-finger swipe up/down to scroll terminal output (Page Up/Down)
              </p>
            </div>
            <Switch
              checked={settings.enablePageScroll}
              onCheckedChange={togglePageScroll}
              aria-label="Toggle page scrolling"
            />
          </div>

          {settings.enablePageScroll && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="pageThreshold" className="text-sm">
                Swipe Sensitivity: {settings.pageSwipeThreshold}px
              </Label>
              <p className="text-xs text-muted-foreground">
                Minimum swipe distance to register two-finger scroll
              </p>
              <Slider
                id="pageThreshold"
                min={10}
                max={100}
                step={5}
                value={[settings.pageSwipeThreshold]}
                onValueChange={([v]) => setPageSwipeThreshold(v)}
                className="w-full"
              />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>10px (very sensitive)</span>
                <span className="ml-auto">100px (less sensitive)</span>
              </div>
            </div>
          )}
        </div>

        {/* Extended Arrow Key Gestures */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Extended Arrow Key Gestures</Label>
              <p className="text-sm text-muted-foreground">
                Swipe on arrow keys for advanced navigation (Page Up/Down, Home/End)
              </p>
            </div>
            <Switch
              checked={settings.enableExtendedArrows}
              onCheckedChange={toggleExtendedArrows}
              aria-label="Toggle extended arrow gestures"
            />
          </div>

          {settings.enableExtendedArrows && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="extendedThreshold" className="text-sm">
                Swipe Sensitivity: {settings.extendedSwipeThreshold}px
              </Label>
              <p className="text-xs text-muted-foreground">
                Minimum swipe distance on arrow keys to trigger extended gestures
              </p>
              <Slider
                id="extendedThreshold"
                min={10}
                max={100}
                step={5}
                value={[settings.extendedSwipeThreshold]}
                onValueChange={([v]) => setExtendedSwipeThreshold(v)}
                className="w-full"
              />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>10px (very sensitive)</span>
                <span className="ml-auto">100px (less sensitive)</span>
              </div>
            </div>
          )}
        </div>

        {/* Pinch-to-Zoom for Terminal Font Size */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Pinch-to-Zoom Terminal</Label>
              <p className="text-sm text-muted-foreground">
                Pinch in/out to adjust terminal font size
              </p>
            </div>
            <Switch
              checked={settings.enablePinchZoom}
              onCheckedChange={togglePinchZoom}
              aria-label="Toggle pinch-to-zoom"
            />
          </div>

          {settings.enablePinchZoom && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="fontSize" className="text-sm">
                Terminal Font Size: {settings.terminalFontSize}px
              </Label>
              <p className="text-xs text-muted-foreground">
                Adjust font size or use pinch gestures on the terminal
              </p>
              <Slider
                id="fontSize"
                min={settings.minFontSize}
                max={settings.maxFontSize}
                step={1}
                value={[settings.terminalFontSize]}
                onValueChange={([v]) => setTerminalFontSize(v)}
                className="w-full"
              />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>{settings.minFontSize}px (smallest)</span>
                <span className="ml-auto">{settings.maxFontSize}px (largest)</span>
              </div>
            </div>
          )}
        </div>

        {/* Haptic Feedback */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Haptic Feedback</Label>
              <p className="text-sm text-muted-foreground">
                Vibration feedback on key presses and modifier toggles
              </p>
            </div>
            <Switch
              checked={settings.enableHaptics}
              onCheckedChange={toggleHaptics}
              aria-label="Toggle haptic feedback"
            />
          </div>
          {settings.enableHaptics && (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>• Light haptic (10ms) on normal key press</p>
              <p>• Medium haptic (20ms) on modifier toggle</p>
              <p>• Requires device support for vibration</p>
            </div>
          )}
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
