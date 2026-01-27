/**
 * Hook to check if connected to server in browser mode
 */

import { useState } from 'react'
import { isBrowserMode } from '@/lib/invoke'
import { isTauri } from '@/lib/env-check'
import { useOnboardingStore } from '@/stores/onboardingStore'

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

  const handleConnected = () => {
    setIsConnected(true)
    setShowDialog(false)
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
