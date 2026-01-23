/**
 * Hook to check if connected to server in browser mode
 */

import { useState } from 'react'
import { isBrowserMode } from '@/lib/invoke'
import { isTauri } from '@/lib/tauri-check'

export function useServerConnection() {
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

  const handleConnected = () => {
    setIsConnected(true)
    setShowDialog(false)
  }

  return {
    isConnected,
    showDialog,
    handleConnected,
  }
}
