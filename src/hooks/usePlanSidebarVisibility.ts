import { useRef, useState, useCallback } from 'react'

/**
 * Hook to manage plan sidebar visibility with auto-show on first content appearance.
 *
 * The sidebar starts visible and tracks when plan content first appears.
 * Use `shouldAutoShow` to determine if the sidebar should be shown when content arrives.
 *
 * @example
 * ```tsx
 * const { showPlanSidebar, setShowPlanSidebar, checkAndAutoShow } = usePlanSidebarVisibility()
 *
 * // Call this when content changes
 * useEffect(() => {
 *   if (watchedPlanContent) {
 *     checkAndAutoShow()
 *   }
 * }, [watchedPlanContent])
 * ```
 */
export function usePlanSidebarVisibility() {
  const [showPlanSidebar, setShowPlanSidebar] = useState(true)
  const hasShownOnceRef = useRef(false)

  const checkAndAutoShow = useCallback(() => {
    // Only auto-show the first time content appears
    if (!hasShownOnceRef.current) {
      hasShownOnceRef.current = true
      setShowPlanSidebar(true)
    }
  }, [])

  const resetAutoShow = useCallback(() => {
    hasShownOnceRef.current = false
  }, [])

  return {
    showPlanSidebar,
    setShowPlanSidebar,
    checkAndAutoShow,
    resetAutoShow,
  }
}
