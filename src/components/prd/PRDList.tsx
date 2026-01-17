import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { toast } from '@/stores/toastStore'
import type { PRDDocument } from '@/types'

export function PRDList() {
  const navigate = useNavigate()
  const { prds, loading, error, loadPRDs, deletePRD } = usePRDStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadPRDs()
  }, [loadPRDs])

  const filteredPRDs = prds.filter(
    (prd) =>
      prd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prd.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
            Manage and execute your PRDs with AI agents
          </p>
        </div>
        <Button onClick={() => navigate('/prds/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Create PRD
        </Button>
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
              {searchQuery ? 'No PRDs found' : 'No PRDs yet'}
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
      ) : (
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
                <TableRow key={prd.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell onClick={() => navigate(`/prds/${prd.id}`)}>
                    <div className="font-medium">{prd.title}</div>
                    {prd.templateId && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Template: {prd.templateId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell onClick={() => navigate(`/prds/${prd.id}`)}>
                    <div className="max-w-md truncate text-sm text-muted-foreground">
                      {prd.description || 'No description'}
                    </div>
                  </TableCell>
                  <TableCell onClick={() => navigate(`/prds/${prd.id}`)}>
                    {getQualityBadge(prd)}
                  </TableCell>
                  <TableCell onClick={() => navigate(`/prds/${prd.id}`)}>
                    <div className="text-sm">
                      {new Date(prd.updatedAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(prd.updatedAt).toLocaleTimeString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/prds/${prd.id}`)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/prds/${prd.id}?execute=true`)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(prd.id)}
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
