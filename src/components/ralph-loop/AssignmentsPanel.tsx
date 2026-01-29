/**
 * AssignmentsPanel - Displays all current agent assignments for a PRD
 *
 * US-2.3: View Parallel Progress
 *
 * This panel shows:
 * - All current agent assignments
 * - Each assignment's agent ID, story, start time, estimated files
 * - Status updates when agents complete or fail
 * - Visual indicator for potential conflict zones
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  RefreshCw,
  Users,
  Clock,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  User,
  GripVertical,
  Trash2,
} from 'lucide-react'
import { ralphLoopApi } from '@/lib/backend-api'
import { subscribeEvent } from '@/lib/events-client'
import { toast } from '@/stores/toastStore'
import type {
  Assignment,
  AssignmentsFile,
  FileInUse,
  AssignmentStatus,
  AssignmentChangedPayload,
  FileConflictDetectedPayload,
  RalphStory,
} from '@/types'
import { FileConflictWarning } from './FileConflictWarning'
import { cn } from '@/lib/utils'

/** Format a relative time string (e.g., "5 minutes ago") */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

// Event names for WebSocket subscriptions (US-2.3: Real-time updates)
const EVENT_ASSIGNMENT_CHANGED = 'assignment:changed'
const EVENT_FILE_CONFLICT_DETECTED = 'assignment:file_conflict'

interface AssignmentsPanelProps {
  projectPath: string
  prdName: string
  /** List of available stories for manual assignment */
  stories?: RalphStory[]
  /** Whether to auto-refresh assignments */
  autoRefresh?: boolean
  /** Refresh interval in milliseconds (default: 5000) */
  refreshInterval?: number
  /** Class name for custom styling */
  className?: string
}

/** Get status badge variant based on assignment status */
function getStatusBadgeVariant(
  status: AssignmentStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'completed':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'released':
      return 'outline'
    default:
      return 'outline'
  }
}

/** Get status icon based on assignment status */
function StatusIcon({ status }: { status: AssignmentStatus }) {
  switch (status) {
    case 'active':
      return <Loader2 className="h-3 w-3 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="h-3 w-3" />
    case 'failed':
      return <XCircle className="h-3 w-3" />
    case 'released':
      return <Clock className="h-3 w-3" />
    default:
      return null
  }
}

/** Single assignment card */
function AssignmentCard({
  assignment,
  filesInUse,
  onRelease,
}: {
  assignment: Assignment
  filesInUse: FileInUse[]
  onRelease?: (storyId: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Find conflicting files (files also in use by other agents)
  const conflictingFiles = filesInUse.filter(
    (f) => f.agentId !== assignment.agentId && assignment.estimatedFiles.includes(f.path)
  )

  const hasConflicts = conflictingFiles.length > 0

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={cn(
          'rounded-lg border p-3',
          hasConflicts ? 'border-yellow-500/50 bg-yellow-500/5' : 'bg-card'
        )}
      >
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{assignment.agentType}</span>
              </div>
              <Badge variant={getStatusBadgeVariant(assignment.status)} className="text-xs">
                <StatusIcon status={assignment.status} />
                <span className="ml-1">{assignment.status}</span>
              </Badge>
              {hasConflicts && (
                <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500/50">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Conflicts
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(assignment.assignedAt)}
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>
          </div>
        </CollapsibleTrigger>

        <div className="mt-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Story:</span>
            <Badge variant="outline" className="font-mono text-xs">
              {assignment.storyId}
            </Badge>
          </div>
        </div>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Agent Details */}
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Agent ID:</span>
              <code className="font-mono bg-muted px-1 rounded">{assignment.agentId}</code>
            </div>
            {assignment.iterationStart !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Started at iteration:</span>
                <span>{assignment.iterationStart}</span>
              </div>
            )}
            {assignment.errorMessage && (
              <div className="flex items-start gap-2 text-destructive">
                <span className="text-muted-foreground">Error:</span>
                <span>{assignment.errorMessage}</span>
              </div>
            )}
          </div>

          {/* Release Button */}
          {onRelease && assignment.status === 'active' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onRelease(assignment.storyId)
              }}
              className="w-full text-xs h-7"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Release Assignment
            </Button>
          )}

          {/* Estimated Files */}
          {assignment.estimatedFiles.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileCode className="h-3 w-3" />
                <span>Estimated files ({assignment.estimatedFiles.length}):</span>
              </div>
              <div className="pl-5 space-y-0.5">
                {assignment.estimatedFiles.slice(0, 5).map((file) => {
                  const isConflict = conflictingFiles.some((f) => f.path === file)
                  return (
                    <code
                      key={file}
                      className={cn(
                        'text-xs font-mono block',
                        isConflict ? 'text-yellow-600' : 'text-muted-foreground'
                      )}
                    >
                      {isConflict && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                      {file}
                    </code>
                  )
                })}
                {assignment.estimatedFiles.length > 5 && (
                  <span className="text-xs text-muted-foreground">
                    ... and {assignment.estimatedFiles.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Conflict Warning */}
          {hasConflicts && (
            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-2">
              <div className="flex items-center gap-2 text-xs text-yellow-600">
                <AlertTriangle className="h-3 w-3" />
                <span>
                  {conflictingFiles.length} file{conflictingFiles.length > 1 ? 's' : ''} may
                  conflict with other agents
                </span>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function AssignmentsPanel({
  projectPath,
  prdName,
  stories = [],
  autoRefresh = true,
  refreshInterval = 5000,
  className = '',
}: AssignmentsPanelProps): React.JSX.Element {
  const [assignmentsFile, setAssignmentsFile] = useState<AssignmentsFile | null>(null)
  const [filesInUse, setFilesInUse] = useState<FileInUse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showManualAssign, setShowManualAssign] = useState(false)
  const [selectedAgentType, setSelectedAgentType] = useState<string>('claude')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedStoryId, setSelectedStoryId] = useState<string>('')
  const [isAssigning, setIsAssigning] = useState(false)

  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [assignments, files] = await Promise.all([
        ralphLoopApi.getAssignments(projectPath, prdName),
        ralphLoopApi.getFilesInUse(projectPath, prdName),
      ])
      setAssignmentsFile(assignments)
      setFilesInUse(files)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [projectPath, prdName])

  const handleManualAssign = useCallback(async () => {
    if (!selectedAgentId || !selectedStoryId) {
      toast.error('Please select both an agent and a story')
      return
    }

    try {
      setIsAssigning(true)
      await ralphLoopApi.manuallyAssignStory(
        projectPath,
        prdName,
        selectedAgentId,
        selectedAgentType,
        selectedStoryId,
        false
      )
      toast.success(`Story ${selectedStoryId} assigned to ${selectedAgentId}`)
      setShowManualAssign(false)
      setSelectedAgentId('')
      setSelectedStoryId('')
      await loadAssignments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign story')
    } finally {
      setIsAssigning(false)
    }
  }, [projectPath, prdName, selectedAgentId, selectedAgentType, selectedStoryId, loadAssignments])

  const handleReleaseAssignment = useCallback(
    async (storyId: string) => {
      if (!confirm(`Release story ${storyId} back to the pool?`)) {
        return
      }

      try {
        await ralphLoopApi.releaseStoryAssignment(projectPath, prdName, storyId)
        toast.success(`Story ${storyId} released back to the pool`)
        await loadAssignments()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to release story')
      }
    },
    [projectPath, prdName, loadAssignments]
  )

  // Get list of available stories for assignment (not currently assigned)
  const assignedStoryIds = useMemo(
    () => new Set((assignmentsFile?.assignments ?? []).map((a) => a.storyId)),
    [assignmentsFile?.assignments]
  )
  const availableStories = useMemo(
    () => stories.filter((s) => !assignedStoryIds.has(s.id)),
    [stories, assignedStoryIds]
  )

  // Initial load
  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  // Auto-refresh (fallback when WebSocket not available)
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadAssignments()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, loadAssignments])

  // WebSocket event subscription for real-time updates (US-2.3)
  useEffect(() => {
    let unlistenAssignment: (() => void) | null = null
    let unlistenConflict: (() => void) | null = null

    const setupEventListeners = async () => {
      // Subscribe to assignment changes
      unlistenAssignment = await subscribeEvent<AssignmentChangedPayload>(
        EVENT_ASSIGNMENT_CHANGED,
        (payload) => {
          // Only refresh if the event is for our PRD
          if (payload.prdName === prdName) {
            loadAssignments()
          }
        }
      )

      // Subscribe to file conflict detection
      unlistenConflict = await subscribeEvent<FileConflictDetectedPayload>(
        EVENT_FILE_CONFLICT_DETECTED,
        (payload) => {
          // Only refresh if the event is for our PRD
          if (payload.prdName === prdName) {
            loadAssignments()
          }
        }
      )
    }

    setupEventListeners().catch((err) => {
      console.warn('[AssignmentsPanel] Failed to subscribe to events:', err)
    })

    return () => {
      unlistenAssignment?.()
      unlistenConflict?.()
    }
  }, [prdName, loadAssignments])

  // Separate active and historical assignments
  const activeAssignments = assignmentsFile?.assignments.filter((a) => a.status === 'active') ?? []
  const historicalAssignments =
    assignmentsFile?.assignments.filter((a) => a.status !== 'active') ?? []

  // Find files with conflicts (used by multiple agents)
  const fileUsageCount = filesInUse.reduce(
    (acc, file) => {
      acc[file.path] = (acc[file.path] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const conflictFiles = filesInUse.filter((f) => fileUsageCount[f.path] > 1)

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Agent Assignments
            </CardTitle>
            <CardDescription className="text-xs">
              {activeAssignments.length} active, {historicalAssignments.length} historical
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {availableStories.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualAssign(!showManualAssign)}
                className="h-8"
              >
                <GripVertical className="h-3 w-3 mr-1" />
                Assign Story
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadAssignments}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <div className="text-sm text-destructive mb-3">{error}</div>}

        {/* Manual Assignment Section (US-4.3) */}
        {showManualAssign && availableStories.length > 0 && (
          <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 mb-4">
            <h4 className="text-sm font-medium mb-3">Manually Assign Story</h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Agent Type</label>
                <select
                  value={selectedAgentType}
                  onChange={(e) => setSelectedAgentType(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs"
                >
                  <option value="claude">Claude</option>
                  <option value="opencode">OpenCode</option>
                  <option value="cursor">Cursor</option>
                  <option value="codex">Codex</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Agent ID</label>
                <input
                  type="text"
                  placeholder="e.g., agent-001"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Story</label>
                <select
                  value={selectedStoryId}
                  onChange={(e) => setSelectedStoryId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs"
                >
                  <option value="">Select a story...</option>
                  {availableStories.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.id}: {story.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleManualAssign}
                  disabled={isAssigning || !selectedAgentId || !selectedStoryId}
                  className="flex-1 h-7 text-xs"
                >
                  {isAssigning ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <GripVertical className="h-3 w-3 mr-1" />
                  )}
                  Assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualAssign(false)}
                  className="flex-1 h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>

              {/* Conflict warning if selecting a story with potential conflicts */}
              {selectedStoryId && (
                <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-2">
                  <div className="flex items-start gap-2 text-xs text-yellow-600">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      Verify this assignment doesn't conflict with files in use by other agents
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* File Conflict Warning */}
        {conflictFiles.length > 0 && (
          <FileConflictWarning filesInUse={conflictFiles} className="mb-3" />
        )}

        {/* Active Assignments */}
        {activeAssignments.length > 0 && (
          <div className="space-y-2 mb-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Active ({activeAssignments.length})
            </h4>
            <div className="space-y-2">
              {activeAssignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  filesInUse={filesInUse}
                  onRelease={handleReleaseAssignment}
                />
              ))}
            </div>
          </div>
        )}

        {/* Historical Assignments */}
        {historicalAssignments.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start h-8">
                <ChevronDown className="h-4 w-4 mr-2" />
                Historical ({historicalAssignments.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[200px] mt-2">
                <div className="space-y-2 pr-4">
                  {historicalAssignments.map((assignment) => (
                    <AssignmentCard key={assignment.id} assignment={assignment} filesInUse={[]} />
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty State */}
        {!loading && activeAssignments.length === 0 && historicalAssignments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">No assignments yet</p>
            <p className="text-xs text-muted-foreground">
              Assignments will appear when agents start working
            </p>
          </div>
        )}

        {/* Metadata */}
        {assignmentsFile && (
          <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Current iteration: {assignmentsFile.currentIteration}</span>
              <span>Last updated: {formatRelativeTime(assignmentsFile.lastUpdated)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
