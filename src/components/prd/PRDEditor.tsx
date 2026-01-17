import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Save,
  Loader2,
  Play,
  BarChart3,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { PRDExecutionDialog } from './PRDExecutionDialog'
import { toast } from '@/stores/toastStore'
import type { PRDSection } from '@/types'

export function PRDEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentPRD, loading, error, setCurrentPRD, updatePRD, analyzeQuality } = usePRDStore()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState<PRDSection[]>([])
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [showExecutionDialog, setShowExecutionDialog] = useState(false)

  useEffect(() => {
    if (id) {
      setCurrentPRD(id)
    }
  }, [id, setCurrentPRD])

  useEffect(() => {
    if (currentPRD) {
      setTitle(currentPRD.title)
      setDescription(currentPRD.description || '')
      try {
        const parsed = JSON.parse(currentPRD.content)
        setSections(parsed.sections || [])
      } catch (err) {
        console.error('Failed to parse PRD content:', err)
        toast.error('Failed to parse PRD content', 'The document may be corrupted or in an invalid format.')
      }
    }
  }, [currentPRD])

  const handleSectionChange = (index: number, content: string) => {
    const newSections = [...sections]
    newSections[index] = { ...newSections[index], content }
    setSections(newSections)
  }

  const handleSave = async () => {
    if (!currentPRD) return

    setSaving(true)
    try {
      await updatePRD({
        id: currentPRD.id,
        title,
        description,
        content: JSON.stringify({ sections }),
      })
      toast.success('PRD saved', 'Your changes have been saved successfully.')
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
          <Button onClick={() => setShowExecutionDialog(true)} className="gap-2">
            <Play className="h-4 w-4" />
            Execute PRD
          </Button>
        </div>
      </div>

      {/* Quality Scores */}
      {currentPRD.qualityScoreOverall && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Quality Analysis</CardTitle>
            <CardDescription>Automated scoring of your PRD</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Completeness</Label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${currentPRD.qualityScoreCompleteness}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{currentPRD.qualityScoreCompleteness}%</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Clarity</Label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${currentPRD.qualityScoreClarity}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{currentPRD.qualityScoreClarity}%</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Actionability</Label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${currentPRD.qualityScoreActionability}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{currentPRD.qualityScoreActionability}%</span>
                </div>
              </div>
            </div>
            {(currentPRD.qualityScoreClarity || 0) < 70 && (
              <div className="mt-4 rounded-md bg-yellow-500/10 p-3 text-sm">
                <p className="font-medium">💡 Suggestions:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                  <li>Avoid vague terms like "simple", "fast", or "good"</li>
                  <li>Define specific metrics and success criteria</li>
                  <li>Be more descriptive in your requirements</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
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

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section, index) => (
          <Card key={section.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {section.title}
                  {section.required && <span className="ml-1 text-destructive">*</span>}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {section.content.length} characters
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={section.content}
                onChange={(e) => handleSectionChange(index, e.target.value)}
                placeholder={`Describe ${section.title.toLowerCase()}...`}
                rows={6}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Execution Dialog */}
      {showExecutionDialog && (
        <PRDExecutionDialog
          prdId={currentPRD.id}
          open={showExecutionDialog}
          onOpenChange={setShowExecutionDialog}
        />
      )}
    </div>
  )
}
