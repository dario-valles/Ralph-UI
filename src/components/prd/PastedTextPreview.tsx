// Collapsible chip component for displaying pasted multiline text blocks

import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PastedTextBlock } from '@/types'
import { cn } from '@/lib/utils'
import { PASTE_CONFIG } from '@/lib/chat-constants'

interface PastedTextPreviewProps {
  /** The paste block to display */
  block: PastedTextBlock
  /** Callback to remove this paste block */
  onRemove: (id: string) => void
  /** Whether the component is disabled */
  disabled?: boolean
}

export function PastedTextPreview({ block, onRemove, disabled }: PastedTextPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Truncate preview content if too long
  const previewContent =
    block.content.length > PASTE_CONFIG.MAX_PREVIEW_LENGTH
      ? block.content.slice(0, PASTE_CONFIG.MAX_PREVIEW_LENGTH) + '\n... (truncated)'
      : block.content

  const additionalLines = block.lineCount - 1

  return (
    <div
      className={cn(
        'inline-flex flex-col rounded-lg border transition-all duration-200',
        'bg-muted/30 border-border/50',
        'max-w-xs sm:max-w-sm',
        isExpanded && 'bg-muted/50'
      )}
    >
      {/* Chip header - always visible */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 text-left min-w-0',
            'hover:opacity-80 transition-opacity',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium truncate">
            Pasted text #{block.pasteNumber}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            +{additionalLines} line{additionalLines !== 1 ? 's' : ''}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onRemove(block.id)}
          disabled={disabled}
          aria-label={`Remove pasted text #${block.pasteNumber}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-1.5">
          <pre
            className={cn(
              'p-1.5 rounded-md text-[10px] font-mono overflow-auto',
              'max-h-[120px] sm:max-h-[150px]',
              'bg-background/50 border border-border/30'
            )}
          >
            <code className="text-foreground/90">{previewContent}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

interface PastedTextPreviewListProps {
  /** List of paste blocks to display */
  blocks: PastedTextBlock[]
  /** Callback to remove a paste block */
  onRemove: (id: string) => void
  /** Whether the component is disabled */
  disabled?: boolean
}

export function PastedTextPreviewList({ blocks, onRemove, disabled }: PastedTextPreviewListProps) {
  if (blocks.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {blocks.map((block) => (
        <PastedTextPreview key={block.id} block={block} onRemove={onRemove} disabled={disabled} />
      ))}
    </div>
  )
}
