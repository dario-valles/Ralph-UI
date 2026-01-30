// Hook to check project setup status (context and PRD existence)

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@/lib/invoke'
import { prdApi } from '@/lib/api'
import type { ProjectSetupStatus } from '@/types'

const EMPTY_STATUS: ProjectSetupStatus = { hasContext: false, hasFirstPrd: false, loading: false }

/**
 * Hook to fetch and track the setup status of a project.
 * Checks if context is configured and if any PRDs exist.
 */
export function useProjectSetupStatus(projectPath: string | null): ProjectSetupStatus & { refresh: () => Promise<void> } {
  const [status, setStatus] = useState<ProjectSetupStatus>({ ...EMPTY_STATUS, loading: true })

  const checkStatus = useCallback(async () => {
    if (!projectPath) {
      setStatus(EMPTY_STATUS)
      return
    }

    setStatus((prev) => ({ ...prev, loading: true }))

    try {
      const [hasContext, prdCount] = await Promise.all([
        invoke<boolean>('has_context_files', { projectPath }),
        prdApi.getCount(projectPath).then((r) => r.count).catch(() => 0),
      ])

      setStatus({ hasContext, hasFirstPrd: prdCount > 0, loading: false })
    } catch (error) {
      console.error('Failed to check project setup status:', error)
      setStatus(EMPTY_STATUS)
    }
  }, [projectPath])

  useEffect(() => {
    const fetchStatus = async () => {
      await checkStatus()
    }
    fetchStatus()
  }, [checkStatus])

  return { ...status, refresh: checkStatus }
}

/**
 * Calculate the setup progress percentage (0-100)
 */
export function getSetupProgress(status: ProjectSetupStatus): number {
  if (status.loading) return 0
  let progress = 33 // Project added = 33%
  if (status.hasContext) progress += 33 // Context set up = 66%
  if (status.hasFirstPrd) progress += 34 // First PRD created = 100%
  return progress
}

/**
 * Get the next recommended step based on setup status
 */
export function getNextSetupStep(status: ProjectSetupStatus): 'context' | 'prd' | 'complete' {
  if (status.loading) return 'context'
  if (!status.hasContext) return 'context'
  if (!status.hasFirstPrd) return 'prd'
  return 'complete'
}
