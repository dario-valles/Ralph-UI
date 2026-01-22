import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Plus,
  Search,
  Edit,
  Trash2,
  Play,
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  MessageSquare,
  FolderOpen,
  Filter,
  ChevronDown,
  ChevronRight,
  FileCode,
  RefreshCw,
} from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { useProjectStore } from '@/stores/projectStore'
import { prdApi } from '@/lib/tauri-api'
import { toast } from '@/stores/toastStore'
import { formatBackendDateOnly, formatBackendTime } from '@/lib/date-utils'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
import type { PRDDocument, PRDFile } from '@/types'

/** Unified display item for both database PRDs and file-based PRDs */
type DisplayPRD =
  | { type: 'database'; data: PRDDocument }
  | { type: 'file'; data: PRDFile }

export function PRDList() {
  const navigate = useNavigate()
  const { prds, loading, error, loadPRDs, deletePRD } = usePRDStore()
  const { getActiveProject } = useProjectStore()
  const activeProject = getActiveProject()

  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterByProject, setFilterByProject] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [prdFiles, setPrdFiles] = useState<PRDFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [executeDialogFile, setExecuteDialogFile] = useState<PRDFile | null>(null)

  // Load database PRDs
  useEffect(() => {
    loadPRDs()
  }, [loadPRDs])

  // Load file-based PRDs when active project changes
  const loadPrdFiles = useCallback(async () => {
    if (!activeProject) {
      setPrdFiles([])
      return
    }
    setLoadingFiles(true)
    try {
      const files = await prdApi.scanFiles(activeProject.path)
      setPrdFiles(files)
    } catch (err) {
      console.error('Failed to scan PRD files:', err)
      // Don't show error toast - just silently fail
    } finally {
      setLoadingFiles(false)
    }
  }, [activeProject])

  useEffect(() => {
    loadPrdFiles()
  }, [loadPrdFiles])

  // Combine database PRDs and file PRDs into unified display items
  const allDisplayPRDs = useMemo((): DisplayPRD[] => {
    // Start with database PRDs
    const dbItems: DisplayPRD[] = prds.map((prd) => ({ type: 'database' as const, data: prd }))

    // Add file PRDs that don't already exist in the database
    // (check by comparing file path pattern with database PRD titles/IDs)
    const fileItems: DisplayPRD[] = prdFiles
      .filter((file) => {
        // A file PRD is considered "new" if there's no database PRD with matching project path
        // that was created from the same file (check by title similarity or sourceChatSessionId)
        return !prds.some(
          (dbPrd) =>
            dbPrd.projectPath === file.projectPath &&
            (dbPrd.title === file.title ||
              // Check if file ID matches (e.g., "file:new-feature-prd-abc123" matches "abc123" in sourceChatSessionId)
              (dbPrd.sourceChatSessionId && file.id.includes(dbPrd.sourceChatSessionId.substring(0, 8))))
        )
      })
      .map((file) => ({ type: 'file' as const, data: file }))

    return [...dbItems, ...fileItems]
  }, [prds, prdFiles])

  // Filter by search query
  const searchFilteredPRDs = allDisplayPRDs.filter((item) => {
    const title = item.type === 'database' ? item.data.title : item.data.title
    const description = item.type === 'database' ? item.data.description : undefined
    return (
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  // Filter by active project
  const filteredPRDs = useMemo(() => {
    if (filterByProject && activeProject) {
      return searchFilteredPRDs.filter((item) => {
        const projectPath = item.type === 'database' ? item.data.projectPath : item.data.projectPath
        return projectPath === activeProject.path
      })
    }
    return searchFilteredPRDs
  }, [searchFilteredPRDs, filterByProject, activeProject])

  // Group PRDs by project path
  const groupedPRDs = useMemo(() => {
    const groups: Record<string, DisplayPRD[]> = {}
    filteredPRDs.forEach((item) => {
      const projectPath = item.type === 'database' ? item.data.projectPath : item.data.projectPath
      const key = projectPath || 'No Project'
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(item)
    })
    return groups
  }, [filteredPRDs])

  // Get project name from path
  const getProjectName = (path: string) => {
    if (path === 'No Project') return path
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
  }

  // Toggle group collapse
  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  // Check if we should show grouped view (multiple projects)
  const showGroupedView = Object.keys(groupedPRDs).length > 1 || (!filterByProject && activeProject)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this PRD?')) return

    setDeleting(id)
    try {
      await deletePRD(id)
      toast.success('PRD deleted', 'The document has been removed.')
    } catch (err) {
      console.error('Failed to delete PRD:', err)
      toast.error('Failed to delete PRD', err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setDeleting(null)
    }
  }

  // Open execution dialog for a file-based PRD
  const handleExecuteFile = (file: PRDFile) => {
    setExecuteDialogFile(file)
  }

  // Navigate to file editor
  const handleEditFile = (file: PRDFile) => {
    // Extract prd name from id (e.g., "file:new-feature-prd-abc123" -> "new-feature-prd-abc123")
    const prdName = file.id.replace('file:', '')
    navigate(`/prds/file?project=${encodeURIComponent(file.projectPath)}&name=${encodeURIComponent(prdName)}`)
  }

  const getQualityBadge = (prd: PRDDocument) => {
    const score = prd.qualityScoreOverall

    if (!score) {
      return (
        <Badge variant="outline" className="gap-1">
          <FileText className="h-3 w-3" />
          Not Analyzed
        </Badge>
      )
    }

    if (score >= 85) {
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          {score}%
        </Badge>
      )
    } else if (score >= 70) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {score}%
        </Badge>
      )
    } else {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          {score}%
        </Badge>
      )
    }
  }

  if (loading && prds.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Product Requirements Documents</h1>
          <p className="mt-2 text-muted-foreground">
            {activeProject && filterByProject
              ? `PRDs for ${getProjectName(activeProject.path)}`
              : 'Manage and execute your PRDs with AI agents'}
          </p>
        </div>
        <div className="flex gap-2">
          {activeProject && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPrdFiles()}
                disabled={loadingFiles}
                className="gap-2"
                title="Refresh PRD files from .ralph-ui/prds/"
              >
                <RefreshCw className={`h-4 w-4 ${loadingFiles ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant={filterByProject ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterByProject(!filterByProject)}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                {filterByProject ? 'Active Project' : 'All Projects'}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => navigate('/prds/chat')} className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Create with Chat
          </Button>
          <Button onClick={() => navigate('/prds/new')} className="gap-2">
            <Plus className="h-4 w-4" />
            Create PRD
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
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
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">
              {searchQuery
                ? 'No PRDs found'
                : filterByProject && activeProject
                  ? `No PRDs for ${getProjectName(activeProject.path)}`
                  : 'No PRDs yet'}
            </h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create your first PRD to get started'}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate('/prds/new')} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Create PRD
              </Button>
            )}
          </CardContent>
        </Card>
      ) : showGroupedView ? (
        // Grouped view - show PRDs grouped by project
        <div className="space-y-4">
          {Object.entries(groupedPRDs).map(([projectPath, projectPRDs]) => (
            <Card key={projectPath}>
              <CardHeader className="py-3">
                <button
                  onClick={() => toggleGroup(projectPath)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  {collapsedGroups.has(projectPath) ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{getProjectName(projectPath)}</CardTitle>
                  <Badge variant="secondary" className="ml-2">
                    {projectPRDs.length}
                  </Badge>
                </button>
                {!collapsedGroups.has(projectPath) && projectPath !== 'No Project' && (
                  <CardDescription className="ml-6 text-xs truncate">
                    {projectPath}
                  </CardDescription>
                )}
              </CardHeader>
              {!collapsedGroups.has(projectPath) && (
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectPRDs.map((item) =>
                        item.type === 'database' ? (
                          <PRDTableRow
                            key={item.data.id}
                            prd={item.data}
                            deleting={deleting}
                            onNavigate={navigate}
                            onDelete={handleDelete}
                            getQualityBadge={getQualityBadge}
                          />
                        ) : (
                          <PRDFileTableRow
                            key={item.data.id}
                            file={item.data}
                            onExecute={handleExecuteFile}
                            onEdit={handleEditFile}
                          />
                        )
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        // Flat view - simple table
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPRDs.map((item) =>
                item.type === 'database' ? (
                  <PRDTableRow
                    key={item.data.id}
                    prd={item.data}
                    deleting={deleting}
                    onNavigate={navigate}
                    onDelete={handleDelete}
                    getQualityBadge={getQualityBadge}
                  />
                ) : (
                  <PRDFileTableRow
                    key={item.data.id}
                    file={item.data}
                    onExecute={handleExecuteFile}
                    onEdit={handleEditFile}
                  />
                )
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Execution dialog for file-based PRDs */}
      <PRDFileExecutionDialog
        file={executeDialogFile}
        open={executeDialogFile !== null}
        onOpenChange={(open) => !open && setExecuteDialogFile(null)}
        onSuccess={() => loadPrdFiles()}
      />
    </div>
  )
}

// Extracted PRD table row component to avoid duplication
interface PRDTableRowProps {
  prd: PRDDocument
  deleting: string | null
  onNavigate: (path: string) => void
  onDelete: (id: string) => void
  getQualityBadge: (prd: PRDDocument) => React.ReactNode
}

function PRDTableRow({ prd, deleting, onNavigate, onDelete, getQualityBadge }: PRDTableRowProps) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50">
      <TableCell onClick={() => onNavigate(`/prds/${prd.id}`)}>
        <div className="flex items-center gap-2">
          <span className="font-medium">{prd.title}</span>
          {prd.sourceChatSessionId && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <MessageSquare className="h-3 w-3" />
              From Chat
            </Badge>
          )}
        </div>
        {prd.templateId && (
          <div className="mt-1 text-xs text-muted-foreground">
            Template: {prd.templateId}
          </div>
        )}
      </TableCell>
      <TableCell onClick={() => onNavigate(`/prds/${prd.id}`)}>
        <div className="max-w-md truncate text-sm text-muted-foreground">
          {prd.description || 'No description'}
        </div>
      </TableCell>
      <TableCell onClick={() => onNavigate(`/prds/${prd.id}`)}>
        {getQualityBadge(prd)}
      </TableCell>
      <TableCell onClick={() => onNavigate(`/prds/${prd.id}`)}>
        <div className="text-sm">{formatBackendDateOnly(prd.updatedAt)}</div>
        <div className="text-xs text-muted-foreground">
          {formatBackendTime(prd.updatedAt)}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onNavigate(`/prds/${prd.id}`)}>
            <Edit className="h-4 w-4" />
          </Button>
          {/* Note: Execute button removed - database PRD execution is deprecated */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(prd.id)}
            disabled={deleting === prd.id}
          >
            {deleting === prd.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Table row for file-based PRDs (from .ralph-ui/prds/ directory)
interface PRDFileTableRowProps {
  file: PRDFile
  onExecute: (file: PRDFile) => void
  onEdit: (file: PRDFile) => void
}

function PRDFileTableRow({ file, onExecute, onEdit }: PRDFileTableRowProps) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50">
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{file.title}</span>
          <Badge variant="outline" className="gap-1 text-xs">
            <FileCode className="h-3 w-3" />
            From File
          </Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground font-mono">
          {file.filePath}
        </div>
      </TableCell>
      <TableCell>
        <div className="max-w-md truncate text-sm text-muted-foreground">
          {/* Show first line of content as description */}
          {file.content.split('\n').find((line) => line.trim() && !line.startsWith('#'))?.trim().slice(0, 100) || 'No description'}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {file.hasRalphJson ? (
            <Badge variant="default" className="gap-1 text-xs w-fit">
              <CheckCircle className="h-3 w-3" />
              Ralph Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs w-fit">
              <FileText className="h-3 w-3" />
              Not Initialized
            </Badge>
          )}
          {file.hasProgress && (
            <Badge variant="secondary" className="gap-1 text-xs w-fit">
              In Progress
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">{formatBackendDateOnly(file.modifiedAt)}</div>
        <div className="text-xs text-muted-foreground">
          {formatBackendTime(file.modifiedAt)}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(file)}
            title="Edit PRD file"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onExecute(file)}
            title="Execute with Ralph Loop"
          >
            <Play className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
