import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Play,
  FileText,
  Loader2,
  CheckCircle,
  FolderOpen,
  RefreshCw,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { prdApi } from '@/lib/backend-api'
import { toast } from '@/stores/toastStore'
import { formatBackendDateOnly, formatBackendTime } from '@/lib/date-utils'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { PRDFile } from '@/types'

/**
 * PRD List Component - File-based storage only
 * Lists and manages PRD markdown files from .ralph-ui/prds/ directory
 */
export function PRDList() {
  const navigate = useNavigate()
  const { getActiveProject } = useProjectStore()
  const activeProject = getActiveProject()
  const isMobile = useIsMobile()

  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [prdFiles, setPrdFiles] = useState<PRDFile[]>([])
  const [loading, setLoading] = useState(false)
  const [executeDialogFile, setExecuteDialogFile] = useState<PRDFile | null>(null)
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<PRDFile | null>(null)

  // Load file-based PRDs when active project changes
  const loadPrdFiles = useCallback(async () => {
    if (!activeProject) {
      setPrdFiles([])
      return
    }
    setLoading(true)
    try {
      const files = await prdApi.scanFiles(activeProject.path)
      setPrdFiles(files)
    } catch (err) {
      console.error('Failed to scan PRD files:', err)
      toast.error(
        'Failed to load PRDs',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      )
    } finally {
      setLoading(false)
    }
  }, [activeProject])

  useEffect(() => {
    loadPrdFiles()
  }, [loadPrdFiles])

  // Filter by search query
  const filteredPRDs = useMemo(() => {
    return prdFiles.filter((file) => {
      return (
        file.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })
  }, [prdFiles, searchQuery])

  // Get project name from path
  const getProjectName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
  }

  // Open execution dialog for a file-based PRD
  const handleExecuteFile = (file: PRDFile) => {
    setExecuteDialogFile(file)
  }

  // Navigate to file editor
  const handleEditFile = (file: PRDFile) => {
    const prdName = file.id.replace('file:', '')
    navigate(
      `/prds/file?project=${encodeURIComponent(file.projectPath)}&name=${encodeURIComponent(prdName)}`
    )
  }

  // Delete a file-based PRD and all related resources
  const handleDeleteFile = async (file: PRDFile) => {
    setDeleting(file.id)
    setDeleteConfirmFile(null)
    try {
      const prdName = file.id.replace('file:', '')
      const result = await prdApi.deleteFile(file.projectPath, prdName)

      // Build summary message
      const parts: string[] = []
      if (result.deletedFiles.length > 0) {
        parts.push(`${result.deletedFiles.length} file(s)`)
      }
      if (result.removedWorktrees.length > 0) {
        parts.push(`${result.removedWorktrees.length} worktree(s)`)
      }
      if (result.deletedBranches.length > 0) {
        parts.push(`${result.deletedBranches.length} branch(es)`)
      }

      const summary = parts.length > 0 ? `Deleted ${parts.join(', ')}` : 'PRD deleted'

      if (result.warnings.length > 0) {
        toast.default(summary, `Warnings: ${result.warnings.join('; ')}`)
      } else {
        toast.success('PRD deleted', summary)
      }

      // Refresh the file list
      loadPrdFiles()
    } catch (err) {
      console.error('Failed to delete PRD file:', err)
      toast.error(
        'Failed to delete PRD',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      )
    } finally {
      setDeleting(null)
    }
  }

  // Get status badge for a PRD file
  const getStatusBadge = (file: PRDFile) => {
    if (file.hasRalphJson && file.hasProgress) {
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Active
        </Badge>
      )
    }
    if (file.hasRalphJson) {
      return (
        <Badge variant="secondary" className="gap-1">
          <FileText className="h-3 w-3" />
          Initialized
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="gap-1">
        <FileText className="h-3 w-3" />
        Draft
      </Badge>
    )
  }

  if (loading && prdFiles.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="container mx-auto max-w-6xl py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Project Selected</h2>
            <p className="text-muted-foreground text-center mb-4">
              Select a project from the sidebar to view and manage its PRDs.
            </p>
            <Button onClick={() => navigate('/projects')}>Select Project</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Mobile card view for a single PRD file
  const PRDCard = ({ file }: { file: PRDFile }) => (
    <Card key={file.id} className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{file.title}</div>
            <div className="text-xs text-muted-foreground truncate">{file.filePath}</div>
          </div>
        </div>
        {getStatusBadge(file)}
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        Modified {formatBackendDateOnly(file.modifiedAt)} at {formatBackendTime(file.modifiedAt)}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExecuteFile(file)}
          className="flex-1 touch-target"
        >
          <Play className="h-4 w-4 mr-1" />
          Execute
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditFile(file)}
          className="flex-1 touch-target"
        >
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDeleteConfirmFile(file)}
          disabled={deleting === file.id}
          className="touch-target"
        >
          {deleting === file.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </Card>
  )

  return (
    <div className="container mx-auto max-w-6xl py-4 md:py-8 px-4 md:px-6">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Product Requirements Documents</h1>
          <p className="mt-1 md:mt-2 text-sm text-muted-foreground">
            PRDs for {getProjectName(activeProject.path)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPrdFiles()}
            disabled={loading}
            className="gap-2 touch-target md:min-h-0"
            title="Refresh PRD files from .ralph-ui/prds/"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => navigate('/prds/chat')} className="gap-2 touch-target md:min-h-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New PRD Chat</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 md:mb-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PRDs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* PRD List */}
      {filteredPRDs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 md:py-16">
            <FileText className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg md:text-xl font-semibold mb-2">No PRDs Found</h2>
            <p className="text-muted-foreground text-center mb-4 text-sm">
              {searchQuery
                ? 'No PRDs match your search. Try a different query.'
                : 'Create your first PRD using the AI-assisted chat interface.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate('/prds/chat')} className="touch-target md:min-h-0">
                <Plus className="h-4 w-4 mr-2" />
                Create PRD
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        // Mobile: Card list view
        <div className="space-y-3">
          {filteredPRDs.map((file) => (
            <PRDCard key={file.id} file={file} />
          ))}
        </div>
      ) : (
        // Desktop: Table view
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPRDs.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{file.title}</div>
                        <div className="text-xs text-muted-foreground">{file.filePath}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(file)}</TableCell>
                  <TableCell>
                    <div className="text-sm">{formatBackendDateOnly(file.modifiedAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBackendTime(file.modifiedAt)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleExecuteFile(file)}
                        title="Execute PRD"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEditFile(file)}
                        title="Edit PRD"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setDeleteConfirmFile(file)}
                        disabled={deleting === file.id}
                        title="Delete PRD"
                      >
                        {deleting === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Execution Dialog */}
      {executeDialogFile && (
        <PRDFileExecutionDialog
          file={executeDialogFile}
          open={true}
          onOpenChange={(open) => !open && setExecuteDialogFile(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmFile}
        onOpenChange={(open) => !open && setDeleteConfirmFile(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete PRD</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteConfirmFile?.title}&quot;? This will also
              delete associated worktrees and branches.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmFile(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmFile && handleDeleteFile(deleteConfirmFile)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
