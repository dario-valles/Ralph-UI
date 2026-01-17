import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Loader2 } from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import type { PRDTemplate } from '@/types'

export function PRDTemplateSelector() {
  const navigate = useNavigate()
  const { templates, loading, error, loadTemplates, createPRD } = usePRDStore()
  const [selectedTemplate, setSelectedTemplate] = useState<PRDTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const handleSelectTemplate = (template: PRDTemplate | null) => {
    setSelectedTemplate(template)
  }

  const handleCreatePRD = async () => {
    setCreating(true)
    try {
      const prd = await createPRD({
        title: selectedTemplate ? `New ${selectedTemplate.name}` : 'New PRD',
        description: selectedTemplate?.description,
        templateId: selectedTemplate?.id,
        projectPath: undefined,
      })
      navigate(`/prds/${prd.id}`)
    } catch (err) {
      console.error('Failed to create PRD:', err)
    } finally {
      setCreating(false)
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

  return (
    <div className="container mx-auto max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New PRD</h1>
        <p className="mt-2 text-muted-foreground">
          Choose a template to get started with your Product Requirements Document
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* System templates */}
        {templates
          .filter((t) => t.systemTemplate)
          .map((template) => {
            const structure = JSON.parse(template.templateStructure)
            const isSelected = selectedTemplate?.id === template.id

            return (
              <Card
                key={template.id}
                className={`cursor-pointer transition-all hover:border-primary ${
                  isSelected ? 'border-primary ring-2 ring-primary' : ''
                }`}
                onClick={() => handleSelectTemplate(template)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="text-4xl">{template.icon || '📄'}</div>
                    {isSelected && <Badge variant="default">Selected</Badge>}
                  </div>
                  <CardTitle className="mt-2">{template.name}</CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Sections:</p>
                    <ul className="mt-2 space-y-1">
                      {structure.sections.slice(0, 3).map((section: any) => (
                        <li key={section.id} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          {section.title}
                        </li>
                      ))}
                      {structure.sections.length > 3 && (
                        <li className="text-xs">+{structure.sections.length - 3} more...</li>
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )
          })}

        {/* Start from scratch option */}
        <Card
          className={`cursor-pointer transition-all hover:border-primary ${
            selectedTemplate === null ? 'border-primary ring-2 ring-primary' : ''
          }`}
          onClick={() => handleSelectTemplate(null)}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <FileText className="h-10 w-10 text-muted-foreground" />
              {selectedTemplate === null && <Badge variant="default">Selected</Badge>}
            </div>
            <CardTitle className="mt-2">Start from Scratch</CardTitle>
            <CardDescription>Create a custom PRD with your own sections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">Features:</p>
              <ul className="mt-2 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Custom sections
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Full flexibility
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Your own structure
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected template preview */}
      {selectedTemplate && (
        <div className="mt-8 rounded-lg border bg-muted/50 p-6">
          <h2 className="text-lg font-semibold">Template Preview: {selectedTemplate.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{selectedTemplate.description}</p>
          <div className="mt-4">
            <h3 className="text-sm font-medium">Sections included:</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {JSON.parse(selectedTemplate.templateStructure).sections.map((section: any) => (
                <Badge key={section.id} variant="secondary">
                  {section.title}
                  {section.required && <span className="ml-1 text-destructive">*</span>}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/prds')}>
          Cancel
        </Button>
        <Button
          onClick={handleCreatePRD}
          disabled={creating}
          className="min-w-32"
        >
          {creating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  )
}
