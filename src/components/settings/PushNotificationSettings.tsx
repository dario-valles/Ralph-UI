/**
 * Push Notification Settings Component
 *
 * Allows users to enable/disable push notifications and configure
 * which events trigger notifications.
 */

import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Bell,
  BellOff,
  BellRing,
  MessageSquare,
  CheckCircle2,
  Bot,
  RefreshCw,
  Wifi,
  Loader2,
  AlertCircle,
  Send,
  Smartphone,
} from 'lucide-react'
import { usePushNotificationStore } from '@/stores/pushNotificationStore'
import { cn } from '@/lib/utils'

export function PushNotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    settings,
    isLoading,
    error,
    initialize,
    subscribe,
    unsubscribe,
    updateSetting,
    sendTest,
    clearError,
  } = usePushNotificationStore()

  // Initialize on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  // Not supported - show message
  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-muted-foreground" />
            Push Notifications
          </CardTitle>
          <CardDescription>Push notifications are not supported in this browser</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To receive push notifications when the browser is closed, please use a browser that
            supports the Web Push API (Chrome, Firefox, Edge, or Safari 16.4+).
          </p>
        </CardContent>
      </Card>
    )
  }

  // Permission denied - show instructions
  if (permission === 'denied') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-destructive" />
            Push Notifications Blocked
          </CardTitle>
          <CardDescription>You have blocked notifications for this site</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To enable push notifications, you need to allow notifications in your browser settings:
          </p>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
            <li>Click the lock icon in the address bar</li>
            <li>Find "Notifications" in the site settings</li>
            <li>Change the setting from "Block" to "Allow"</li>
            <li>Refresh this page</li>
          </ol>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isSubscribed ? (
                <BellRing className="h-5 w-5 text-primary" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
              Push Notifications
              {isSubscribed && (
                <Badge variant="secondary" className="ml-2">
                  <Smartphone className="h-3 w-3 mr-1" />
                  Enabled
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Receive notifications even when the browser is closed</CardDescription>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={(checked) => {
              if (checked) {
                subscribe()
              } else {
                unsubscribe()
              }
            }}
            disabled={isLoading}
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </CardHeader>

      <CardContent className={cn('space-y-6', !isSubscribed && 'opacity-50 pointer-events-none')}>
        {/* Event Type Toggles */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Notification Types</h4>

          {/* Chat Response */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <div>
                <span className="text-sm font-medium">Chat Responses</span>
                <p className="text-xs text-muted-foreground">
                  When AI finishes responding in PRD chat
                </p>
              </div>
            </div>
            <Switch
              checked={settings.chatResponse}
              onCheckedChange={(checked) => updateSetting('chatResponse', checked)}
              disabled={!isSubscribed || isLoading}
            />
          </div>

          {/* Task Completed */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div>
                <span className="text-sm font-medium">Task Completions</span>
                <p className="text-xs text-muted-foreground">When tasks are marked as completed</p>
              </div>
            </div>
            <Switch
              checked={settings.taskCompleted}
              onCheckedChange={(checked) => updateSetting('taskCompleted', checked)}
              disabled={!isSubscribed || isLoading}
            />
          </div>

          {/* Agent Status */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Bot className="h-4 w-4 text-purple-500" />
              <div>
                <span className="text-sm font-medium">Agent Status Changes</span>
                <p className="text-xs text-muted-foreground">
                  When agents start, stop, or encounter errors
                </p>
              </div>
            </div>
            <Switch
              checked={settings.agentStatus}
              onCheckedChange={(checked) => updateSetting('agentStatus', checked)}
              disabled={!isSubscribed || isLoading}
            />
          </div>

          {/* Ralph Loop Iterations */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-orange-500" />
              <div>
                <span className="text-sm font-medium">Ralph Loop Iterations</span>
                <p className="text-xs text-muted-foreground">
                  When Ralph Loop completes an iteration (can be frequent)
                </p>
              </div>
            </div>
            <Switch
              checked={settings.ralphIteration}
              onCheckedChange={(checked) => updateSetting('ralphIteration', checked)}
              disabled={!isSubscribed || isLoading}
            />
          </div>

          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Wifi className="h-4 w-4 text-cyan-500" />
              <div>
                <span className="text-sm font-medium">Connection Status</span>
                <p className="text-xs text-muted-foreground">When connection is lost or restored</p>
              </div>
            </div>
            <Switch
              checked={settings.connectionStatus}
              onCheckedChange={(checked) => updateSetting('connectionStatus', checked)}
              disabled={!isSubscribed || isLoading}
            />
          </div>
        </div>

        {/* Test Notification */}
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={sendTest}
            disabled={!isSubscribed || isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Test Notification
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Send a test notification to verify push notifications are working
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
