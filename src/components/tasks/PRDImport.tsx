import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useTaskStore } from '@/stores/taskStore'
import { toast } from '@/stores/toastStore'
import { FileText, Upload, AlertCircle } from 'lucide-react'

// Validation constants
const ALLOWED_EXTENSIONS = ['.json', '.yaml', '.yml', '.md', '.markdown', '.txt']
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_FILE_SIZE_MB = 5

interface PRDImportProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
}

/**
 * Validates a file for upload
 * @param file - The file to validate
 * @returns An error message if validation fails, or null if valid
 */
function validateFile(file: File): string | null {
  // Check file extension
  const fileName = file.name.toLowerCase()
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))
  if (!hasValidExtension) {
    return `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`
  }

  // Check for empty file
  if (file.size === 0) {
    return 'File is empty. Please select a file with content'
  }

  return null
}

export function PRDImport({ open, onOpenChange, sessionId }: PRDImportProps) {
  const { importPRD, loading, error } = useTaskStore()
  const [format, setFormat] = useState<string>('auto')
  const [fileContent, setFileContent] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Clear previous errors
    setValidationError(null)
    setFileContent('')
    setFileName('')

    // Validate the file before processing
    const validationResult = validateFile(file)
    if (validationResult) {
      setValidationError(validationResult)
      // Reset the input so the same file can be selected again after fixing
      e.target.value = ''
      return
    }

    setFileName(file.name)

    // Auto-detect format from extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'json') setFormat('json')
    else if (ext === 'yaml' || ext === 'yml') setFormat('yaml')
    else if (ext === 'md' || ext === 'markdown' || ext === 'txt') setFormat('markdown')

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      // Additional check: file might have size but contain only whitespace
      if (!content || content.trim().length === 0) {
        setValidationError('File appears to be empty or contains only whitespace')
        setFileName('')
        return
      }
      setFileContent(content)
    }
    reader.onerror = () => {
      setValidationError('Failed to read file. Please try again')
      setFileName('')
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!fileContent) return

    const formatToUse = format === 'auto' ? undefined : format
    try {
      await importPRD(sessionId, fileContent, formatToUse)
      toast.success('PRD imported', 'Tasks have been imported successfully.')
      // Reset and close on success
      setFileContent('')
      setFileName('')
      setFormat('auto')
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to import PRD:', err)
      toast.error('Failed to import PRD', err instanceof Error ? err.message : 'An unexpected error occurred.')
    }
  }

  const handleClose = () => {
    setFileContent('')
    setFileName('')
    setFormat('auto')
    setValidationError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Import PRD</DialogTitle>
          <DialogDescription>
            Import tasks from a Product Requirements Document in JSON, YAML, or Markdown format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select File</label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="file-upload"
                className="flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent"
              >
                <FileText className="h-4 w-4" />
                <span className="flex-1 truncate text-muted-foreground">
                  {fileName || 'Choose a file...'}
                </span>
                <Upload className="h-4 w-4" />
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".json,.yaml,.yml,.md,.markdown,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <label htmlFor="format" className="text-sm font-medium">
              Format
            </label>
            <Select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={loading}
            >
              <option value="auto">Auto-detect</option>
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
              <option value="markdown">Markdown</option>
            </Select>
          </div>

          {/* Preview */}
          {fileContent && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview</label>
              <div className="max-h-48 overflow-auto rounded-md border bg-muted p-3">
                <pre className="text-xs">{fileContent.slice(0, 500)}</pre>
                {fileContent.length > 500 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    ... and {fileContent.length - 500} more characters
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {(error || validationError) && (
            <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <div className="flex-1 text-sm text-destructive">{validationError || error}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!fileContent || loading}>
            {loading ? 'Importing...' : 'Import Tasks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
