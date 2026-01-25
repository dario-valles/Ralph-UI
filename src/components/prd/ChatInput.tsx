import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Image as ImageIcon, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatAttachment } from '@/types'
import { ATTACHMENT_LIMITS } from '@/types'
import {
  useClipboardPaste,
  extractImagesFromDataTransfer,
  type PasteResult,
} from '@/hooks/useClipboardPaste'
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
  const [isFocused, setIsFocused] = useState(false)

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
    setAttachments((prev) => {
      if (prev.length >= ATTACHMENT_LIMITS.MAX_COUNT) {
        setError(`Maximum ${ATTACHMENT_LIMITS.MAX_COUNT} attachments allowed`)
        return prev
      }
      return [...prev, attachment]
    })
  }, [])

  // Remove attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
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
    setValue((prev) => prev + text)
    setPastePreview(null)
  }, [])

  // Handle file input change
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [addAttachment]
  )

  // Drag and drop handlers
  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) {
        setIsDragOver(true)
      }
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (disabled) return

      const { attachments: newAttachments, errors } = await extractImagesFromDataTransfer(
        e.dataTransfer
      )

      for (const attachment of newAttachments) {
        addAttachment(attachment)
      }

      if (errors.length > 0) {
        setError(errors[0])
      }
    },
    [disabled, addAttachment]
  )

  const canSend = !disabled && (value.trim() !== '' || attachments.length > 0)

  return (
    <div className="space-y-2">
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/50 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <span className="flex-1 min-w-0 break-words">{error}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 flex-shrink-0 hover:bg-red-100 dark:hover:bg-red-900/30"
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

      {/* Input area with premium styling */}
      <div
        className={cn(
          'relative rounded-2xl transition-all duration-300',
          // Base styling
          'bg-gradient-to-b from-background to-muted/30',
          'border shadow-sm',
          // Focus state
          isFocused && !disabled
            ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5 ring-4 ring-emerald-500/10'
            : 'border-border/50',
          // Drag state
          isDragOver && 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20',
          // Disabled state
          disabled && 'opacity-60 cursor-not-allowed'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 rounded-2xl z-10 pointer-events-none backdrop-blur-sm">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
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

        {/* Input row */}
        <div className="flex items-end gap-1 p-1.5">
          {/* Attachment button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 rounded-xl flex-shrink-0',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/80 transition-colors'
            )}
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder || 'Type your message...'}
            disabled={disabled}
            aria-label="Message input"
            className={cn(
              'flex-1 resize-none border-0 bg-transparent',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'min-h-[44px] sm:min-h-[40px] max-h-[150px] sm:max-h-[200px]',
              'py-2.5 px-2 text-base sm:text-sm',
              'placeholder:text-muted-foreground/60'
            )}
            rows={1}
          />

          {/* Send button */}
          <Button
            type="button"
            size="icon"
            className={cn(
              'h-9 w-9 rounded-xl flex-shrink-0 transition-all duration-200',
              canSend
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md shadow-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/30 hover:scale-105'
                : 'bg-muted text-muted-foreground'
            )}
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Helper text - refined styling */}
      <div className="hidden sm:flex items-center justify-between px-1 text-[11px] text-muted-foreground/60">
        <div className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          <span>AI-powered PRD assistant</span>
        </div>
        <span>Enter to send &middot; Shift+Enter for new line</span>
      </div>

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
