import { useEffect, useState, useMemo } from 'react'
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
} from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { useProjectStore } from '@/stores/projectStore'
import { toast } from '@/stores/toastStore'
import type { PRDDocument } from '@/types'

export function PRDList() {
  const navigate = useNavigate()
  const { prds, loading, error, loadPRDs, deletePRD } = usePRDStore()
  const { getActiveProject } = useProjectStore()
  const activeProject = getActiveProject()

  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterByProject, setFilterByProject] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPRDs()
  }, [loadPRDs])

  // Filter by search query
  const searchFilteredPRDs = prds.filter(
    (prd) =>
      prd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prd.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Filter by active project
  const filteredPRDs = useMemo(() => {
    if (filterByProject && activeProject) {
      return searchFilteredPRDs.filter((prd) => prd.projectPath === activeProject.path)
    }
    return searchFilteredPRDs
  }, [searchFilteredPRDs, filterByProject, activeProject])

  // Group PRDs by project path
  const groupedPRDs = useMemo(() => {
    const groups: Record<string, PRDDocument[]> = {}
    filteredPRDs.forEach((prd) => {
      const key = prd.projectPath || 'No Project'
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(prd)
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
            <Button
              variant={filterByProject ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterByProject(!filterByProject)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {filterByProject ? 'Active Project' : 'All Projects'}
            </Button>
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
                      {projectPRDs.map((prd) => (
                        <PRDTableRow
                          key={prd.id}
                          prd={prd}
                          deleting={deleting}
                          onNavigate={navigate}
                          onDelete={handleDelete}
                          getQualityBadge={getQualityBadge}
                        />
                      ))}
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
              {filteredPRDs.map((prd) => (
                <PRDTableRow
                  key={prd.id}
                  prd={prd}
                  deleting={deleting}
                  onNavigate={navigate}
                  onDelete={handleDelete}
                  getQualityBadge={getQualityBadge}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
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
        <div className="text-sm">{new Date(prd.updatedAt).toLocaleDateString()}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(prd.updatedAt).toLocaleTimeString()}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onNavigate(`/prds/${prd.id}`)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate(`/prds/${prd.id}?execute=true`)}
          >
            <Play className="h-4 w-4" />
          </Button>
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
