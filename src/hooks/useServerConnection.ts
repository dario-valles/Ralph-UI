/**
 * Hook to check if connected to server in browser mode
 */

import { useState, useEffect } from 'react'
import { isBrowserMode } from '@/lib/invoke'
import { isTauri } from '@/lib/env-check'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useConnectionStore } from '@/stores/connectionStore'

export function useServerConnection() {
  const shouldShowAgentSetup = useOnboardingStore((state) => state.shouldShowAgentSetup)

  const [isConnected, setIsConnected] = useState(() => {
    // In Tauri mode, always connected
    if (isTauri) return true
    // In browser mode, check if we have config
    return isBrowserMode()
  })

  const [showDialog, setShowDialog] = useState(() => {
    // Show dialog in browser mode if not connected
    return !isTauri && !isBrowserMode()
  })

  const [showAgentSetup, setShowAgentSetup] = useState(false)

  // Subscribe to connection store to show dialog on auth errors
  useEffect(() => {
    const unsubscribe = useConnectionStore.subscribe((state, prevState) => {
      // Show dialog when auth error occurs
      if (state.lastErrorType === 'auth' && prevState.lastErrorType !== 'auth') {
        setShowDialog(true)
        setIsConnected(false)
      }
    })
    return unsubscribe
  }, [])

  const handleConnected = () => {
    setIsConnected(true)
    setShowDialog(false)
    // Clear auth error state so we can detect future auth errors
    useConnectionStore.getState().resetReconnection()
    // After connection, check if we should show agent setup
    if (shouldShowAgentSetup()) {
      setShowAgentSetup(true)
    }
  }

  const handleAgentSetupComplete = () => {
    setShowAgentSetup(false)
  }

  return {
    isConnected,
    showDialog,
    showAgentSetup,
    handleConnected,
    handleAgentSetupComplete,
  }
}
