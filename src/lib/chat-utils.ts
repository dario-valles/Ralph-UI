// Chat utility functions for attachments and paste handling

import { ATTACHMENT_LIMITS, type AttachmentMimeType, type ChatAttachment } from '@/types'
import { CODE_PATTERNS, PASTE_CONFIG } from './chat-constants'

/**
 * Validate a file for attachment
 * @returns Error message if invalid, null if valid
 */
export function validateAttachmentFile(file: File): string | null {
  // Check file size
  if (file.size > ATTACHMENT_LIMITS.MAX_SIZE) {
    const maxMB = ATTACHMENT_LIMITS.MAX_SIZE / (1024 * 1024)
    const fileMB = (file.size / (1024 * 1024)).toFixed(2)
    return `File too large: ${fileMB}MB (max ${maxMB}MB)`
  }

  // Check MIME type
  if (!ATTACHMENT_LIMITS.SUPPORTED_TYPES.includes(file.type as AttachmentMimeType)) {
    return `Unsupported file type: ${file.type}. Supported: PNG, JPEG, GIF, WebP`
  }

  return null
}

/**
 * Validate a list of attachments
 * @returns Error message if invalid, null if valid
 */
export function validateAttachments(attachments: ChatAttachment[]): string | null {
  if (attachments.length > ATTACHMENT_LIMITS.MAX_COUNT) {
    return `Too many attachments: ${attachments.length} (max ${ATTACHMENT_LIMITS.MAX_COUNT})`
  }

  for (let i = 0; i < attachments.length; i++) {
    if (attachments[i].size > ATTACHMENT_LIMITS.MAX_SIZE) {
      const maxMB = ATTACHMENT_LIMITS.MAX_SIZE / (1024 * 1024)
      const fileMB = (attachments[i].size / (1024 * 1024)).toFixed(2)
      return `Attachment ${i + 1} too large: ${fileMB}MB (max ${maxMB}MB)`
    }
  }

  return null
}

/**
 * Convert a File to a ChatAttachment
 */
export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const error = validateAttachmentFile(file)
  if (error) {
    throw new Error(error)
  }

  const base64 = await fileToBase64(file)
  const dimensions = await getImageDimensions(file)

  return {
    id: crypto.randomUUID(),
    mimeType: file.type as AttachmentMimeType,
    data: base64,
    filename: file.name,
    size: file.size,
    width: dimensions?.width,
    height: dimensions?.height,
  }
}

/**
 * Convert a File to base64 string (without data URL prefix)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Get image dimensions from a File
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null)
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Create a data URL from a ChatAttachment
 */
export function attachmentToDataUrl(attachment: ChatAttachment): string {
  return `data:${attachment.mimeType};base64,${attachment.data}`
}

/**
 * Convert a clipboard blob to a ChatAttachment
 */
export async function blobToAttachment(blob: Blob, filename?: string): Promise<ChatAttachment> {
  // Convert Blob to File for validation
  const file = new File([blob], filename || `paste-${Date.now()}.png`, { type: blob.type })
  return fileToAttachment(file)
}

/**
 * Check if pasted text should trigger the preview dialog
 */
export function shouldShowPastePreview(text: string): boolean {
  const lineCount = text.split('\n').length
  return lineCount >= PASTE_CONFIG.PREVIEW_THRESHOLD
}

/**
 * Detect if text looks like code
 */
export function detectCodeLikelihood(text: string): { isCode: boolean; language: string | null } {
  // Check each language's patterns
  for (const [language, patterns] of Object.entries(CODE_PATTERNS)) {
    const matches = patterns.filter((pattern) => pattern.test(text))
    // If more than half the patterns match, it's likely this language
    if (matches.length >= Math.ceil(patterns.length / 3)) {
      return { isCode: true, language }
    }
  }

  // General code indicators
  const codeIndicators = [
    /^\s*(\/\/|#|\/\*|\*|<!--)/, // Comments
    /[{};]\s*$/, // Block endings
    /^\s*\w+\s*\([^)]*\)\s*[{;]?/, // Function-like patterns
    /[=!<>]=/, // Comparison operators
    /&&|\|\|/, // Logical operators
    /\$\{.*\}/, // Template literals
  ]

  const generalMatches = codeIndicators.filter((pattern) => pattern.test(text))
  if (generalMatches.length >= 2) {
    return { isCode: true, language: null }
  }

  return { isCode: false, language: null }
}

/**
 * Wrap text in a code block
 */
export function wrapInCodeBlock(text: string, language: string = ''): string {
  return `\`\`\`${language}\n${text}\n\`\`\``
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Get a display-friendly MIME type
 */
export function formatMimeType(mimeType: AttachmentMimeType): string {
  const map: Record<AttachmentMimeType, string> = {
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
  }
  return map[mimeType] || mimeType
}

/**
 * Check if a MIME type is a supported image type
 */
export function isSupportedImageType(mimeType: string): mimeType is AttachmentMimeType {
  return ATTACHMENT_LIMITS.SUPPORTED_TYPES.includes(mimeType as AttachmentMimeType)
}
