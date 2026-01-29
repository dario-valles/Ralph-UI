/**
 * Validate Mode Component
 *
 * Displays detailed validation analysis for a selected idea including:
 * - Feasibility panel
 * - Market opportunity panel
 * - Side-by-side comparison
 */
import { useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { FeasibilityPanel } from './FeasibilityPanel'
import { MarketOpportunityPanel } from './MarketOpportunityPanel'
import type { ValidatedIdea } from '@/types/gsd'
import { CheckCircle2, AlertCircle, TrendingUp, DollarSign, Loader2 } from 'lucide-react'

interface ValidateModeProps {
  /** Selected idea to validate */
  idea: ValidatedIdea | null
  /** Whether validation is in progress */
  isValidating: boolean
  /** Callback to validate feasibility */
  onValidateFeasibility: (idea: ValidatedIdea) => Promise<void>
  /** Callback to analyze market */
  onAnalyzeMarket: (idea: ValidatedIdea) => Promise<void>
  /** Callback to use simplified MVP */
  onUseSimplifiedMvp: (idea: ValidatedIdea) => void
  /** Callback to confirm and use this idea */
  onConfirm: () => void
  /** Error message */
  error?: string
}

export function ValidateMode({
  idea,
  isValidating,
  onValidateFeasibility,
  onAnalyzeMarket,
  onUseSimplifiedMvp,
  onConfirm,
  error,
}: ValidateModeProps) {
  // Auto-validate on mount if idea is selected but not validated
  useEffect(() => {
    if (idea && !idea.feasibility && !idea.market && !isValidating) {
      // Run both validations in parallel
      onValidateFeasibility(idea)
      onAnalyzeMarket(idea)
    }
  }, [idea, isValidating, onValidateFeasibility, onAnalyzeMarket])

  const handleValidateFeasibility = useCallback(async () => {
    if (idea) {
      await onValidateFeasibility(idea)
    }
  }, [idea, onValidateFeasibility])

  const handleAnalyzeMarket = useCallback(async () => {
    if (idea) {
      await onAnalyzeMarket(idea)
    }
  }, [idea, onAnalyzeMarket])

  const handleUseSimplifiedMvp = useCallback(() => {
    if (idea && idea.feasibility?.simplifiedMvp) {
      onUseSimplifiedMvp(idea)
    }
  }, [idea, onUseSimplifiedMvp])

  if (!idea) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No idea selected for validation</p>
        </CardContent>
      </Card>
    )
  }

  const { base, feasibility, market } = idea

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Idea summary */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle>{base.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">{base.summary}</p>
            </div>
            <div className="flex flex-col gap-2">
              {feasibility && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Feasibility Analyzed
                </Badge>
              )}
              {market && (
                <Badge variant="success" className="gap-1">
                  <DollarSign className="h-3 w-3" />
                  Market Analyzed
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Validation status */}
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Validation Status</span>
            <div className="flex items-center gap-2">
              {!feasibility && !market && !isValidating && (
                <Button
                  onClick={() => {
                    handleValidateFeasibility()
                    handleAnalyzeMarket()
                  }}
                  size="sm"
                  className="gap-1.5"
                >
                  <TrendingUp className="h-4 w-4" />
                  Analyze Idea
                </Button>
              )}
              {isValidating && (
                <Badge variant="secondary" className="gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing...
                </Badge>
              )}
            </div>
          </div>

          {/* Quick scores */}
          {(feasibility || market) && (
            <div className="grid grid-cols-2 gap-3">
              {feasibility && (
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {feasibility.feasibilityScore}%
                  </div>
                  <div className="text-xs text-muted-foreground">Feasibility Score</div>
                </div>
              )}
              {market && (
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold">
                    {market.monetizationPotential === 'high' && '💰'}
                    {market.monetizationPotential === 'medium' && '💵'}
                    {market.monetizationPotential === 'low' && '🪙'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {market.monetizationPotential} monetization
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed analysis tabs */}
      {(feasibility || market) && (
        <ScrollArea className="flex-1 pr-4">
          <Tabs defaultValue="feasibility" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="feasibility" disabled={!feasibility}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Feasibility
              </TabsTrigger>
              <TabsTrigger value="market" disabled={!market}>
                <DollarSign className="mr-2 h-4 w-4" />
                Market
              </TabsTrigger>
            </TabsList>

            <TabsContent value="feasibility" className="space-y-4">
              {feasibility && (
                <FeasibilityPanel
                  feasibility={feasibility}
                  onUseSimplifiedMvp={
                    feasibility.simplifiedMvp ? handleUseSimplifiedMvp : undefined
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="market" className="space-y-4">
              {market && <MarketOpportunityPanel market={market} />}
            </TabsContent>
          </Tabs>
        </ScrollArea>
      )}

      {/* Confirm button */}
      {(feasibility || market) && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={onConfirm} className="w-full" size="lg">
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Use This Idea
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
