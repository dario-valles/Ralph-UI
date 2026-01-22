/**
 * Deep Questioning Component for GSD Workflow
 *
 * Provides the questioning interface for the first phase of GSD,
 * helping users articulate what they want to build through guided questions.
 */

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { QuestioningGuide } from './gsd/QuestioningGuide'
import type { QuestioningContext } from '@/types/gsd'
import { MessageSquare, ArrowRight, Lightbulb } from 'lucide-react'

interface DeepQuestioningProps {
  /** Current questioning context */
  context: QuestioningContext
  /** Callback when context is updated */
  onContextUpdate: (context: Partial<QuestioningContext>) => void
  /** Callback when user is ready to proceed */
  onProceed: () => void
  /** Whether the component is in loading state */
  isLoading?: boolean
}

/** Initial prompt to get the user thinking */
const INITIAL_PROMPT = `What would you like to build? Tell me about your idea in as much detail as you can.

Consider:
- What problem are you solving?
- Who is this for?
- What would success look like?`

export function DeepQuestioning({
  context,
  onContextUpdate,
  onProceed,
  isLoading = false,
}: DeepQuestioningProps) {
  const [userInput, setUserInput] = useState('')
  const [showGuide, setShowGuide] = useState(true)

  // Check if enough context has been gathered
  const hasWhat = Boolean(context.what?.trim())
  const hasWhy = Boolean(context.why?.trim())
  const hasWho = Boolean(context.who?.trim())
  const hasDone = Boolean(context.done?.trim())
  const contextItemsCount = [hasWhat, hasWhy, hasWho, hasDone].filter(Boolean).length
  const isReadyToProceed = contextItemsCount >= 3

  const handleSubmitInput = useCallback(() => {
    if (!userInput.trim()) return

    // Add the input as a note
    onContextUpdate({
      notes: [...(context.notes || []), userInput.trim()],
    })

    setUserInput('')
  }, [userInput, context.notes, onContextUpdate])

  const handleProceed = useCallback(() => {
    onProceed()
  }, [onProceed])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle>Deep Questioning</CardTitle>
          </div>
          <CardDescription>
            Let&apos;s understand what you want to build. The more context you provide,
            the better we can plan your project.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Input area */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Initial prompt card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {INITIAL_PROMPT}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* User input area */}
          <Card>
            <CardContent className="pt-6">
              <Textarea
                placeholder="Describe your idea here..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="min-h-[150px] resize-y"
                disabled={isLoading}
              />
              <div className="flex justify-end mt-4">
                <Button onClick={handleSubmitInput} disabled={!userInput.trim() || isLoading}>
                  Add Context
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes/context history */}
          {context.notes && context.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Context Gathered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {context.notes.map((note, index) => (
                    <div
                      key={index}
                      className="p-3 bg-muted rounded-lg text-sm"
                    >
                      {note}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Guide sidebar */}
        <div className="lg:col-span-1">
          {showGuide && (
            <QuestioningGuide
              context={context}
              onContextItemUpdate={(key, value) => onContextUpdate({ [key]: value })}
              onClose={() => setShowGuide(false)}
            />
          )}

          {!showGuide && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowGuide(true)}
            >
              Show Guide
            </Button>
          )}
        </div>
      </div>

      {/* Progress and proceed */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Context items:</span>
              <div className="flex gap-2">
                <Badge variant={hasWhat ? 'default' : 'outline'}>What</Badge>
                <Badge variant={hasWhy ? 'default' : 'outline'}>Why</Badge>
                <Badge variant={hasWho ? 'default' : 'outline'}>Who</Badge>
                <Badge variant={hasDone ? 'default' : 'outline'}>Done</Badge>
              </div>
            </div>

            <Button
              onClick={handleProceed}
              disabled={!isReadyToProceed || isLoading}
              className="gap-2"
            >
              Create PROJECT.md
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {!isReadyToProceed && (
            <p className="text-sm text-muted-foreground mt-2">
              Please provide at least 3 context items before proceeding.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
