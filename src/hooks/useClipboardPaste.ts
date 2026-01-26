// Hook for handling clipboard paste events (text and images)

import { useCallback, useRef } from 'react'
import type { ChatAttachment, PastedTextBlock } from '@/types'
import { blobToAttachment, isMultilinePaste, createPastedTextBlock, isSupportedImageType } from '@/lib/chat-utils'

export interface UseClipboardPasteOptions {
  /** Callback when text is pasted (single line, goes directly to textarea) */
  onTextPaste?: (text: string) => void
  /** Callback when multiline text is pasted (creates a paste block) */
  onMultilinePaste?: (block: PastedTextBlock) => void
  /** Callback when an image is pasted */
  onImagePaste?: (attachment: ChatAttachment) => void
  /** Callback when paste fails */
  onPasteError?: (error: string) => void
  /** Whether paste handling is disabled */
  disabled?: boolean
  /** Current paste count for numbering (used to set pasteNumber on new blocks) */
  currentPasteCount?: number
}

export function useClipboardPaste(options: UseClipboardPasteOptions) {
  const {
    onTextPaste,
    onMultilinePaste,
    onImagePaste,
    onPasteError,
    disabled = false,
    currentPasteCount = 0,
  } = options

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

      // Check if this is multiline text
      if (isMultilinePaste(text)) {
        event.preventDefault()
        // Create a paste block with the next paste number
        const block = createPastedTextBlock(text, currentPasteCount + 1)
        onMultilinePaste?.(block)
      } else {
        // Let the default paste happen for single-line text
        onTextPaste?.(text)
      }
    },
    [disabled, onTextPaste, onMultilinePaste, onImagePaste, onPasteError, currentPasteCount]
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
