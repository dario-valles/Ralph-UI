import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FileText, Loader2, MessageSquare, Search, Sparkles } from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import type { PRDTemplate } from '@/types'

// Template categories for better organization
const TEMPLATE_CATEGORIES = {
  'popular': ['startup-mvp', 'enterprise-feature', 'bug-fix'],
  'development': ['ui-component', 'backend-service', 'api-integration', 'mobile-feature'],
  'infrastructure': ['database-migration', 'devops-automation', 'performance-optimization'],
  'quality': ['refactoring', 'testing-strategy', 'security-feature', 'documentation'],
}

const CATEGORY_LABELS: Record<string, string> = {
  'popular': 'Popular',
  'development': 'Development',
  'infrastructure': 'Infrastructure',
  'quality': 'Quality & Maintenance',
}

// Safely parse template structure with fallback
function parseTemplateStructure(templateStructure: string | undefined): { sections: Array<{ id: string; title: string; required?: boolean }> } {
  if (!templateStructure) {
    return { sections: [] }
  }
  try {
    return JSON.parse(templateStructure)
  } catch {
    return { sections: [] }
  }
}

export function PRDTemplateSelector() {
  const navigate = useNavigate()
  const { templates, loading, error, loadTemplates, createPRD } = usePRDStore()
  const [selectedTemplate, setSelectedTemplate] = useState<PRDTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [useAIChat, setUseAIChat] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const handleSelectTemplate = (template: PRDTemplate | null) => {
    setSelectedTemplate(template)
    setUseAIChat(false)
  }

  const handleSelectAIChat = () => {
    setSelectedTemplate(null)
    setUseAIChat(true)
  }

  const handleCreatePRD = async () => {
    if (useAIChat) {
      navigate('/prds/chat')
      return
    }

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

  // Filter templates based on search
  const filteredTemplates = templates.filter((t) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query)
    )
  })

  // Group templates by category
  const getTemplatesByCategory = (category: string) => {
    const categoryIds = TEMPLATE_CATEGORIES[category as keyof typeof TEMPLATE_CATEGORIES] || []
    return filteredTemplates.filter((t) => categoryIds.includes(t.id))
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
    <div className="container mx-auto max-w-7xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New PRD</h1>
        <p className="mt-2 text-muted-foreground">
          Choose how you want to create your Product Requirements Document
        </p>
      </div>

      {/* AI Chat Option - Featured prominently */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          AI-Assisted Creation
        </h2>
        <Card
          className={`cursor-pointer transition-all hover:border-primary hover:shadow-md ${
            useAIChat ? 'border-primary ring-2 ring-primary bg-primary/5' : ''
          }`}
          onClick={handleSelectAIChat}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">Create with AI Chat</CardTitle>
                  <CardDescription className="mt-1">
                    Let AI guide you through creating a comprehensive PRD via conversation
                  </CardDescription>
                </div>
              </div>
              {useAIChat && <Badge variant="default">Selected</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-violet-500" />
                <div>
                  <p className="font-medium text-sm">Guided Discovery</p>
                  <p className="text-xs text-muted-foreground">AI asks the right questions</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-violet-500" />
                <div>
                  <p className="font-medium text-sm">Context-Aware</p>
                  <p className="text-xs text-muted-foreground">Understands your codebase</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-violet-500" />
                <div>
                  <p className="font-medium text-sm">Export Ready</p>
                  <p className="text-xs text-muted-foreground">Generate structured PRD</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="relative mb-8">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-4 text-muted-foreground">Or choose a template</span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Template Categories */}
      {Object.entries(TEMPLATE_CATEGORIES).map(([category]) => {
        const categoryTemplates = getTemplatesByCategory(category)
        if (categoryTemplates.length === 0) return null

        return (
          <div key={category} className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {categoryTemplates.map((template) => {
                const structure = parseTemplateStructure(template.templateStructure)
                const isSelected = selectedTemplate?.id === template.id && !useAIChat

                return (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all hover:border-primary hover:shadow-sm ${
                      isSelected ? 'border-primary ring-2 ring-primary' : ''
                    }`}
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <span className="text-2xl">{template.icon || '📄'}</span>
                        {isSelected && <Badge variant="default" className="text-xs">Selected</Badge>}
                      </div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs line-clamp-2">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-xs text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {structure.sections.slice(0, 3).map((section: { id: string; title: string }) => (
                            <Badge key={section.id} variant="secondary" className="text-xs font-normal">
                              {section.title}
                            </Badge>
                          ))}
                          {structure.sections.length > 3 && (
                            <Badge variant="outline" className="text-xs font-normal">
                              +{structure.sections.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Start from Scratch - at the end */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-muted-foreground">Custom</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Card
            className={`cursor-pointer transition-all hover:border-primary hover:shadow-sm ${
              selectedTemplate === null && !useAIChat ? 'border-primary ring-2 ring-primary' : ''
            }`}
            onClick={() => handleSelectTemplate(null)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <FileText className="h-8 w-8 text-muted-foreground" />
                {selectedTemplate === null && !useAIChat && (
                  <Badge variant="default" className="text-xs">Selected</Badge>
                )}
              </div>
              <CardTitle className="text-base">Start from Scratch</CardTitle>
              <CardDescription className="text-xs line-clamp-2">
                Create a custom PRD with your own sections
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs font-normal">Custom sections</Badge>
                <Badge variant="secondary" className="text-xs font-normal">Full flexibility</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Selected template preview */}
      {selectedTemplate && !useAIChat && (
        <div className="mb-8 rounded-lg border bg-muted/50 p-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl">{selectedTemplate.icon || '📄'}</span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{selectedTemplate.description}</p>
              <div className="mt-4">
                <h3 className="text-sm font-medium">Sections included:</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {parseTemplateStructure(selectedTemplate.templateStructure).sections.map((section: { id: string; title: string; required?: boolean }) => (
                    <Badge key={section.id} variant="secondary">
                      {section.title}
                      {section.required && <span className="ml-1 text-destructive">*</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons - sticky at bottom */}
      <div className="sticky bottom-0 -mx-8 border-t bg-background px-8 py-4">
        <div className="container mx-auto flex max-w-7xl items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/prds')}>
            Cancel
          </Button>
          <div className="flex items-center gap-4">
            {(selectedTemplate || useAIChat || (!selectedTemplate && !useAIChat)) && (
              <p className="text-sm text-muted-foreground">
                {useAIChat
                  ? 'Start AI-guided PRD creation'
                  : selectedTemplate
                  ? `Using: ${selectedTemplate.name}`
                  : 'Starting from scratch'}
              </p>
            )}
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
              ) : useAIChat ? (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Start Chat
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
