// Conflict resolution UI for merge conflicts

import { useState } from 'react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type {
  MergeConflict,
  ConflictResolutionStrategy,
} from '../../lib/parallel-api'
import {
  getConflictTypeColor,
  getConflictTypeLabel,
  getResolutionStrategyLabel,
} from '../../lib/parallel-api'

interface ConflictResolutionProps {
  conflicts: MergeConflict[]
  onResolve?: (conflict: MergeConflict, strategy: ConflictResolutionStrategy) => void
  onResolveAll?: () => void
}

export function ConflictResolution({
  conflicts,
  onResolve,
  onResolveAll,
}: ConflictResolutionProps) {
  const [selectedConflict, setSelectedConflict] = useState<MergeConflict | null>(
    null
  )

  if (conflicts.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <div className="text-green-500 text-4xl mb-2">✓</div>
          <h3 className="text-lg font-semibold mb-2">No Conflicts Detected</h3>
          <p className="text-muted-foreground">
            All branches can be merged safely
          </p>
        </div>
      </Card>
    )
  }

  const autoResolvableCount = conflicts.filter((c) => c.autoResolvable).length
  const manualCount = conflicts.length - autoResolvableCount

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {conflicts.length} Conflict{conflicts.length !== 1 ? 's' : ''}{' '}
              Detected
            </h3>
            <p className="text-sm text-muted-foreground">
              {autoResolvableCount} auto-resolvable, {manualCount} require manual
              resolution
            </p>
          </div>
          {autoResolvableCount > 0 && onResolveAll && (
            <Button onClick={onResolveAll}>Resolve All Auto</Button>
          )}
        </div>
      </Card>

      {/* Conflict List */}
      <div className="grid grid-cols-1 gap-4">
        {conflicts.map((conflict, index) => (
          <Card
            key={index}
            className={`p-4 cursor-pointer transition-all ${
              selectedConflict === conflict
                ? 'ring-2 ring-blue-500'
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedConflict(conflict)}
          >
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      className={`bg-${getConflictTypeColor(
                        conflict.conflictType
                      )}-500 text-white`}
                    >
                      {getConflictTypeLabel(conflict.conflictType)}
                    </Badge>
                    {conflict.autoResolvable && (
                      <Badge className="bg-green-500 text-white">
                        Auto-Resolvable
                      </Badge>
                    )}
                  </div>
                  <h4 className="font-mono text-sm font-semibold">
                    {conflict.filePath}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {conflict.description}
                  </p>
                </div>
              </div>

              {/* Involved Agents */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Agents:</span>
                {conflict.agents.map((agent, i) => (
                  <Badge key={i} variant="outline">
                    {agent.substring(0, 8)}
                  </Badge>
                ))}
              </div>

              {/* Branches */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Branches:</span>
                {conflict.branches.map((branch, i) => (
                  <code key={i} className="text-sm bg-gray-100 px-2 py-1 rounded">
                    {branch}
                  </code>
                ))}
              </div>

              {/* Resolution Strategy */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm">
                  <span className="text-muted-foreground">Recommended: </span>
                  <span className="font-medium">
                    {getResolutionStrategyLabel(conflict.recommendedStrategy)}
                  </span>
                </div>
                {onResolve && (
                  <div className="flex gap-2">
                    {conflict.autoResolvable && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onResolve(conflict, conflict.recommendedStrategy)
                        }}
                      >
                        Auto Resolve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onResolve(conflict, 'manual')
                      }}
                    >
                      Manual
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Detailed View */}
      {selectedConflict && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Conflict Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">File Path</label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded mt-1">
                {selectedConflict.filePath}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Conflict Type</label>
              <div className="mt-1">
                <Badge
                  className={`bg-${getConflictTypeColor(
                    selectedConflict.conflictType
                  )}-500 text-white`}
                >
                  {getConflictTypeLabel(selectedConflict.conflictType)}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedConflict.description}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Resolution Options</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => onResolve?.(selectedConflict, 'use_first')}
                >
                  Use First Agent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onResolve?.(selectedConflict, 'use_last')}
                >
                  Use Last Agent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onResolve?.(selectedConflict, 'use_priority')}
                >
                  Use Priority
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onResolve?.(selectedConflict, 'auto_merge')}
                >
                  Auto Merge
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
