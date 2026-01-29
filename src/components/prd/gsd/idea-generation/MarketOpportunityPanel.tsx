/**
 * Market Opportunity Panel Component
 *
 * Displays market analysis including:
 * - TAM/SAM display
 * - Target user count
 * - Acquisition channels
 * - Competition level
 * - Monetization potential
 * - Competitor list
 * - Market gaps
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MarketOpportunity } from '@/types/gsd'
import {
  DollarSign,
  Users,
  TrendingUp,
  Building2,
  Lightbulb,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'

interface MarketOpportunityPanelProps {
  /** Market opportunity data */
  market: MarketOpportunity
}

export function MarketOpportunityPanel({ market }: MarketOpportunityPanelProps) {
  const {
    tam,
    sam,
    targetUserCount,
    acquisitionChannels,
    competition,
    monetizationPotential,
    competitors,
    gaps,
  } = market

  const getCompetitionBadge = () => {
    switch (competition) {
      case 'low':
        return (
          <Badge variant="success" className="gap-1">
            <TrendingUp className="h-3 w-3" />
            Low Competition
          </Badge>
        )
      case 'medium':
        return (
          <Badge variant="warning" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Medium Competition
          </Badge>
        )
      case 'high':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            High Competition
          </Badge>
        )
    }
  }

  const getMonetizationBadge = () => {
    switch (monetizationPotential) {
      case 'high':
        return <Badge variant="success">High Monetization</Badge>
      case 'medium':
        return <Badge variant="warning">Medium Monetization</Badge>
      case 'low':
        return <Badge variant="outline">Low Monetization</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Market Opportunity
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Market Size */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Market Size
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">TAM</div>
              <div className="text-lg font-bold">{tam}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">SAM</div>
              <div className="text-lg font-bold">{sam}</div>
            </div>
          </div>
        </div>

        {/* Target Users */}
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-muted-foreground" />
            Target Users
          </h4>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-sm">{targetUserCount}</div>
          </div>
        </div>

        {/* Competition & Monetization */}
        <div className="flex items-center gap-3">
          {getCompetitionBadge()}
          {getMonetizationBadge()}
        </div>

        {/* Acquisition Channels */}
        {acquisitionChannels && acquisitionChannels.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              Acquisition Channels
            </h4>
            <div className="space-y-1.5">
              {acquisitionChannels.map((channel, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2 text-sm"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span>{channel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Competitors */}
        {competitors && competitors.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Key Competitors
            </h4>
            <ScrollArea className="h-[180px] pr-4">
              <div className="space-y-3">
                {competitors.map((competitor, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="font-medium text-sm">{competitor.name}</div>
                    <div className="space-y-1">
                      <div className="text-xs">
                        <span className="font-medium text-green-600 dark:text-green-400">
                          Strengths:
                        </span>{' '}
                        {competitor.strengths.join(', ')}
                      </div>
                      <div className="text-xs">
                        <span className="font-medium text-red-600 dark:text-red-400">
                          Weaknesses:
                        </span>{' '}
                        {competitor.weaknesses.join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Market Gaps */}
        {gaps && gaps.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Market Opportunities
            </h4>
            <div className="space-y-2">
              {gaps.map((gap, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3"
                >
                  <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{gap}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
