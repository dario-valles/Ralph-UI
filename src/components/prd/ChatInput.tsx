import { useState, useRef, useEffect, useCallback, KeyboardEvent, DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Paperclip, Image as ImageIcon, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatAttachment, PastedTextBlock } from '@/types'
import { ATTACHMENT_LIMITS } from '@/types'
import { useClipboardPaste, extractImagesFromDataTransfer } from '@/hooks/useClipboardPaste'
import { fileToAttachment, validateAttachments, combinePasteBlocksWithText } from '@/lib/chat-utils'
import { AttachmentPreview } from './AttachmentPreview'
import { PastedTextPreviewList } from './PastedTextPreview'
import { SlashCommandMenu } from './SlashCommandMenu'
import { SLASH_COMMANDS, type SlashCommand } from '@/lib/prd-chat-commands'

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void
  disabled: boolean
  placeholder?: string
  /** Optional left-side action buttons (e.g., phase buttons) */
  leftActions?: React.ReactNode
}

export function ChatInput({ onSend, disabled, placeholder, leftActions }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [pasteBlocks, setPasteBlocks] = useState<PastedTextBlock[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Slash command state
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)

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
    // Combine paste blocks with typed text
    const combinedMessage = combinePasteBlocksWithText(pasteBlocks, value)
    if (!combinedMessage && attachments.length === 0) return

    // Validate attachments before sending
    const validationError = validateAttachments(attachments)
    if (validationError) {
      setError(validationError)
      return
    }

    onSend(combinedMessage, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setPasteBlocks([])
    setAttachments([])
    setSlashMenuOpen(false)
  }, [value, pasteBlocks, attachments, onSend])

  const handleCommandSelect = (command: SlashCommand) => {
    // Replace the slash command with the template
    const lastSlashIndex = value.lastIndexOf('/')
    if (lastSlashIndex !== -1) {
      const newValue = value.substring(0, lastSlashIndex) + command.template
      setValue(newValue)
      
      // Reset slash menu
      setSlashMenuOpen(false)
      setSlashQuery('')
      
      // Focus back on textarea
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash menu navigation
    if (slashMenuOpen) {
      const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
        cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
      )

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredCommands.length > 0) {
          handleCommandSelect(filteredCommands[slashIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashMenuOpen(false)
        return
      }
    }

    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey && !slashMenuOpen) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setValue(newValue)

    // Check if we are typing a slash command
    const lastSlashIndex = newValue.lastIndexOf('/')
    if (lastSlashIndex !== -1) {
      // Check if slash is at start or preceded by space/newline
      const isStart = lastSlashIndex === 0 || /\s/.test(newValue[lastSlashIndex - 1])
      
      if (isStart) {
        // Get text after slash
        const query = newValue.slice(lastSlashIndex + 1)
        // If query contains space, close menu (command ended)
        if (query.includes(' ')) {
          setSlashMenuOpen(false)
        } else {
          setSlashMenuOpen(true)
          setSlashQuery(query)
          setSlashIndex(0) // Reset index on query change
        }
      } else {
        setSlashMenuOpen(false)
      }
    } else {
      setSlashMenuOpen(false)
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

  // Add paste block
  const addPasteBlock = useCallback((block: PastedTextBlock) => {
    setPasteBlocks((prev) => [...prev, block])
  }, [])

  // Remove paste block and renumber remaining blocks
  const removePasteBlock = useCallback((id: string) => {
    setPasteBlocks((prev) => {
      const filtered = prev.filter((b) => b.id !== id)
      // Renumber remaining blocks sequentially
      return filtered.map((block, index) => ({
        ...block,
        pasteNumber: index + 1,
      }))
    })
  }, [])

  // Handle clipboard paste
  const { handlePaste } = useClipboardPaste({
    disabled,
    currentPasteCount: pasteBlocks.length,
    onTextPaste: () => {
      // Let default paste happen for short text
    },
    onMultilinePaste: (block) => {
      addPasteBlock(block)
    },
    onImagePaste: (attachment) => {
      addAttachment(attachment)
    },
    onPasteError: (err) => {
      setError(err)
    },
  })

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

  const canSend = !disabled && (value.trim() !== '' || attachments.length > 0 || pasteBlocks.length > 0)

  return (
    <div className="space-y-2 relative">
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

      {/* Slash Command Menu */}
      <SlashCommandMenu
        isOpen={slashMenuOpen}
        query={slashQuery}
        onSelect={handleCommandSelect}
      />

      {/* Pasted text preview chips */}
      <PastedTextPreviewList blocks={pasteBlocks} onRemove={removePasteBlock} disabled={disabled} />

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
          {/* Left actions group (phase buttons + attachment) */}
          <div className="flex items-center flex-shrink-0">
            {/* Phase action buttons (inline) */}
            {leftActions}

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
          </div>

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste as React.ClipboardEventHandler}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false)
              // Delay closing menu to allow click events to register
              setTimeout(() => setSlashMenuOpen(false), 200)
            }}
            placeholder={placeholder || 'Type your message... (Try / for commands)'}
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
          <span>AI-powered PRD assistant &middot; Type / for commands</span>
        </div>
        <span>Enter to send &middot; Shift+Enter for new line</span>
      </div>

    </div>
  )
}
