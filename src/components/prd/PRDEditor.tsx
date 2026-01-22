import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Save,
  Loader2,
  BarChart3,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Edit3,
  Eye,
} from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { QualityScoreCard } from './QualityScoreCard'
import { toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import type { PRDDocument, QualityAssessment } from '@/types'

// NOTE: PRD content is always markdown format

// Helper function to convert PRD quality scores to QualityAssessment format
function convertPRDToAssessment(prd: PRDDocument): QualityAssessment | null {
  if (prd.qualityScoreOverall === undefined || prd.qualityScoreOverall === null) {
    return null
  }
  return {
    completeness: prd.qualityScoreCompleteness || 0,
    clarity: prd.qualityScoreClarity || 0,
    actionability: prd.qualityScoreActionability || 0,
    overall: prd.qualityScoreOverall || 0,
    missingSections: [],
    suggestions: [],
    readyForExport: (prd.qualityScoreOverall || 0) >= 60,
  }
}

// Reusable markdown renderer component (matches PRDPlanSidebar styling)
function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style code blocks
          pre: ({ children }) => (
            <pre className="bg-secondary/50 rounded-md p-3 overflow-x-auto text-xs">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className
            return isInline ? (
              <code className="bg-secondary/50 px-1 py-0.5 rounded text-xs">
                {children}
              </code>
            ) : (
              <code className={className}>{children}</code>
            )
          },
          // Style lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
          ),
          // Style headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-6 mb-3 pb-2 border-b">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mt-5 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-1.5">{children}</h3>
          ),
          // Style paragraphs
          p: ({ children }) => <p className="my-2 text-sm leading-relaxed">{children}</p>,
          // Style tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-md border border-border">
              <table className="min-w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/70">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground/80 whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-muted-foreground">{children}</td>
          ),
          // Style blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/50 pl-4 my-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          // Style horizontal rules
          hr: () => <hr className="my-6 border-border" />,
          // Style strong/bold
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function PRDEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentPRD, loading, error, setCurrentPRD, updatePRD, analyzeQuality } = usePRDStore()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    if (id) {
      setCurrentPRD(id)
    }
  }, [id, setCurrentPRD])

  useEffect(() => {
    if (currentPRD) {
      setTitle(currentPRD.title)
      setDescription(currentPRD.description || '')
      setContent(currentPRD.content)
    }
  }, [currentPRD])

  const handleSave = async () => {
    if (!currentPRD) return

    setSaving(true)
    try {
      // Always save as markdown format now
      await updatePRD({
        id: currentPRD.id,
        title,
        description,
        content,
      })
      toast.success('PRD saved', 'Your changes have been saved successfully.')
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save PRD:', err)
      toast.error('Failed to save PRD', err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  const handleAnalyzeQuality = async () => {
    if (!currentPRD) return

    setAnalyzing(true)
    try {
      await analyzeQuality(currentPRD.id)
      toast.success('Quality analysis complete', 'Your PRD has been analyzed.')
    } catch (err) {
      console.error('Failed to analyze quality:', err)
      toast.error('Failed to analyze quality', err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setAnalyzing(false)
    }
  }

  const getQualityBadge = (score?: number) => {
    if (!score) return null

    if (score >= 85) {
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Excellent ({score}%)
        </Badge>
      )
    } else if (score >= 70) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Good ({score}%)
        </Badge>
      )
    } else {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Needs Work ({score}%)
        </Badge>
      )
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (!currentPRD) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-muted-foreground">PRD not found</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Edit PRD</h1>
            {currentPRD.qualityScoreOverall && getQualityBadge(currentPRD.qualityScoreOverall)}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {new Date(currentPRD.updatedAt).toLocaleString()} • Version{' '}
            {currentPRD.version}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/prds')}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/prds/chat?prdId=${currentPRD.id}`)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Continue in Chat
          </Button>
          <Button variant="outline" onClick={handleAnalyzeQuality} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Analyze Quality
              </>
            )}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quality Scores */}
      {currentPRD.qualityScoreOverall && (
        <div className="mb-6">
          <QualityScoreCard
            assessment={convertPRDToAssessment(currentPRD)}
            loading={analyzing}
            onRefresh={handleAnalyzeQuality}
          />
        </div>
      )}

      {/* Basic Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome Product"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of what this PRD covers..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* PRD Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">PRD Content</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {content.length} characters
              </Badge>
              <Button
                variant={isEditing ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </>
                ) : (
                  <>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your PRD content in markdown..."
              rows={25}
              className="font-mono text-sm min-h-[500px]"
            />
          ) : content.trim() ? (
            <div className="border rounded-md p-4 bg-background min-h-[200px]">
              <MarkdownContent content={content} />
            </div>
          ) : (
            <div className="border rounded-md p-8 bg-muted/30 text-center">
              <p className="text-muted-foreground">No content yet. Click "Edit" to start writing your PRD.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
