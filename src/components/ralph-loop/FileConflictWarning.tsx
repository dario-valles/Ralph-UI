/**
 * FileConflictWarning - Displays a warning when potential file conflicts are detected
 *
 * US-2.2: Avoid File Conflicts
 *
 * This component shows files that are currently being modified by other agents,
 * helping users understand potential merge conflict zones in multi-agent scenarios.
 */

import { AlertTriangle, FileWarning, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { FileInUse, FileConflict } from '@/types'

interface FileConflictWarningProps {
  /** Files currently in use by other agents */
  filesInUse?: FileInUse[]
  /** Detected file conflicts */
  conflicts?: FileConflict[]
  /** Whether the component should be expanded by default */
  defaultExpanded?: boolean
  /** Class name for custom styling */
  className?: string
}

export function FileConflictWarning({
  filesInUse = [],
  conflicts = [],
  defaultExpanded = false,
  className = '',
}: FileConflictWarningProps): React.JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Don't render if there's nothing to show
  if (filesInUse.length === 0 && conflicts.length === 0) {
    return null
  }

  const hasConflicts = conflicts.length > 0
  const variant = hasConflicts ? 'destructive' : 'default'

  // Group files by agent for better organization
  const filesByAgent = filesInUse.reduce(
    (acc, file) => {
      const key = `${file.agentType}:${file.agentId}`
      if (!acc[key]) {
        acc[key] = {
          agentId: file.agentId,
          agentType: file.agentType,
          storyId: file.storyId,
          files: [],
        }
      }
      acc[key].files.push(file.path)
      return acc
    },
    {} as Record<
      string,
      {
        agentId: string
        agentType: string
        storyId: string
        files: string[]
      }
    >
  )

  return (
    <Alert variant={variant} className={className}>
      {hasConflicts ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Info className="h-4 w-4" />
      )}
      <AlertTitle className="flex items-center justify-between">
        <span>
          {hasConflicts
            ? `${conflicts.length} Potential File Conflict${conflicts.length > 1 ? 's' : ''} Detected`
            : `${filesInUse.length} File${filesInUse.length > 1 ? 's' : ''} In Use by Other Agents`}
        </span>
        <Badge variant="outline" className="ml-2">
          US-2.2
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 -ml-2 mt-1">
              <ChevronDown
                className={`h-4 w-4 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
              {isExpanded ? 'Hide details' : 'Show details'}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2 space-y-3">
            {hasConflicts && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  These files have conflicts:
                </p>
                {conflicts.map((conflict, idx) => (
                  <div
                    key={`${conflict.path}-${idx}`}
                    className="rounded border border-destructive/50 bg-destructive/10 p-2"
                  >
                    <code className="text-xs font-mono block">{conflict.path}</code>
                    <span className="text-xs text-muted-foreground">
                      In use by {conflict.conflictingAgentType} agent ({conflict.conflictingStoryId})
                    </span>
                  </div>
                ))}
              </div>
            )}

            {Object.values(filesByAgent).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Files being modified by other agents:</p>
                {Object.values(filesByAgent).map((agent) => (
                  <div
                    key={`${agent.agentType}-${agent.agentId}`}
                    className="rounded border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FileWarning className="h-3 w-3" />
                      <span className="text-sm font-medium">
                        {agent.agentType} agent
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {agent.storyId}
                      </Badge>
                    </div>
                    <div className="pl-5 space-y-0.5">
                      {agent.files.map((file) => (
                        <code key={file} className="text-xs font-mono block text-muted-foreground">
                          {file}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Avoid modifying these files to prevent merge conflicts. The BRIEF.md file includes a complete list of files to avoid.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}
