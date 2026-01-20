import { useEffect, useRef } from 'react'

/**
 * Hook to auto-refresh quality assessment when plan content changes.
 * Includes debouncing to avoid excessive API calls.
 */
export function usePRDQualityAssessment(
  watchedPlanContent: string | null,
  assessQuality: () => void,
  debounceMs: number = 1000
) {
  const prevPlanContentRef = useRef<string | null>(null)

  useEffect(() => {
    // Only refresh if content actually changed and we have content
    if (watchedPlanContent && watchedPlanContent !== prevPlanContentRef.current) {
      prevPlanContentRef.current = watchedPlanContent

      // Debounce the quality assessment to avoid too many calls
      const timer = setTimeout(() => {
        assessQuality()
      }, debounceMs)

      return () => clearTimeout(timer)
    }
  }, [watchedPlanContent, assessQuality, debounceMs])
}
