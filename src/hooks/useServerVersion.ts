import { useState, useEffect, useCallback } from 'react'
import { getServerConfig } from '@/lib/invoke'

const VERSION_STORAGE_KEY = 'ralph-ui-last-version'
const CHECK_INTERVAL = 60 * 60 * 1000 // 1 hour

interface VersionInfo {
  version: string
  release_url: string
}

function getStoredVersion(): string | null {
  return localStorage.getItem(VERSION_STORAGE_KEY)
}

export function useServerVersion() {
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null)
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)
  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(getStoredVersion)
  const config = getServerConfig()
  const serverUrl = config?.url
  const token = config?.token

  useEffect(() => {
    if (!serverUrl || !token) return

    let cancelled = false

    const checkVersion = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/version`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return

        const data: VersionInfo = await res.json()
        if (cancelled) return

        setLatestVersion(data)

        // Show banner if version changed and we've seen a version before
        const lastSeen = getStoredVersion()
        if (lastSeen && data.version !== lastSeen) {
          setShowUpdateBanner(true)
        }
      } catch {
        // Silently fail - server might not support this endpoint yet
      }
    }

    checkVersion()
    const interval = setInterval(checkVersion, CHECK_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [serverUrl, token])

  const dismissUpdate = useCallback(() => {
    if (latestVersion) {
      localStorage.setItem(VERSION_STORAGE_KEY, latestVersion.version)
      setLastSeenVersion(latestVersion.version)
    }
    setShowUpdateBanner(false)
  }, [latestVersion])

  return {
    showUpdateBanner,
    latestVersion,
    lastSeenVersion,
    dismissUpdate,
  }
}
