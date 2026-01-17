import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
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
  FolderOpen,
  Play,
  Pause,
  Trash2,
  Download,
  Copy,
  MoreHorizontal,
  FileText,
} from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { sessionApi } from '@/lib/tauri-api'
import type { SessionStatus, SessionTemplate, SessionAnalytics } from '@/types'

export function SessionsPage() {
  const {
    sessions,
    loading,
    error,
    fetchSessions,
    createSession,
    deleteSession,
    updateSessionStatus,
    setCurrentSession,
  } = useSessionStore()

  const [templates, setTemplates] = useState<SessionTemplate[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isTemplateOpen, setIsTemplateOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [newSessionPath, setNewSessionPath] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [selectedSessionForTemplate, setSelectedSessionForTemplate] = useState<string>('')
  const [analytics, setAnalytics] = useState<Record<string, SessionAnalytics>>({})

  // Fetch sessions and templates on mount
  useEffect(() => {
    fetchSessions()
    loadTemplates()
  }, [fetchSessions])

  const loadTemplates = async () => {
    try {
      const loadedTemplates = await sessionApi.getTemplates()
      setTemplates(loadedTemplates)
    } catch {
      console.error('Failed to load templates')
    }
  }

  const handleCreateSession = async () => {
    if (!newSessionName || !newSessionPath) return

    try {
      if (selectedTemplateId) {
        await sessionApi.createFromTemplate(selectedTemplateId, newSessionName, newSessionPath)
        await fetchSessions()
      } else {
        await createSession(newSessionName, newSessionPath)
      }
      setIsCreateOpen(false)
      setNewSessionName('')
      setNewSessionPath('')
      setSelectedTemplateId('')
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  const handleCreateTemplate = async () => {
    if (!selectedSessionForTemplate || !templateName) return

    try {
      await sessionApi.createTemplate(
        selectedSessionForTemplate,
        templateName,
        templateDescription
      )
      await loadTemplates()
      setIsTemplateOpen(false)
      setTemplateName('')
      setTemplateDescription('')
      setSelectedSessionForTemplate('')
    } catch (err) {
      console.error('Failed to create template:', err)
    }
  }

  const handleExportSession = async (sessionId: string) => {
    try {
      const json = await sessionApi.exportJson(sessionId)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${sessionId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export session:', err)
    }
  }

  const handleLoadAnalytics = async (sessionId: string) => {
    try {
      const data = await sessionApi.getAnalytics(sessionId)
      setAnalytics((prev) => ({ ...prev, [sessionId]: data }))
    } catch (err) {
      console.error('Failed to load analytics:', err)
    }
  }

  const getStatusBadgeVariant = (
    status: SessionStatus
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'active':
        return 'default'
      case 'paused':
        return 'secondary'
      case 'completed':
        return 'outline'
      case 'failed':
        return 'destructive'
      default:
        return 'default'
    }
  }

  const handleStatusChange = async (sessionId: string, newStatus: SessionStatus) => {
    await updateSessionStatus(sessionId, newStatus)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
          <p className="text-muted-foreground">Manage your work sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsTemplateOpen(true)}>
            <Copy className="mr-2 h-4 w-4" />
            Create Template
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Session Template</DialogTitle>
            <DialogDescription>
              Save a session as a reusable template for future projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sourceSession">Source Session</Label>
              <Select
                id="sourceSession"
                value={selectedSessionForTemplate}
                onChange={(e) => setSelectedSessionForTemplate(e.target.value)}
              >
                <option value="">Select a session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="My Template"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateDesc">Description</Label>
              <Input
                id="templateDesc"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Template for..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate}>Create Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Session Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Start a new work session for your project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sessionName">Session Name</Label>
              <Input
                id="sessionName"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Feature Development"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectPath">Project Path</Label>
              <div className="flex gap-2">
                <Input
                  id="projectPath"
                  value={newSessionPath}
                  onChange={(e) => setNewSessionPath(e.target.value)}
                  placeholder="/path/to/project"
                  className="flex-1"
                />
                <Button variant="outline" size="icon">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="template">Template (Optional)</Label>
                <Select
                  id="template"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">No template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSession}>Create Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Templates Section */}
      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Session Templates</CardTitle>
            <CardDescription>Reusable configurations for quick session setup</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  variant="outline"
                  className="h-auto py-2"
                  onClick={() => {
                    setSelectedTemplateId(template.id)
                    setIsCreateOpen(true)
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">{template.name}</div>
                    {template.description && (
                      <div className="text-xs text-muted-foreground">
                        {template.description}
                      </div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
          <CardDescription>
            {sessions.length === 0
              ? 'No sessions yet'
              : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground">Loading sessions...</p>}
          {!loading && sessions.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No sessions created yet. Create your first session to get started.
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Session
              </Button>
            </div>
          )}
          {!loading && sessions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {session.projectPath}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(session.status)}>
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{session.tasks?.length || 0}</TableCell>
                    <TableCell>${session.totalCost?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>
                      {new Date(session.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {session.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusChange(session.id, 'paused')}
                            title="Pause session"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : session.status === 'paused' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusChange(session.id, 'active')}
                            title="Resume session"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExportSession(session.id)}
                          title="Export session"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedSessionForTemplate(session.id)
                            setIsTemplateOpen(true)
                          }}
                          title="Save as template"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            handleLoadAnalytics(session.id)
                            setCurrentSession(session)
                          }}
                          title="Set as current"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteSession(session.id)}
                          title="Delete session"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Analytics Preview */}
      {Object.keys(analytics).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Session Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Object.entries(analytics).map(([sessionId, data]) => (
                <Card key={sessionId}>
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium">Session {sessionId.slice(0, 8)}...</div>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div>Tasks: {data.completedTasks}/{data.totalTasks}</div>
                      <div>Completion: {(data.completionRate * 100).toFixed(1)}%</div>
                      <div>Avg Cost: ${data.averageCostPerTask.toFixed(4)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
