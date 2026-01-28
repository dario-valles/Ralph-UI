import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip } from '@/components/ui/tooltip'
import { CheckCircle2, Circle, X, HelpCircle, Sparkles, ChevronRight } from 'lucide-react'
import type { QuestioningContext, ProjectType } from '@/types/gsd'
import { getRandomProbingQuestion, detectVagueAnswer, type ProbingQuestion } from './prompts'
import { ContextQualityIndicator } from './ContextQualityIndicator'
import { SmartContextSuggestions } from './SmartContextSuggestions'

interface QuestioningGuideProps {
  /** Current questioning context */
  context: QuestioningContext
  /** Current project type */
  projectType?: ProjectType
  /** Callback when a context item is updated */
  onContextItemUpdate: (key: 'what' | 'why' | 'who' | 'done', value: string) => void
  /** Callback to close the guide */
  onClose: () => void
}

interface ContextItemConfig {
  key: 'what' | 'why' | 'who' | 'done'
  label: string
  description: string
  placeholder: string
  helpText: string
}

const CONTEXT_ITEMS: ContextItemConfig[] = [
  {
    key: 'what',
    label: 'What',
    description: 'What are you building?',
    placeholder: 'e.g., A task management app for remote teams',
    helpText: 'Describe the product or feature you want to create. Be specific about what it does.',
  },
  {
    key: 'why',
    label: 'Why',
    description: 'Why does this need to exist?',
    placeholder: 'e.g., Teams struggle to track tasks across time zones',
    helpText: "Explain the problem you're solving. What pain point or opportunity drives this?",
  },
  {
    key: 'who',
    label: 'Who',
    description: 'Who is this for?',
    placeholder: 'e.g., Product managers at startups with 10-50 employees',
    helpText: 'Define your target user. Be as specific as possible about their characteristics.',
  },
  {
    key: 'done',
    label: 'Done',
    description: 'What does "done" look like?',
    placeholder: 'e.g., Users can create, assign, and track tasks with due dates',
    helpText: 'Describe success criteria. How will you know when this is complete?',
  },
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  web_app: 'Web Application',
  cli_tool: 'CLI Tool',
  api_service: 'API Service',
  library: 'Library',
  mobile_app: 'Mobile App',
  desktop_app: 'Desktop App',
  data_pipeline: 'Data Pipeline',
  devops_tool: 'DevOps Tool',
  documentation: 'Documentation',
  other: 'Other Project',
}

export function QuestioningGuide({
  context,
  projectType,
  onContextItemUpdate,
  onClose,
}: QuestioningGuideProps) {
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showProbing, setShowProbing] = useState<string | null>(null)
  const [currentProbing, setCurrentProbing] = useState<Record<string, ProbingQuestion>>({})

  // Get a probing question for an area (memoized per area)
  const getProbingForArea = (key: 'what' | 'why' | 'who' | 'done'): ProbingQuestion => {
    if (!currentProbing[key]) {
      setCurrentProbing((prev) => ({ ...prev, [key]: getRandomProbingQuestion(key) }))
      return getRandomProbingQuestion(key)
    }
    return currentProbing[key]
  }

  const refreshProbing = (key: 'what' | 'why' | 'who' | 'done') => {
    setCurrentProbing((prev) => ({ ...prev, [key]: getRandomProbingQuestion(key) }))
  }

  const handleStartEdit = (key: string, currentValue?: string) => {
    setEditingItem(key)
    setEditValue(currentValue || '')
  }

  const handleSaveEdit = (key: 'what' | 'why' | 'who' | 'done') => {
    if (editValue.trim()) {
      onContextItemUpdate(key, editValue.trim())
    }
    setEditingItem(null)
    setEditValue('')
  }

  const handleCancelEdit = () => {
    setEditingItem(null)
    setEditValue('')
  }

  const handleImproveContext = (suggestions: string[]) => {
    // Show suggestions to user - they can manually apply them
    console.log('Context improvement suggestions:', suggestions)
    // TODO: Could show a modal or toast with the suggestions
  }

  const getContextValue = (key: 'what' | 'why' | 'who' | 'done'): string | undefined => {
    return context[key]
  }

  const isComplete = (key: 'what' | 'why' | 'who' | 'done'): boolean => {
    return Boolean(getContextValue(key)?.trim())
  }

  const completedCount = CONTEXT_ITEMS.filter((item) => isComplete(item.key)).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Context Checklist</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {projectType && (
          <Badge variant="secondary" className="mt-2 w-fit">
            {PROJECT_TYPE_LABELS[projectType] || projectType}
          </Badge>
        )}

        <ContextQualityIndicator
          context={context}
          projectType={projectType}
          onImprove={handleImproveContext}
          className="mt-3"
        />

        <p className="text-xs text-muted-foreground mt-2">{completedCount}/4 items completed</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {CONTEXT_ITEMS.map((item) => {
          const value = getContextValue(item.key)
          const completed = isComplete(item.key)
          const isEditing = editingItem === item.key

          return (
            <div key={item.key} className="space-y-2">
              <div className="flex items-center gap-2">
                {completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <Label className="text-sm font-medium">{item.label}</Label>
                <Tooltip content={item.helpText}>
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </Tooltip>
              </div>

              <p className="text-xs text-muted-foreground">{item.description}</p>

              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={item.placeholder}
                    className="text-xs min-h-[60px]"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(item.key)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  </div>

                  {/* Probing question while editing */}
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          {getProbingForArea(item.key).question}
                        </p>
                        <div className="mt-1 space-y-1">
                          {getProbingForArea(item.key)
                            .examples.slice(0, 2)
                            .map((ex, i) => (
                              <p
                                key={i}
                                className="text-xs text-amber-600/80 dark:text-amber-400/80 italic"
                              >
                                &ldquo;{ex}&rdquo;
                              </p>
                            ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs mt-1 text-amber-600 hover:text-amber-700"
                          onClick={() => refreshProbing(item.key)}
                        >
                          <ChevronRight className="h-3 w-3 mr-1" />
                          Different question
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : value ? (
                <div className="space-y-2">
                  <div
                    className="p-2 bg-muted rounded text-xs cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleStartEdit(item.key, value)}
                  >
                    {value}
                  </div>

                  {/* Check if the answer might be vague */}
                  {(() => {
                    const vague = detectVagueAnswer(value)
                    if (vague.isVague) {
                      return (
                        <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{vague.reason}</span>
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder={item.placeholder}
                    className="text-xs"
                    onFocus={() => handleStartEdit(item.key)}
                  />

                  {projectType ? (
                    <SmartContextSuggestions
                      projectType={projectType}
                      context={context}
                      missingItem={item.key}
                      onAdopt={(suggestion) => onContextItemUpdate(item.key, suggestion)}
                    />
                  ) : (
                    <>
                      {/* Show probing prompt button for empty items if no project type */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowProbing(showProbing === item.key ? null : item.key)}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Need help thinking about this?
                      </Button>

                      {showProbing === item.key && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">
                            {getProbingForArea(item.key).question}
                          </p>
                          <div className="space-y-1">
                            {getProbingForArea(item.key).examples.map((ex, i) => (
                              <p
                                key={i}
                                className="text-xs text-amber-600/80 dark:text-amber-400/80 italic"
                              >
                                &ldquo;{ex}&rdquo;
                              </p>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs mt-2 text-amber-600 hover:text-amber-700"
                            onClick={() => refreshProbing(item.key)}
                          >
                            <ChevronRight className="h-3 w-3 mr-1" />
                            Different question
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Tip: You can also add context by typing in the main input area. The guide helps ensure
            you cover the essentials.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
