/**
 * Roadmap Editor Component for GSD Workflow
 *
 * Displays and allows editing of the generated roadmap phases.
 */

import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { RoadmapDoc, RoadmapPhase } from '@/types/planning'
import { Map, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react'

interface RoadmapEditorProps {
  /** Roadmap document */
  roadmap: RoadmapDoc
  /** Callback when roadmap is updated */
  onUpdate: (roadmap: RoadmapDoc) => Promise<void>
  /** Callback when ready to proceed */
  onProceed: () => void
  /** Whether the component is in loading state */
  isLoading?: boolean
}

interface PhaseCardProps {
  phase: RoadmapPhase
  onEdit: (phase: RoadmapPhase) => void
  onDelete: (phaseNumber: number) => void
}

function PhaseCard({ phase, onEdit, onDelete }: PhaseCardProps) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {phase.number}
            </div>
            <div>
              <CardTitle className="text-base">{phase.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {phase.requirementIds?.length || 0} requirements
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(phase)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(phase.number)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {phase.description && (
          <p className="text-sm text-muted-foreground mb-3">{phase.description}</p>
        )}

        {/* Requirements */}
        {phase.requirementIds && phase.requirementIds.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium mb-2">Requirements</p>
            <div className="flex flex-wrap gap-1">
              {phase.requirementIds.map((reqId) => (
                <Badge key={reqId} variant="outline" className="font-mono text-xs">
                  {reqId}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Milestone */}
        {phase.milestone && (
          <div className="mb-3">
            <p className="text-xs font-medium mb-1">Milestone</p>
            <p className="text-sm text-muted-foreground">{phase.milestone}</p>
          </div>
        )}

        {/* Effort summary */}
        {phase.effortSummary && (
          <div>
            <p className="text-xs font-medium mb-1">Effort</p>
            <p className="text-sm text-muted-foreground">{phase.effortSummary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface EditPhaseDialogProps {
  phase: RoadmapPhase | null
  isOpen: boolean
  onClose: () => void
  onSave: (phase: RoadmapPhase) => void
  nextPhaseNumber: number
}

function EditPhaseDialog({ phase, isOpen, onClose, onSave, nextPhaseNumber }: EditPhaseDialogProps) {
  const [title, setTitle] = useState(phase?.title || '')
  const [description, setDescription] = useState(phase?.description || '')
  const [milestone, setMilestone] = useState(phase?.milestone || '')
  const [effortSummary, setEffortSummary] = useState(phase?.effortSummary || '')

  const handleSave = () => {
    onSave({
      number: phase?.number || nextPhaseNumber,
      title,
      description,
      milestone,
      effortSummary,
      requirementIds: phase?.requirementIds || [],
      prerequisites: phase?.prerequisites || [],
    })
    onClose()
  }

  // Reset form when phase changes
  useState(() => {
    if (phase) {
      setTitle(phase.title)
      setDescription(phase.description || '')
      setMilestone(phase.milestone || '')
      setEffortSummary(phase.effortSummary || '')
    } else {
      setTitle('')
      setDescription('')
      setMilestone('')
      setEffortSummary('')
    }
  })

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{phase ? 'Edit Phase' : 'Add Phase'}</DialogTitle>
          <DialogDescription>
            Configure the phase details and milestones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Phase Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Foundation"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this phase accomplishes..."
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Milestone</label>
            <Input
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
              placeholder="Key deliverable for this phase"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Effort Summary</label>
            <Input
              value={effortSummary}
              onChange={(e) => setEffortSummary(e.target.value)}
              placeholder="e.g., 2 weeks, 3 sprints"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RoadmapEditor({
  roadmap,
  onUpdate,
  onProceed,
  isLoading = false,
}: RoadmapEditorProps) {
  const [localRoadmap, setLocalRoadmap] = useState<RoadmapDoc>({ ...roadmap })
  const [editingPhase, setEditingPhase] = useState<RoadmapPhase | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Sort phases by number
  const sortedPhases = useMemo(() => {
    return [...localRoadmap.phases].sort((a, b) => a.number - b.number)
  }, [localRoadmap.phases])

  // Stats
  const stats = useMemo(() => {
    const reqIds = new Set<string>()
    let milestoneCount = 0

    localRoadmap.phases.forEach((phase) => {
      phase.requirementIds?.forEach((id) => reqIds.add(id))
      if (phase.milestone) milestoneCount++
    })

    return {
      phases: localRoadmap.phases.length,
      requirements: reqIds.size,
      milestones: milestoneCount,
    }
  }, [localRoadmap])

  // Next phase number
  const nextPhaseNumber = useMemo(() => {
    if (localRoadmap.phases.length === 0) return 1
    return Math.max(...localRoadmap.phases.map((p) => p.number)) + 1
  }, [localRoadmap.phases])

  const handleEditPhase = useCallback((phase: RoadmapPhase) => {
    setEditingPhase(phase)
    setIsDialogOpen(true)
  }, [])

  const handleAddPhase = useCallback(() => {
    setEditingPhase(null)
    setIsDialogOpen(true)
  }, [])

  const handleSavePhase = useCallback((phase: RoadmapPhase) => {
    setLocalRoadmap((prev) => {
      const existingIndex = prev.phases.findIndex((p) => p.number === phase.number)
      if (existingIndex >= 0) {
        // Update existing
        const phases = [...prev.phases]
        phases[existingIndex] = phase
        return { ...prev, phases }
      } else {
        // Add new
        return {
          ...prev,
          phases: [...prev.phases, phase],
        }
      }
    })
    setHasChanges(true)
  }, [])

  const handleDeletePhase = useCallback((phaseNumber: number) => {
    setLocalRoadmap((prev) => ({
      ...prev,
      phases: prev.phases.filter((p) => p.number !== phaseNumber),
    }))
    setHasChanges(true)
  }, [])

  const handleApply = useCallback(async () => {
    await onUpdate(localRoadmap)
    setHasChanges(false)
  }, [localRoadmap, onUpdate])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-primary" />
            <CardTitle>Implementation Roadmap</CardTitle>
          </div>
          <CardDescription>
            Review and refine the generated roadmap. Each phase groups related
            requirements with clear milestones.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Phases</p>
          <p className="text-2xl font-bold">{stats.phases}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Requirements</p>
          <p className="text-2xl font-bold">{stats.requirements}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Milestones</p>
          <p className="text-2xl font-bold">{stats.milestones}</p>
        </Card>
      </div>

      {/* Timeline view */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Phases</CardTitle>
            <Button size="sm" variant="outline" onClick={handleAddPhase}>
              <Plus className="h-4 w-4 mr-1" />
              Add Phase
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {sortedPhases.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No phases defined. Click &quot;Add Phase&quot; to create one.
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />

                {sortedPhases.map((phase) => (
                  <PhaseCard
                    key={phase.number}
                    phase={phase}
                    onEdit={handleEditPhase}
                    onDelete={handleDeletePhase}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              {hasChanges && (
                <Button onClick={handleApply} disabled={isLoading}>
                  Save Changes
                </Button>
              )}
            </div>
            <Button onClick={onProceed} disabled={isLoading} className="gap-2">
              Verify Plans
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <EditPhaseDialog
        phase={editingPhase}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSavePhase}
        nextPhaseNumber={nextPhaseNumber}
      />
    </div>
  )
}
