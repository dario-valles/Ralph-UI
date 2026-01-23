// Dialog for previewing multi-line text pastes with code block option

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Code, FileText } from 'lucide-react'
import { CODE_LANGUAGES, PASTE_CONFIG } from '@/lib/chat-constants'
import { wrapInCodeBlock } from '@/lib/chat-utils'
import { cn } from '@/lib/utils'

interface PastePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The pasted text content */
  content: string
  /** Whether code was auto-detected */
  isCode?: boolean
  /** Auto-detected language */
  detectedLanguage?: string | null
  /** Called when user confirms the paste */
  onConfirm: (text: string) => void
  /** Called when user cancels */
  onCancel?: () => void
}

export function PastePreviewDialog({
  open,
  onOpenChange,
  content,
  isCode = false,
  detectedLanguage = null,
  onConfirm,
  onCancel,
}: PastePreviewDialogProps) {
  // Use content as a key to reset state when new content is pasted
  // This avoids calling setState in useEffect
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <PastePreviewDialogContent
          content={content}
          isCode={isCode}
          detectedLanguage={detectedLanguage}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  )
}

interface PastePreviewDialogContentProps {
  content: string
  isCode: boolean
  detectedLanguage: string | null
  onConfirm: (text: string) => void
  onCancel?: () => void
  onOpenChange: (open: boolean) => void
}

function PastePreviewDialogContent({
  content,
  isCode,
  detectedLanguage,
  onConfirm,
  onCancel,
  onOpenChange,
}: PastePreviewDialogContentProps) {
  // Initialize state from props - component remounts when dialog opens
  const [wrapInCode, setWrapInCode] = useState(isCode)
  const [language, setLanguage] = useState(detectedLanguage || '')

  // Truncate preview if too long
  const previewContent = useMemo(() => {
    if (content.length <= PASTE_CONFIG.MAX_PREVIEW_LENGTH) {
      return content
    }
    return content.slice(0, PASTE_CONFIG.MAX_PREVIEW_LENGTH) + '\n... (truncated)'
  }, [content])

  const lineCount = content.split('\n').length

  const handleConfirm = () => {
    const finalText = wrapInCode ? wrapInCodeBlock(content, language) : content
    onConfirm(finalText)
    onOpenChange(false)
  }

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {wrapInCode ? (
              <Code className="h-5 w-5 text-primary" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
            Paste Preview
          </DialogTitle>
          <DialogDescription>
            {lineCount} lines pasted. Choose how to format this content.
          </DialogDescription>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex-1 overflow-hidden">
          <pre
            className={cn(
              'p-3 rounded-md text-xs font-mono overflow-auto max-h-[300px]',
              'bg-muted border',
              wrapInCode && 'bg-secondary/50'
            )}
          >
            <code>{previewContent}</code>
          </pre>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-4 py-2">
          {/* Code block toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="wrap-code" className="flex items-center gap-2 cursor-pointer">
              <Code className="h-4 w-4" />
              Wrap in code block
              {isCode && (
                <span className="text-xs text-muted-foreground">(auto-detected)</span>
              )}
            </Label>
            <Switch
              id="wrap-code"
              checked={wrapInCode}
              onCheckedChange={setWrapInCode}
            />
          </div>

          {/* Language selector (only when code block is enabled) */}
          {wrapInCode && (
            <div className="flex items-center justify-between">
              <Label htmlFor="language" className="text-sm">
                Language
                {detectedLanguage && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (detected: {detectedLanguage})
                  </span>
                )}
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language" className="w-[180px]">
                  <SelectValue placeholder="Auto-detect" />
                </SelectTrigger>
                <SelectContent>
                  {CODE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Paste
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}
