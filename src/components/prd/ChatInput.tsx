import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Image as ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatAttachment } from '@/types'
import { ATTACHMENT_LIMITS } from '@/types'
import { useClipboardPaste, extractImagesFromDataTransfer, type PasteResult } from '@/hooks/useClipboardPaste'
import { fileToAttachment, validateAttachments } from '@/lib/chat-utils'
import { AttachmentPreview } from './AttachmentPreview'
import { PastePreviewDialog } from './PastePreviewDialog'

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void
  disabled: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [pastePreview, setPastePreview] = useState<PasteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    // Set height to scrollHeight, capped at max height
    const maxHeight = 200 // ~8 lines
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [value])

  // Clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleSend = useCallback(() => {
    const trimmedValue = value.trim()
    if (!trimmedValue && attachments.length === 0) return

    // Validate attachments before sending
    const validationError = validateAttachments(attachments)
    if (validationError) {
      setError(validationError)
      return
    }

    onSend(trimmedValue, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setAttachments([])
  }, [value, attachments, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Add attachment (with validation)
  const addAttachment = useCallback((attachment: ChatAttachment) => {
    setAttachments(prev => {
      if (prev.length >= ATTACHMENT_LIMITS.MAX_COUNT) {
        setError(`Maximum ${ATTACHMENT_LIMITS.MAX_COUNT} attachments allowed`)
        return prev
      }
      return [...prev, attachment]
    })
  }, [])

  // Remove attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  // Handle clipboard paste
  const { handlePaste } = useClipboardPaste({
    disabled,
    onTextPaste: () => {
      // Let default paste happen for short text
    },
    onMultilinePaste: (result) => {
      setPastePreview(result)
    },
    onImagePaste: (attachment) => {
      addAttachment(attachment)
    },
    onPasteError: (err) => {
      setError(err)
    },
  })

  // Handle paste preview dialog confirmation
  const handlePasteConfirm = useCallback((text: string) => {
    setValue(prev => prev + text)
    setPastePreview(null)
  }, [])

  // Handle file input change
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        const attachment = await fileToAttachment(file)
        addAttachment(attachment)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process file')
      }
    }

    // Reset input value so the same file can be selected again
    e.target.value = ''
  }, [addAttachment])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (disabled) return

    const { attachments: newAttachments, errors } = await extractImagesFromDataTransfer(e.dataTransfer)

    for (const attachment of newAttachments) {
      addAttachment(attachment)
    }

    if (errors.length > 0) {
      setError(errors[0])
    }
  }, [disabled, addAttachment])

  const canSend = !disabled && (value.trim() !== '' || attachments.length > 0)

  return (
    <div className="space-y-2">
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive bg-destructive/10 rounded-md">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 ml-auto"
            onClick={() => setError(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Attachment preview chips */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={removeAttachment}
        disabled={disabled}
      />

      {/* Input area with drag-drop zone */}
      <div
        className={cn(
          'relative flex gap-2 rounded-md border transition-colors',
          isDragOver && 'border-primary bg-primary/5',
          disabled && 'opacity-50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-md z-10 pointer-events-none">
            <div className="flex items-center gap-2 text-primary">
              <ImageIcon className="h-5 w-5" />
              <span className="text-sm font-medium">Drop images here</span>
            </div>
          </div>
        )}

        {/* File input (hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_LIMITS.SUPPORTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Attachment button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="self-end mb-1 ml-1"
          disabled={disabled || attachments.length >= ATTACHMENT_LIMITS.MAX_COUNT}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add attachment"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste as React.ClipboardEventHandler}
          placeholder={placeholder || 'Type your message... (Shift+Enter for new line)'}
          disabled={disabled}
          aria-label="Message input"
          className={cn(
            'flex-1 resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            'min-h-[40px] max-h-[200px] py-2.5'
          )}
          rows={1}
        />

        {/* Send button */}
        <Button
          type="button"
          size="icon"
          className="self-end mb-1 mr-1"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line. Paste or drop images to attach.
      </p>

      {/* Paste preview dialog */}
      <PastePreviewDialog
        open={pastePreview !== null}
        onOpenChange={(open) => !open && setPastePreview(null)}
        content={pastePreview?.text || ''}
        isCode={pastePreview?.isCode}
        detectedLanguage={pastePreview?.detectedLanguage}
        onConfirm={handlePasteConfirm}
        onCancel={() => setPastePreview(null)}
      />
    </div>
  )
}
