/**
 * ExecutionPreviewDialog - Shows execution order preview before starting Ralph Loop
 *
 * Displays:
 * - Execution waves (stories that can run in parallel)
 * - Cycle detection warning if dependencies form a cycle
 * - Blocked/Ready story counts
 */
import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Play, Layers, CheckCircle, Lock } from 'lucide-react'
import type { RalphStory } from '@/types'

export interface ExecutionPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stories: RalphStory[]
  onConfirm: () => void
  loading?: boolean
}

interface ExecutionWave {
  waveNumber: number
  storyIds: string[]
  stories: RalphStory[]
}

/**
 * Compute execution waves using topological sort
 * Returns null if a cycle is detected
 */
function computeExecutionWaves(stories: RalphStory[]): {
  waves: ExecutionWave[]
  cycle: string[] | null
} {
  const storyMap = new Map(stories.map(s => [s.id, s]))
  const incomplete = stories.filter(s => !s.passes)

  if (incomplete.length === 0) {
    return { waves: [], cycle: null }
  }

  // Build dependency graph for incomplete stories
  const inDegree: Record<string, number> = {}
  const adjList: Record<string, string[]> = {}

  for (const story of incomplete) {
    inDegree[story.id] = 0
    adjList[story.id] = []
  }

  // Build in-degree and adjacency list
  for (const story of incomplete) {
    if (story.dependencies) {
      for (const depId of story.dependencies) {
        const depStory = storyMap.get(depId)
        // Only count dependencies on incomplete stories
        if (depStory && !depStory.passes && inDegree[depId] !== undefined) {
          adjList[depId].push(story.id)
          inDegree[story.id]++
        }
      }
    }
  }

  // Compute waves using Kahn's algorithm
  const waves: ExecutionWave[] = []
  const visited = new Set<string>()
  let waveNumber = 1

  // First wave: all stories with no incomplete dependencies
  let currentWave = incomplete.filter(s => inDegree[s.id] === 0).map(s => s.id)

  while (currentWave.length > 0) {
    waves.push({
      waveNumber,
      storyIds: currentWave,
      stories: currentWave.map(id => storyMap.get(id)!),
    })

    const nextWave: string[] = []
    for (const id of currentWave) {
      visited.add(id)
      for (const neighbor of adjList[id] || []) {
        inDegree[neighbor]--
        if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
          nextWave.push(neighbor)
        }
      }
    }

    currentWave = nextWave
    waveNumber++
  }

  // Check for cycle (unvisited nodes)
  const unvisited = incomplete.filter(s => !visited.has(s.id))
  if (unvisited.length > 0) {
    // Find cycle path
    const cyclePath = findCycle(incomplete, storyMap)
    return { waves, cycle: cyclePath }
  }

  return { waves, cycle: null }
}

/**
 * Find a cycle in the dependency graph using DFS
 */
function findCycle(stories: RalphStory[], storyMap: Map<string, RalphStory>): string[] {
  const visited = new Set<string>()
  const recStack = new Set<string>()
  const cyclePath: string[] = []

  function dfs(id: string, path: string[]): boolean {
    visited.add(id)
    recStack.add(id)
    path.push(id)

    const story = storyMap.get(id)
    if (story?.dependencies) {
      for (const depId of story.dependencies) {
        const depStory = storyMap.get(depId)
        if (!depStory || depStory.passes) continue

        if (!visited.has(depId)) {
          if (dfs(depId, path)) return true
        } else if (recStack.has(depId)) {
          const cycleStart = path.indexOf(depId)
          cyclePath.push(...path.slice(cycleStart), depId)
          return true
        }
      }
    }

    path.pop()
    recStack.delete(id)
    return false
  }

  for (const story of stories) {
    if (!story.passes && !visited.has(story.id)) {
      if (dfs(story.id, [])) break
    }
  }

  return cyclePath
}

export function ExecutionPreviewDialog({
  open,
  onOpenChange,
  stories,
  onConfirm,
  loading = false,
}: ExecutionPreviewDialogProps) {
  const { waves, cycle } = useMemo(() => computeExecutionWaves(stories), [stories])

  const stats = useMemo(() => {
    const incomplete = stories.filter(s => !s.passes)
    const blocked = incomplete.filter(s => {
      if (!s.dependencies?.length) return false
      return s.dependencies.some(depId => {
        const dep = stories.find(d => d.id === depId)
        return dep && !dep.passes
      })
    })
    const ready = incomplete.filter(s => {
      if (!s.dependencies?.length) return true
      return s.dependencies.every(depId => {
        const dep = stories.find(d => d.id === depId)
        return dep?.passes
      })
    })

    return {
      total: stories.length,
      complete: stories.filter(s => s.passes).length,
      incomplete: incomplete.length,
      blocked: blocked.length,
      ready: ready.length,
    }
  }, [stories])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Execution Preview
          </DialogTitle>
          <DialogDescription>
            {stats.incomplete} stories remaining ({stats.ready} ready, {stats.blocked} blocked)
          </DialogDescription>
        </DialogHeader>

        {/* Cycle Warning */}
        {cycle && cycle.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Dependency cycle detected</p>
              <p className="text-xs mt-1 font-mono">{cycle.join(' → ')}</p>
              <p className="text-xs mt-1 text-red-500 dark:text-red-400">
                Stories in the cycle cannot be automatically scheduled.
              </p>
            </div>
          </div>
        )}

        {/* Stats Summary */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            {stats.complete} complete
          </Badge>
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            {stats.ready} ready
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3 text-red-500" />
            {stats.blocked} blocked
          </Badge>
        </div>

        {/* Execution Waves */}
        <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
          <div className="space-y-3 pr-4">
            {waves.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {stats.complete === stats.total ? (
                  <p>All stories are complete!</p>
                ) : (
                  <p>No executable stories found.</p>
                )}
              </div>
            ) : (
              waves.map((wave) => (
                <div key={wave.waveNumber} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Wave {wave.waveNumber}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {wave.storyIds.length === 1
                        ? '1 story'
                        : `${wave.storyIds.length} stories (parallel)`}
                    </span>
                  </div>
                  <div className="pl-4 space-y-1">
                    {wave.stories.map((story) => (
                      <div
                        key={story.id}
                        className="flex items-center gap-2 text-sm p-2 rounded border bg-muted/30"
                      >
                        <span className="font-mono text-xs text-muted-foreground flex-shrink-0">
                          {story.id}
                        </span>
                        <span className="truncate flex-1">{story.title}</span>
                        <Badge variant="outline" className="text-[10px] flex-shrink-0">
                          P{story.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
            disabled={loading || stats.incomplete === 0}
          >
            <Play className="h-4 w-4 mr-2" />
            Start Loop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
