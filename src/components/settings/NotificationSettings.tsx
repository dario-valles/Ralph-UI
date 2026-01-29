import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import { type SoundMode, playPreviewSound, resumeAudioContext } from '@/lib/audio'
import { PushNotificationSettings } from './PushNotificationSettings'
import type { UISettings } from './hooks/useSettingsState'
import { cn } from '@/lib/utils'

/** Notification toggle item configuration */
interface NotificationToggleItem {
  id: string
  key: keyof UISettings['notificationToggles']
  Icon: LucideIcon
  iconClass: string
  label: string
  description: string
}

const NOTIFICATION_TOGGLES: NotificationToggleItem[] = [
  {
    id: 'notify-completion',
    key: 'completion',
    Icon: CheckCircle,
    iconClass: 'text-green-600 dark:text-green-400',
    label: 'Loop Completion',
    description: 'When all stories in a Ralph loop pass',
  },
  {
    id: 'notify-error',
    key: 'error',
    Icon: XCircle,
    iconClass: 'text-destructive',
    label: 'Errors & Failures',
    description: 'Agent crashes, parse errors, git conflicts, rate limits',
  },
  {
    id: 'notify-max-iterations',
    key: 'maxIterations',
    Icon: AlertTriangle,
    iconClass: 'text-yellow-600 dark:text-yellow-400',
    label: 'Max Iterations',
    description: 'When the iteration limit is reached',
  },
  {
    id: 'notify-story-complete',
    key: 'storyComplete',
    Icon: ListChecks,
    iconClass: 'text-blue-600 dark:text-blue-400',
    label: 'Story Completion',
    description: 'When individual stories pass (can be frequent)',
  },
]

interface NotificationSettingsProps {
  uiSettings: UISettings
  updateUISettingsLocal: (updates: Partial<UISettings>) => void
}

export function NotificationSettings({
  uiSettings,
  updateUISettingsLocal,
}: NotificationSettingsProps) {
  return (
    <div className="space-y-4">
      {/* Master Toggle Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {uiSettings.notificationsEnabled ? (
                  <Bell className="h-5 w-5" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                Desktop Notifications
              </CardTitle>
              <CardDescription>
                Control desktop notifications for Ralph Loop events
              </CardDescription>
            </div>
            <Switch
              id="notificationsEnabled"
              checked={uiSettings.notificationsEnabled}
              onCheckedChange={(checked) => updateUISettingsLocal({ notificationsEnabled: checked })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Notification Type Toggles */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Notification Types</h4>
            <div className="grid gap-3">
              {NOTIFICATION_TOGGLES.map(({ id, key, Icon, iconClass, label, description }) => (
                <div
                  key={id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    !uiSettings.notificationsEnabled && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn('h-4 w-4', iconClass)} />
                    <div>
                      <Label htmlFor={id} className="font-medium">
                        {label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <Switch
                    id={id}
                    checked={uiSettings.notificationToggles[key]}
                    onCheckedChange={(checked) =>
                      updateUISettingsLocal({
                        notificationToggles: {
                          ...uiSettings.notificationToggles,
                          [key]: checked,
                        },
                      })
                    }
                    disabled={!uiSettings.notificationsEnabled}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sound Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Sounds</CardTitle>
          <CardDescription>Configure sound effects for Ralph Loop events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="soundMode">Sound Mode</Label>
              <Select
                id="soundMode"
                value={uiSettings.soundMode}
                onChange={(e) => {
                  const mode = e.target.value as SoundMode
                  updateUISettingsLocal({ soundMode: mode })
                  // Resume audio context on user interaction
                  resumeAudioContext()
                }}
              >
                <option value="off">Off - No sounds</option>
                <option value="system">System - Simple notification tones</option>
                <option value="ralph">Ralph - Fun themed sound effects</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                {uiSettings.soundMode === 'off' && 'Notification sounds are disabled.'}
                {uiSettings.soundMode === 'system' && 'Simple, professional notification tones.'}
                {uiSettings.soundMode === 'ralph' &&
                  'Fun, playful sound sequences inspired by Ralph Wiggum.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="soundVolume" className="flex items-center gap-2">
                  {uiSettings.soundMode === 'off' ? (
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  Volume: {uiSettings.soundVolume}%
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uiSettings.soundMode === 'off'}
                  onClick={() => {
                    resumeAudioContext()
                    playPreviewSound(uiSettings.soundMode, uiSettings.soundVolume)
                  }}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Preview Sound
                </Button>
              </div>
              <Slider
                id="soundVolume"
                min={0}
                max={100}
                step={5}
                value={[uiSettings.soundVolume]}
                onValueChange={([v]) => updateUISettingsLocal({ soundVolume: v })}
                disabled={uiSettings.soundMode === 'off'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Notification Card */}
      <Card>
        <CardHeader>
          <CardTitle>Test Notifications</CardTitle>
          <CardDescription>Verify your notification settings are working correctly</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={async () => {
              // Play sound if enabled
              if (uiSettings.soundMode !== 'off') {
                resumeAudioContext()
                playPreviewSound(uiSettings.soundMode, uiSettings.soundVolume)
              }
              // Send browser notification if enabled
              if (uiSettings.notificationsEnabled) {
                try {
                  if ('Notification' in window) {
                    if (Notification.permission === 'granted') {
                      new Notification('Ralph UI Test', {
                        body: 'This is a test notification from Ralph UI',
                        icon: '/favicon.ico',
                      })
                    } else if (Notification.permission !== 'denied') {
                      const permission = await Notification.requestPermission()
                      if (permission === 'granted') {
                        new Notification('Ralph UI Test', {
                          body: 'This is a test notification from Ralph UI',
                          icon: '/favicon.ico',
                        })
                      }
                    }
                  }
                } catch (err) {
                  console.error('Failed to send test notification:', err)
                }
              }
            }}
            disabled={!uiSettings.notificationsEnabled && uiSettings.soundMode === 'off'}
          >
            <Bell className="h-4 w-4 mr-2" />
            Send Test Notification
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            {!uiSettings.notificationsEnabled && uiSettings.soundMode === 'off'
              ? 'Enable notifications or sounds to test.'
              : 'This will send a test desktop notification and play the configured sound.'}
          </p>
        </CardContent>
      </Card>

      {/* Push Notifications (Web Push for background notifications) */}
      <PushNotificationSettings />
    </div>
  )
}
