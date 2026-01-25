// Gesture settings component - allows enabling/disabling and configuring gesture controls

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGestureStore } from '@/stores/gestureStore'
import { RotateCcw, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function GestureSettings() {
  const [showHelp, setShowHelp] = useState(false)
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
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Gesture Controls</CardTitle>
            <CardDescription>
              Configure swipe gestures for mobile terminal navigation
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp(true)}
            className="gap-2"
            aria-label="Show gesture help documentation"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
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
                  Minimum swipe distance for character movement (fast swipes move by word at 2x this
                  distance)
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
            <Button variant="outline" size="sm" onClick={resetToDefaults} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gesture Controls Guide</DialogTitle>
            <DialogDescription>
              Learn how to use gestures to control the terminal on mobile devices
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Command History */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Command History Navigation</h3>
              <p className="text-sm text-muted-foreground">
                Navigate through your terminal command history using vertical swipes.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[60px]">↑ Swipe Up:</span>
                  <span className="text-muted-foreground">
                    Recalls the previous command (like pressing ↑)
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[60px]">↓ Swipe Down:</span>
                  <span className="text-muted-foreground">
                    Recalls the next command (like pressing ↓)
                  </span>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Configure sensitivity to detect smaller or larger swipes
                </div>
              </div>
            </div>

            {/* Cursor Movement */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Cursor Movement</h3>
              <p className="text-sm text-muted-foreground">
                Move the cursor along the current command line using horizontal swipes.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[60px]">← Swipe Left:</span>
                  <span className="text-muted-foreground">
                    Moves cursor one character left (or by word if swiped quickly)
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[60px]">→ Swipe Right:</span>
                  <span className="text-muted-foreground">
                    Moves cursor one character right (or by word if swiped quickly)
                  </span>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Fast swipes (beyond 2x sensitivity threshold) move by word instead of character
                </div>
              </div>
            </div>

            {/* Page Scrolling */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Page Scrolling (Two-Finger)</h3>
              <p className="text-sm text-muted-foreground">
                Use two fingers to scroll through terminal output like Page Up/Down.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[100px]">✌️ Two Fingers Up:</span>
                  <span className="text-muted-foreground">Scrolls up (Page Up)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[100px]">✌️ Two Fingers Down:</span>
                  <span className="text-muted-foreground">Scrolls down (Page Down)</span>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Works with terminal pagers like less, more, and vim
                </div>
              </div>
            </div>

            {/* Extended Arrow Keys */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Extended Arrow Key Gestures</h3>
              <p className="text-sm text-muted-foreground">
                Swipe directly on arrow keys for advanced navigation.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[80px]">↑ Swipe Up:</span>
                  <span className="text-muted-foreground">Page Up</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[80px]">↓ Swipe Down:</span>
                  <span className="text-muted-foreground">Page Down</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[80px]">← Swipe Left:</span>
                  <span className="text-muted-foreground">Home (Ctrl+A)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[80px]">→ Swipe Right:</span>
                  <span className="text-muted-foreground">End (Ctrl+E)</span>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  A visual hint appears on arrow keys when this feature is enabled
                </div>
              </div>
            </div>

            {/* Pinch Zoom */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Pinch-to-Zoom Terminal</h3>
              <p className="text-sm text-muted-foreground">
                Use the two-finger pinch gesture to adjust terminal font size.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[100px]">🤌 Pinch Out:</span>
                  <span className="text-muted-foreground">Increases font size (zoom in)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[100px]">🤌 Pinch In:</span>
                  <span className="text-muted-foreground">Decreases font size (zoom out)</span>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Font size is saved and persists across sessions (8px - 32px range)
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 space-y-2 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-200">💡 Tips</p>
              <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
                <li>All gestures can be individually enabled/disabled</li>
                <li>Adjust sensitivity thresholds to match your preference</li>
                <li>Hints appear on first use of each gesture feature</li>
                <li>Test different sensitivity levels to find what works best</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
