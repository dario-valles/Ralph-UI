// Hook for PRD export workflow logic
// Handles export progress, task preview, and quality assessment flow

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { prdChatApi } from '@/lib/tauri-api'
import { toast } from '@/stores/toastStore'
import type { ExtractedPRDStructure, ChatSession } from '@/types'

export interface ExportProgress {
  active: boolean
  step: number
  message: string
}

interface UseExportWorkflowReturn {
  /** Export progress state (null when not exporting) */
  exportProgress: ExportProgress | null
  /** Whether task preview dialog is visible */
  showTaskPreview: boolean
  /** Extracted PRD structure for preview */
  previewStructure: ExtractedPRDStructure | null
  /** Whether preview is loading */
  previewLoading: boolean
  /** Whether quality warning panel is visible */
  showQualityPanel: boolean
  /** Set quality panel visibility */
  setShowQualityPanel: (show: boolean) => void
  /** Set task preview visibility */
  setShowTaskPreview: (show: boolean) => void
  /** Start the export workflow (assess quality, extract tasks, show preview) */
  handleExportToPRD: () => Promise<void>
  /** Confirm tasks in preview dialog and complete export */
  handleConfirmTaskPreview: (structure: ExtractedPRDStructure) => Promise<void>
  /** Force export without meeting quality threshold */
  handleForceExport: () => Promise<void>
}

/**
 * Hook to manage the PRD export workflow
 *
 * This hook encapsulates the multi-step export process:
 * 1. Assess quality - check if PRD meets threshold
 * 2. Extract tasks - parse PRD structure for preview
 * 3. Show preview - let user review/edit tasks
 * 4. Export - create PRD document and tasks
 *
 * @param currentSession - The current chat session
 * @returns Object with export state and handler functions
 */
export function useExportWorkflow(currentSession: ChatSession | null): UseExportWorkflowReturn {
  const navigate = useNavigate()
  const { assessQuality, exportToPRD } = usePRDChatStore()

  // Export progress tracking
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  // Task preview dialog state
  const [showTaskPreview, setShowTaskPreview] = useState(false)
  const [previewStructure, setPreviewStructure] = useState<ExtractedPRDStructure | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Quality warning panel
  const [showQualityPanel, setShowQualityPanel] = useState(false)

  // Load extracted structure and show preview dialog
  const handleExportToPRD = useCallback(async () => {
    if (!currentSession) return

    // Step 1: Assess quality
    setExportProgress({ active: true, step: 1, message: 'Checking PRD quality...' })
    const assessment = await assessQuality()
    if (assessment && !assessment.readyForExport) {
      setExportProgress(null)
      setShowQualityPanel(true)
      return
    }

    try {
      // Step 2: Load extracted structure for preview
      setExportProgress({ active: true, step: 2, message: 'Extracting tasks from PRD...' })
      setPreviewLoading(true)
      const structure = await prdChatApi.getExtractedStructure(currentSession.id)
      setPreviewStructure(structure)
      setPreviewLoading(false)
      setExportProgress(null)

      // Step 3: Show preview dialog
      setShowTaskPreview(true)
    } catch (err) {
      setExportProgress(null)
      setPreviewLoading(false)
      // If extraction fails, show error but allow direct export
      console.error('Failed to extract tasks for preview:', err)
      toast.error('Preview failed', 'Could not extract tasks. You can still export directly.')
      setShowQualityPanel(true)
    }
  }, [currentSession, assessQuality])

  // Called when user confirms tasks in preview dialog
  const handleConfirmTaskPreview = useCallback(
    async (_structure: ExtractedPRDStructure) => {
      if (!currentSession) return
      // TODO: Pass the modified _structure to exportToPRD when backend supports it
      void _structure // Silence unused warning until backend integration

      setShowTaskPreview(false)

      try {
        // Step 1: Export PRD and create tasks with the confirmed structure
        setExportProgress({ active: true, step: 1, message: 'Creating PRD and tasks...' })

        // For now, export uses the structure stored in the session
        const result = await exportToPRD(currentSession.title || 'Untitled PRD')

        if (result) {
          if (result.sessionId && result.taskCount > 0) {
            // Step 2: Set up session
            setExportProgress({
              active: true,
              step: 2,
              message: `Created ${result.taskCount} tasks. Setting up session...`,
            })
            await useSessionStore.getState().fetchSession(result.sessionId)

            // Step 3: Navigate
            setExportProgress({ active: true, step: 3, message: 'Navigating to tasks...' })
            toast.success(
              `Created ${result.taskCount} tasks from PRD`,
              'Your tasks are ready to assign to agents.'
            )
            navigate(`/tasks?sessionId=${result.sessionId}`)
          } else {
            // No tasks extracted - navigate to PRD editor
            setExportProgress(null)
            toast.success('PRD exported successfully', 'Your PRD has been created.')
            navigate(`/prds/${result.prd.id}`)
          }
        }
      } catch (err) {
        setExportProgress(null)
        throw err
      }
    },
    [currentSession, exportToPRD, navigate]
  )

  // Force export without preview (from quality warning dialog)
  const handleForceExport = useCallback(async () => {
    if (!currentSession) return

    setShowQualityPanel(false)

    try {
      // Try to show preview first
      setPreviewLoading(true)
      try {
        const structure = await prdChatApi.getExtractedStructure(currentSession.id)
        setPreviewStructure(structure)
        setPreviewLoading(false)
        setShowTaskPreview(true)
        return
      } catch {
        // If preview fails, do direct export
        setPreviewLoading(false)
      }

      // Direct export without preview
      setExportProgress({ active: true, step: 1, message: 'Exporting PRD and extracting tasks...' })
      const result = await exportToPRD(currentSession.title || 'Untitled PRD')

      if (result) {
        if (result.sessionId && result.taskCount > 0) {
          setExportProgress({
            active: true,
            step: 2,
            message: `Created ${result.taskCount} tasks. Setting up session...`,
          })
          await useSessionStore.getState().fetchSession(result.sessionId)

          setExportProgress({ active: true, step: 3, message: 'Navigating to tasks...' })
          toast.success(
            `Created ${result.taskCount} tasks from PRD`,
            'Your tasks are ready to assign to agents.'
          )
          navigate(`/tasks?sessionId=${result.sessionId}`)
        } else {
          setExportProgress(null)
          toast.success('PRD exported successfully', 'Your PRD has been created.')
          navigate(`/prds/${result.prd.id}`)
        }
      }
    } catch (err) {
      setExportProgress(null)
      throw err
    }
  }, [currentSession, exportToPRD, navigate])

  return {
    exportProgress,
    showTaskPreview,
    previewStructure,
    previewLoading,
    showQualityPanel,
    setShowQualityPanel,
    setShowTaskPreview,
    handleExportToPRD,
    handleConfirmTaskPreview,
    handleForceExport,
  }
}
