// Session Recovery Banner component for detecting and recovering stale sessions
// Shows when crashed sessions are detected and provides recovery options

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { recoveryApi } from '@/lib/config-api'
import type { StaleLockInfo, RecoveryResult } from '@/types'
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

interface SessionRecoveryBannerProps {
  projectPath: string
  onRecoveryComplete?: (results: RecoveryResult[]) => void
  autoCheckInterval?: number // in milliseconds, 0 to disable
}

export function SessionRecoveryBanner({
  projectPath,
  onRecoveryComplete,
  autoCheckInterval = 0,
}: SessionRecoveryBannerProps) {
  const [staleSessions, setStaleSessions] = useState<StaleLockInfo[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveringSessionId, setRecoveringSessionId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [recoveryResults, setRecoveryResults] = useState<RecoveryResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const checkStaleSessions = useCallback(async () => {
    if (!projectPath) return

    setIsChecking(true)
    setError(null)
    try {
      const sessions = await recoveryApi.checkStaleSessions(projectPath)
      setStaleSessions(sessions)
      if (sessions.length > 0 && !dismissed) {
        setShowModal(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsChecking(false)
    }
  }, [projectPath, dismissed])

  // Initial check on mount
  useEffect(() => {
    checkStaleSessions()
  }, [checkStaleSessions])

  // Optional periodic checking
  useEffect(() => {
    if (autoCheckInterval > 0) {
      const interval = setInterval(checkStaleSessions, autoCheckInterval)
      return () => clearInterval(interval)
    }
  }, [autoCheckInterval, checkStaleSessions])

  const handleRecoverSession = async (sessionId: string) => {
    setRecoveringSessionId(sessionId)
    setError(null)
    try {
      const result = await recoveryApi.recoverSession(projectPath, sessionId)
      setRecoveryResults((prev) => [...prev, result])
      setStaleSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
      if (staleSessions.length === 1) {
        onRecoveryComplete?.([result])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecoveringSessionId(null)
    }
  }

  const handleRecoverAll = async () => {
    setIsRecovering(true)
    setError(null)
    try {
      const results = await recoveryApi.recoverAll(projectPath)
      setRecoveryResults(results)
      setStaleSessions([])
      onRecoveryComplete?.(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRecovering(false)
    }
  }

  const handleDismiss = () => {
    setShowModal(false)
    setDismissed(true)
  }

  const handleClose = () => {
    setShowModal(false)
    setRecoveryResults([])
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return timestamp
    }
  }

  // Don't show banner if no stale sessions or dismissed (unless checking)
  if (staleSessions.length === 0 && recoveryResults.length === 0 && !error && !isChecking) {
    return null
  }

  // Show checking state
  if (isChecking && staleSessions.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
          <p className="text-blue-800">Checking for stale sessions...</p>
        </div>
      </div>
    )
  }

  // Compact banner for showing recovery needed
  if (!showModal && staleSessions.length > 0 && !dismissed) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">
                {staleSessions.length} stale session{staleSessions.length !== 1 ? 's' : ''} detected
              </p>
              <p className="text-sm text-yellow-700">
                These sessions may have crashed. Recovery is recommended.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
              View Details
            </Button>
            <Button size="sm" onClick={handleRecoverAll} disabled={isRecovering || isChecking}>
              {isRecovering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recovering...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recover All
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Session Recovery Required
          </DialogTitle>
          <DialogDescription>
            The following sessions appear to have crashed or were not properly closed.
            You can recover them to unassign any tasks that were in progress.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {staleSessions.length > 0 && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>PID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleSessions.map((session) => (
                  <TableRow key={session.sessionId}>
                    <TableCell className="font-mono text-sm">
                      {session.sessionId.slice(0, 12)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{session.pid}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(session.timestamp)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRecoverSession(session.sessionId)}
                        disabled={recoveringSessionId === session.sessionId}
                      >
                        {recoveringSessionId === session.sessionId ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Recovering...
                          </>
                        ) : (
                          'Recover'
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {recoveryResults.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Recovery Results</h4>
            {recoveryResults.map((result, index) => (
              <Card key={index} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="font-mono text-sm">{result.sessionId.slice(0, 12)}...</p>
                      <p className="text-sm text-muted-foreground">{result.message}</p>
                    </div>
                  </div>
                  <Badge variant={result.success ? 'success' : 'destructive'}>
                    {result.tasksUnassigned} task{result.tasksUnassigned !== 1 ? 's' : ''} unassigned
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          {staleSessions.length > 0 ? (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                Dismiss
              </Button>
              <Button onClick={handleRecoverAll} disabled={isRecovering}>
                {isRecovering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Recovering All...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Recover All ({staleSessions.length})
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Standalone modal component for showing on app startup
interface SessionRecoveryModalProps {
  projectPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecoveryComplete?: (results: RecoveryResult[]) => void
}

export function SessionRecoveryModal({
  projectPath,
  open,
  onOpenChange,
  onRecoveryComplete,
}: SessionRecoveryModalProps) {
  const [staleSessions, setStaleSessions] = useState<StaleLockInfo[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveringSessionId, setRecoveringSessionId] = useState<string | null>(null)
  const [recoveryResults, setRecoveryResults] = useState<RecoveryResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && projectPath) {
      checkStaleSessions()
    }
  }, [open, projectPath])

  const checkStaleSessions = async () => {
    setIsChecking(true)
    setError(null)
    try {
      const sessions = await recoveryApi.checkStaleSessions(projectPath)
      setStaleSessions(sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsChecking(false)
    }
  }

  const handleRecoverSession = async (sessionId: string) => {
    setRecoveringSessionId(sessionId)
    setError(null)
    try {
      const result = await recoveryApi.recoverSession(projectPath, sessionId)
      setRecoveryResults((prev) => [...prev, result])
      setStaleSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecoveringSessionId(null)
    }
  }

  const handleRecoverAll = async () => {
    setIsRecovering(true)
    setError(null)
    try {
      const results = await recoveryApi.recoverAll(projectPath)
      setRecoveryResults(results)
      setStaleSessions([])
      onRecoveryComplete?.(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRecovering(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setRecoveryResults([])
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return timestamp
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Session Recovery
          </DialogTitle>
          <DialogDescription>
            Check for and recover crashed sessions to unassign any tasks that were in progress.
          </DialogDescription>
        </DialogHeader>

        {isChecking && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Checking for stale sessions...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!isChecking && staleSessions.length === 0 && recoveryResults.length === 0 && !error && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No Stale Sessions</h3>
            <p className="text-muted-foreground">All sessions are healthy.</p>
          </div>
        )}

        {staleSessions.length > 0 && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>PID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleSessions.map((session) => (
                  <TableRow key={session.sessionId}>
                    <TableCell className="font-mono text-sm">
                      {session.sessionId.slice(0, 12)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{session.pid}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(session.timestamp)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRecoverSession(session.sessionId)}
                        disabled={recoveringSessionId === session.sessionId}
                      >
                        {recoveringSessionId === session.sessionId ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Recovering...
                          </>
                        ) : (
                          'Recover'
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {recoveryResults.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Recovery Results</h4>
            {recoveryResults.map((result, index) => (
              <Card key={index} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="font-mono text-sm">{result.sessionId.slice(0, 12)}...</p>
                      <p className="text-sm text-muted-foreground">{result.message}</p>
                    </div>
                  </div>
                  <Badge variant={result.success ? 'success' : 'destructive'}>
                    {result.tasksUnassigned} task{result.tasksUnassigned !== 1 ? 's' : ''} unassigned
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => checkStaleSessions()} disabled={isChecking}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {staleSessions.length > 0 ? (
            <Button onClick={handleRecoverAll} disabled={isRecovering}>
              {isRecovering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recovering All...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recover All ({staleSessions.length})
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Dashboard section component for embedding
export function SessionRecoverySection({ projectPath }: { projectPath: string }) {
  const [staleSessions, setStaleSessions] = useState<StaleLockInfo[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryResults, setRecoveryResults] = useState<RecoveryResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const checkStaleSessions = async () => {
    if (!projectPath) return

    setIsChecking(true)
    setError(null)
    try {
      const sessions = await recoveryApi.checkStaleSessions(projectPath)
      setStaleSessions(sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkStaleSessions()
  }, [projectPath])

  const handleRecoverAll = async () => {
    setIsRecovering(true)
    setError(null)
    try {
      const results = await recoveryApi.recoverAll(projectPath)
      setRecoveryResults(results)
      setStaleSessions([])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRecovering(false)
    }
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return timestamp
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Session Recovery
          </CardTitle>
          <CardDescription>
            {staleSessions.length > 0
              ? `${staleSessions.length} stale session${staleSessions.length !== 1 ? 's' : ''} found`
              : 'No stale sessions detected'}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={checkStaleSessions} disabled={isChecking}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
          Check
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {staleSessions.length === 0 && recoveryResults.length === 0 ? (
          <div className="text-center py-4">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All sessions are healthy</p>
          </div>
        ) : (
          <div className="space-y-4">
            {staleSessions.length > 0 && (
              <>
                <div className="space-y-2">
                  {staleSessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-mono text-sm">{session.sessionId.slice(0, 16)}...</p>
                        <p className="text-xs text-muted-foreground">
                          PID: {session.pid} | {formatTimestamp(session.timestamp)}
                        </p>
                      </div>
                      <Badge variant="warning">Stale</Badge>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  onClick={handleRecoverAll}
                  disabled={isRecovering}
                >
                  {isRecovering ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Recovering...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Recover All Sessions
                    </>
                  )}
                </Button>
              </>
            )}

            {recoveryResults.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Recovery Results</h4>
                {recoveryResults.map((result, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-mono">{result.sessionId.slice(0, 12)}...</span>
                    </div>
                    <span className="text-muted-foreground">
                      {result.tasksUnassigned} task{result.tasksUnassigned !== 1 ? 's' : ''} freed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
