import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, FolderInput, Loader2, Eye, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MdFileDetectedPayload } from '@/types'

/** Get icon and styling based on card state */
function getStateConfig(isAssigned: boolean, hasError: boolean) {
  if (isAssigned) {
    return {
      icon: <CheckCircle2 className="h-5 w-5" />,
      containerClass: 'bg-green-500/10 text-green-600 dark:text-green-400',
      label: 'File Assigned',
    }
  }
  if (hasError) {
    return {
      icon: <AlertCircle className="h-5 w-5" />,
      containerClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
      label: 'Assignment Failed',
    }
  }
  return {
    icon: <FileText className="h-5 w-5" />,
    containerClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    label: 'File Created',
  }
}

interface DetectedFileCardProps {
  /** The detected file payload */
  file: MdFileDetectedPayload
  /** Handler for assigning the file as PRD */
  onAssign: () => Promise<void>
  /** Handler for previewing the file content */
  onPreview?: () => void
  /** Whether this file has been assigned */
  isAssigned?: boolean
  /** Optional className for styling */
  className?: string
}

/**
 * Card component displayed when agent creates an .md file outside of .ralph-ui/prds/
 * Shows the detected file path and provides buttons to preview or assign as PRD.
 */
export function DetectedFileCard({
  file,
  onAssign,
  onPreview,
  isAssigned = false,
  className,
}: DetectedFileCardProps) {
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAssign = async () => {
    setIsAssigning(true)
    setError(null)
    try {
      await onAssign()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to assign PRD'
      setError(errorMessage)
    } finally {
      setIsAssigning(false)
    }
  }

  const stateConfig = getStateConfig(isAssigned, !!error)

  return (
    <Card
      className={cn(
        'w-full max-w-lg mx-auto',
        'bg-blue-500/5 border-blue-500/30 dark:bg-blue-500/10',
        isAssigned && 'bg-green-500/5 border-green-500/30 dark:bg-green-500/10',
        error && 'bg-red-500/5 border-red-500/30 dark:bg-red-500/10',
        className
      )}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
              stateConfig.containerClass
            )}
          >
            {stateConfig.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">{stateConfig.label}</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate" title={file.filePath}>
              {file.relativePath}
            </p>

            {/* Error message */}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                {error}
              </p>
            )}

            {/* Actions */}
            {!isAssigned && (
              <div className="flex items-center gap-2 mt-2.5">
                {onPreview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onPreview}
                    className="h-7 px-2.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Preview
                  </Button>
                )}
                <Button
                  variant={error ? 'outline' : 'default'}
                  size="sm"
                  onClick={handleAssign}
                  disabled={isAssigning}
                  className={cn(
                    'h-7 px-2.5 text-xs',
                    error
                      ? 'border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  )}
                >
                  {isAssigning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Assigning...
                    </>
                  ) : error ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Retry
                    </>
                  ) : (
                    <>
                      <FolderInput className="h-3.5 w-3.5 mr-1" />
                      Assign as PRD
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Success message */}
            {isAssigned && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Copied to .ralph-ui/prds/
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
