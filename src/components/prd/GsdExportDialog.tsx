import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Download, GitBranch, FileText } from 'lucide-react'
import { gsdApi } from '@/lib/api/gsd-api'
import { gitApi, type BranchInfo } from '@/lib/api/git-api'
import { toast } from '@/stores/toastStore'
import type { ConversionResult } from '@/types/planning'

interface GsdExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  sessionTitle: string
  projectPath: string
  /** Called when export completes successfully */
  onExportComplete: (prdName: string, result: ConversionResult) => void
}

export function GsdExportDialog({
  open,
  onOpenChange,
  sessionId,
  sessionTitle,
  projectPath,
  onExportComplete,
}: GsdExportDialogProps) {
  const [prdName, setPrdName] = useState('')
  const [branch, setBranch] = useState('main')
  const [includeV2, setIncludeV2] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)

  // Generate default PRD name from session ID
  useEffect(() => {
    if (open && !prdName) {
      // Create default name matching backend convention: {sanitized-title}-{short-id}
      const sanitized = sessionTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
        .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
        .slice(0, 50) // Limit length

      const shortId = sessionId.slice(0, 8)
      setPrdName(`${sanitized}-${shortId}`)
    }
  }, [open, prdName, sessionId, sessionTitle])

  // Load branches when dialog opens
  const loadBranches = useCallback(async () => {
    if (!projectPath) return

    setBranchesLoading(true)
    try {
      const branchList = await gitApi.listBranches(projectPath)
      setBranches(branchList)

      // Set default branch to current HEAD or 'main'
      const headBranch = branchList.find((b) => b.is_head)
      if (headBranch) {
        setBranch(headBranch.name)
      } else {
        const mainBranch = branchList.find((b) => b.name === 'main' || b.name === 'master')
        if (mainBranch) {
          setBranch(mainBranch.name)
        }
      }
    } catch (err) {
      console.error('[GsdExportDialog] Failed to load branches:', err)
      // Keep default 'main' branch
    } finally {
      setBranchesLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    if (open && projectPath) {
      loadBranches()
    }
  }, [open, projectPath, loadBranches])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setPrdName('')
      setIncludeV2(false)
      setIsExporting(false)
    }
  }, [open])

  const handleExport = async () => {
    if (!prdName.trim()) {
      toast.error('Invalid Name', 'Please enter a name for the PRD.')
      return
    }

    // Sanitize PRD name (replace spaces with hyphens, remove special chars)
    const sanitizedName = prdName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    if (!sanitizedName) {
      toast.error('Invalid Name', 'PRD name must contain at least one alphanumeric character.')
      return
    }

    setIsExporting(true)
    try {
      const result = await gsdApi.exportToRalph(
        projectPath,
        sessionId,
        sanitizedName,
        branch,
        includeV2
      )

      toast.success('PRD Exported', `Created "${sanitizedName}" with ${result.storyCount} stories`)
      onExportComplete(sanitizedName, result)
      onOpenChange(false)
    } catch (err) {
      console.error('[GsdExportDialog] Export failed:', err)
      toast.error(
        'Export Failed',
        err instanceof Error ? err.message : 'An unexpected error occurred'
      )
    } finally {
      setIsExporting(false)
    }
  }

  const isValid = prdName.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export to Ralph PRD
          </DialogTitle>
          <DialogDescription>
            Create an executable PRD from your GSD planning session. The PRD will be saved to{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">.ralph-ui/prds/</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* PRD Name */}
          <div className="space-y-2">
            <Label htmlFor="prd-name" className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              PRD Name
            </Label>
            <Input
              id="prd-name"
              value={prdName}
              onChange={(e) => setPrdName(e.target.value)}
              placeholder="my-feature-prd"
              disabled={isExporting}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Used as the filename. Spaces and special characters will be replaced.
            </p>
          </div>

          {/* Target Branch */}
          <div className="space-y-2">
            <Label htmlFor="branch" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              Target Branch
            </Label>
            <Select
              id="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={branchesLoading || isExporting}
            >
              {branchesLoading ? (
                <option>Loading branches...</option>
              ) : branches.length === 0 ? (
                <option value="main">main</option>
              ) : (
                branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.is_head ? '(current)' : ''}
                  </option>
                ))
              )}
            </Select>
            <p className="text-xs text-muted-foreground">
              Branch where the Ralph Loop will create feature branches from.
            </p>
          </div>

          {/* Include V2 */}
          <div className="rounded-md border border-dashed border-blue-500/50 bg-blue-500/5 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={includeV2}
                onCheckedChange={(checked) => setIncludeV2(checked as boolean)}
                disabled={isExporting}
              />
              <div className="flex-1">
                <span className="text-sm font-medium">Include V2 Requirements</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Add V2-scoped requirements as lower priority stories. They will be worked on after
                  all V1 stories are complete.
                </p>
              </div>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!isValid || isExporting}
            className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export PRD
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
