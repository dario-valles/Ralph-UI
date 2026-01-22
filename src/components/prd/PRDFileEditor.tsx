import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Save,
  Loader2,
  Play,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  MessageSquare,
  BookOpen,
  Clock,
  Terminal,
} from 'lucide-react'
import { prdApi } from '@/lib/tauri-api'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
import { PRDStoriesTab } from './PRDStoriesTab'
import { PRDExecutionTab } from './PRDExecutionTab'
import { PRDHistoryTab } from './PRDHistoryTab'
import { toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import type { PRDFile } from '@/types'

// Reusable markdown renderer component (matches PRDEditor styling)
function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-6 mb-3 pb-2 border-b">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mt-5 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2 text-sm leading-relaxed">{children}</p>,
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
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/50 pl-4 my-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-6 border-border" />,
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

export function PRDFileEditor() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const projectPath = searchParams.get('project') || ''
  const prdName = searchParams.get('name') || ''

  const [prdFile, setPrdFile] = useState<PRDFile | null>(null)
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showExecutionDialog, setShowExecutionDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('content')

  useEffect(() => {
    async function loadFile() {
      if (!projectPath || !prdName) {
        setError('Missing project path or PRD name')
        setLoading(false)
        return
      }

      try {
        const file = await prdApi.getFile(projectPath, prdName)
        setPrdFile(file)
        setContent(file.content)
      } catch (err) {
        console.error('Failed to load PRD file:', err)
        setError(err instanceof Error ? err.message : 'Failed to load PRD file')
      } finally {
        setLoading(false)
      }
    }

    loadFile()
  }, [projectPath, prdName])

  const handleSave = async () => {
    if (!prdFile) return

    setSaving(true)
    try {
      const updated = await prdApi.updateFile(projectPath, prdName, content)
      setPrdFile(updated)
      toast.success('PRD saved', 'Your changes have been saved successfully.')
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save PRD file:', err)
      toast.error('Failed to save PRD', err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSaving(false)
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
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate('/prds')}>
          Back to PRDs
        </Button>
      </div>
    )
  }

  if (!prdFile) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">PRD file not found</p>
        <Button variant="outline" onClick={() => navigate('/prds')}>
          Back to PRDs
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold">{prdFile.title}</h1>
            <Badge variant="outline" className="gap-1">
              <FolderOpen className="h-3 w-3" />
              File PRD
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Last modified: {new Date(prdFile.modifiedAt).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {prdFile.filePath}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/prds')}>
            Cancel
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
          <Button
            variant="outline"
            onClick={() => navigate(`/prds/chat?prdId=${encodeURIComponent(prdFile.id)}&project=${encodeURIComponent(projectPath)}`)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Continue in Chat
          </Button>
          <Button onClick={() => setShowExecutionDialog(true)} className="gap-2">
            <Play className="h-4 w-4" />
            Execute PRD
          </Button>
        </div>
      </div>

      {/* Status Badges */}
      <div className="mb-6 flex gap-2">
        {prdFile.hasRalphJson && (
          <Badge variant="secondary">Ralph Loop Initialized</Badge>
        )}
        {prdFile.hasProgress && (
          <Badge variant="secondary">Has Progress</Badge>
        )}
      </div>

      {/* Tabs */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0">
            <TabsTrigger
              value="content"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <FileText className="mr-2 h-4 w-4" />
              Content
            </TabsTrigger>
            <TabsTrigger
              value="stories"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Stories
            </TabsTrigger>
            <TabsTrigger
              value="execution"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Terminal className="mr-2 h-4 w-4" />
              Execution
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Clock className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="p-0 mt-0">
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
          </TabsContent>

          <TabsContent value="stories" className="p-0 mt-0">
            <PRDStoriesTab projectPath={projectPath} prdName={prdName} />
          </TabsContent>

          <TabsContent value="execution" className="p-0 mt-0">
            <PRDExecutionTab projectPath={projectPath} prdName={prdName} />
          </TabsContent>

          <TabsContent value="history" className="p-0 mt-0">
            <PRDHistoryTab projectPath={projectPath} prdName={prdName} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Execution Dialog */}
      {showExecutionDialog && (
        <PRDFileExecutionDialog
          file={prdFile}
          open={showExecutionDialog}
          onOpenChange={setShowExecutionDialog}
        />
      )}
    </div>
  )
}
