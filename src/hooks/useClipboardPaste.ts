// Hook for handling clipboard paste events (text and images)

import { useCallback, useRef } from 'react'
import type { ChatAttachment } from '@/types'
import {
  blobToAttachment,
  shouldShowPastePreview,
  detectCodeLikelihood,
  isSupportedImageType,
} from '@/lib/chat-utils'

export interface PasteResult {
  /** Type of paste content */
  type: 'text' | 'image' | 'multiline-text'
  /** Text content (for text pastes) */
  text?: string
  /** Image attachment (for image pastes) */
  attachment?: ChatAttachment
  /** Whether code was detected (for multiline text) */
  isCode?: boolean
  /** Detected language (for multiline text) */
  detectedLanguage?: string | null
}

export interface UseClipboardPasteOptions {
  /** Callback when text is pasted (single line, no dialog needed) */
  onTextPaste?: (text: string) => void
  /** Callback when multiline text is pasted (needs preview dialog) */
  onMultilinePaste?: (result: PasteResult) => void
  /** Callback when an image is pasted */
  onImagePaste?: (attachment: ChatAttachment) => void
  /** Callback when paste fails */
  onPasteError?: (error: string) => void
  /** Whether paste handling is disabled */
  disabled?: boolean
}

export function useClipboardPaste(options: UseClipboardPasteOptions) {
  const { onTextPaste, onMultilinePaste, onImagePaste, onPasteError, disabled = false } = options

  const processingRef = useRef(false)

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent | ClipboardEvent) => {
      if (disabled || processingRef.current) return

      const clipboardData =
        'clipboardData' in event ? event.clipboardData : (event as ClipboardEvent).clipboardData

      if (!clipboardData) return

      // Check for images first
      const items = Array.from(clipboardData.items)
      const imageItem = items.find((item) => item.type.startsWith('image/'))

      if (imageItem) {
        // Prevent default to avoid pasting image as text
        event.preventDefault()

        // Check if it's a supported type
        if (!isSupportedImageType(imageItem.type)) {
          onPasteError?.(`Unsupported image type: ${imageItem.type}`)
          return
        }

        processingRef.current = true
        try {
          const blob = imageItem.getAsFile()
          if (!blob) {
            onPasteError?.('Failed to get image from clipboard')
            return
          }

          const attachment = await blobToAttachment(blob)
          onImagePaste?.(attachment)
        } catch (error) {
          onPasteError?.(error instanceof Error ? error.message : 'Failed to process image')
        } finally {
          processingRef.current = false
        }
        return
      }

      // Handle text paste
      const text = clipboardData.getData('text/plain')
      if (!text) return

      // Check if we should show the preview dialog
      if (shouldShowPastePreview(text)) {
        event.preventDefault()
        const codeInfo = detectCodeLikelihood(text)
        onMultilinePaste?.({
          type: 'multiline-text',
          text,
          isCode: codeInfo.isCode,
          detectedLanguage: codeInfo.language,
        })
      } else {
        // Let the default paste happen for short text
        onTextPaste?.(text)
      }
    },
    [disabled, onTextPaste, onMultilinePaste, onImagePaste, onPasteError]
  )

  return { handlePaste }
}

/**
 * Extract images from a DataTransfer (for drag-and-drop)
 */
export async function extractImagesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<{ attachments: ChatAttachment[]; errors: string[] }> {
  const attachments: ChatAttachment[] = []
  const errors: string[] = []

  const items = Array.from(dataTransfer.items)

  for (const item of items) {
    if (item.kind !== 'file') continue

    const file = item.getAsFile()
    if (!file) continue

    if (!isSupportedImageType(file.type)) {
      errors.push(`Skipped unsupported file: ${file.name} (${file.type})`)
      continue
    }

    try {
      const attachment = await blobToAttachment(file, file.name)
      attachments.push(attachment)
    } catch (error) {
      errors.push(
        `Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  return { attachments, errors }
}
