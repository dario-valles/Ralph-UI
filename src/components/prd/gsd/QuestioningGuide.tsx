/**
 * Questioning Guide Component
 *
 * Displays a checklist of context items to help guide the user
 * through the deep questioning phase.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip } from '@/components/ui/tooltip'
import { CheckCircle2, Circle, X, HelpCircle } from 'lucide-react'
import type { QuestioningContext } from '@/types/gsd'

interface QuestioningGuideProps {
  /** Current questioning context */
  context: QuestioningContext
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

export function QuestioningGuide({
  context,
  onContextItemUpdate,
  onClose,
}: QuestioningGuideProps) {
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

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
        <p className="text-xs text-muted-foreground">
          {completedCount}/4 items completed
        </p>
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
                </div>
              ) : value ? (
                <div
                  className="p-2 bg-muted rounded text-xs cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleStartEdit(item.key, value)}
                >
                  {value}
                </div>
              ) : (
                <Input
                  placeholder={item.placeholder}
                  className="text-xs"
                  onFocus={() => handleStartEdit(item.key)}
                />
              )}
            </div>
          )
        })}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Tip: You can also add context by typing in the main input area.
            The guide helps ensure you cover the essentials.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
