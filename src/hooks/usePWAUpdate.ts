import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useState } from 'react'

export function usePWAUpdate() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every hour
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000)
      }
    },
    onNeedRefresh() {
      setShowUpdatePrompt(true)
    },
  })

  const acceptUpdate = useCallback(() => {
    updateServiceWorker(true)
    setShowUpdatePrompt(false)
  }, [updateServiceWorker])

  const dismissUpdate = useCallback(() => {
    setShowUpdatePrompt(false)
    setNeedRefresh(false)
  }, [setNeedRefresh])

  return { showUpdatePrompt, needRefresh, acceptUpdate, dismissUpdate }
}
