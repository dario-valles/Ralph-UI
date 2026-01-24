// Attachment preview chips for displaying staged attachments in chat input

import { X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatAttachment } from '@/types'
import { attachmentToDataUrl, formatFileSize, formatMimeType } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'

interface AttachmentPreviewProps {
  attachments: ChatAttachment[]
  onRemove: (id: string) => void
  disabled?: boolean
  className?: string
}

export function AttachmentPreview({
  attachments,
  onRemove,
  disabled = false,
  className,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5 sm:gap-2 py-1.5 sm:py-2', className)}>
      {attachments.map((attachment) => (
        <AttachmentChip
          key={attachment.id}
          attachment={attachment}
          onRemove={() => onRemove(attachment.id)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

interface AttachmentChipProps {
  attachment: ChatAttachment
  onRemove: () => void
  disabled?: boolean
}

function AttachmentChip({ attachment, onRemove, disabled }: AttachmentChipProps) {
  const dataUrl = attachmentToDataUrl(attachment)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-1.5 sm:gap-2 rounded-lg border bg-card p-1 sm:p-1.5 pr-1.5 sm:pr-2',
        'hover:bg-accent/50 transition-colors',
        disabled && 'opacity-50'
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-8 w-8 sm:h-10 sm:w-10 overflow-hidden rounded-md bg-muted flex-shrink-0">
        <img
          src={dataUrl}
          alt={attachment.filename || 'Attachment'}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] sm:text-xs font-medium truncate max-w-[80px] sm:max-w-[100px]">
          {attachment.filename || 'Image'}
        </span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground">
          {formatMimeType(attachment.mimeType)} - {formatFileSize(attachment.size)}
        </span>
      </div>

      {/* Remove button - always visible on touch devices */}
      {!disabled && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-5 w-5 sm:h-5 sm:w-5 rounded-full transition-opacity',
            'absolute -top-1.5 -right-1.5 bg-destructive hover:bg-destructive/90',
            'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          )}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <X className="h-3 w-3 text-destructive-foreground" />
          <span className="sr-only">Remove attachment</span>
        </Button>
      )}
    </div>
  )
}

interface AttachmentListProps {
  attachments: ChatAttachment[]
  className?: string
}

/**
 * Read-only display of attachments (for message display)
 */
export function AttachmentList({ attachments, className }: AttachmentListProps) {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5 sm:gap-2 mt-1.5 sm:mt-2', className)}>
      {attachments.map((attachment) => (
        <AttachmentImage key={attachment.id} attachment={attachment} />
      ))}
    </div>
  )
}

interface AttachmentImageProps {
  attachment: ChatAttachment
}

/**
 * Single attachment image display (expandable)
 */
function AttachmentImage({ attachment }: AttachmentImageProps) {
  const dataUrl = attachmentToDataUrl(attachment)

  return (
    <a
      href={dataUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'relative block overflow-hidden rounded-lg border',
        'hover:ring-2 hover:ring-primary/50 transition-all',
        'max-w-[200px] sm:max-w-sm'
      )}
    >
      <img
        src={dataUrl}
        alt={attachment.filename || 'Attachment'}
        className="max-h-48 sm:max-h-64 w-auto object-contain"
        loading="lazy"
      />
      {/* Overlay with file info - always visible on mobile */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1',
          'bg-black/60 text-white text-[10px] sm:text-xs',
          'opacity-100 sm:opacity-0 sm:hover:opacity-100 transition-opacity'
        )}
      >
        <ImageIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        <span className="truncate">{attachment.filename || 'Image'}</span>
        <span className="text-white/70 ml-auto hidden sm:inline">
          {formatFileSize(attachment.size)}
        </span>
      </div>
    </a>
  )
}
