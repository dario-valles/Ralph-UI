/**
 * Ultra Research Agent Card - Configuration card for a single research agent
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NativeSelect as Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { X, Bot, Check, Loader2, AlertCircle } from 'lucide-react'
import type { ResearchAgent, ResearchAgentStatus, AgentType } from '@/types'

interface UltraResearchAgentCardProps {
  agent: ResearchAgent
  index: number
  onUpdate: (updates: Partial<ResearchAgent>) => void
  onRemove: () => void
  disabled?: boolean
  showStatus?: boolean
}

const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'codex', label: 'Codex' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'droid', label: 'Droid' },
  { value: 'gemini', label: 'Gemini' },
]

const STATUS_ICONS: { [K in ResearchAgentStatus]: React.ReactNode } = {
  idle: <Bot className="h-3.5 w-3.5 text-muted-foreground" />,
  researching: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  discussing: <Loader2 className="h-3.5 w-3.5 text-purple-500 animate-spin" />,
  complete: <Check className="h-3.5 w-3.5 text-green-500" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
}

const STATUS_LABELS: { [K in ResearchAgentStatus]: string } = {
  idle: 'Ready',
  researching: 'Researching...',
  discussing: 'In Discussion',
  complete: 'Complete',
  error: 'Error',
}

export function UltraResearchAgentCard({
  agent,
  index,
  onUpdate,
  onRemove,
  disabled = false,
  showStatus = false,
}: UltraResearchAgentCardProps) {
  return (
    <Card className="p-3 relative">
      <div className="flex items-start gap-2">
        {/* Agent Number */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
          {index + 1}
        </div>

        {/* Agent Config */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Agent Type Row */}
          <div className="flex items-center gap-2">
            <Select
              value={agent.agentType}
              onChange={(e) => onUpdate({ agentType: e.target.value as AgentType })}
              disabled={disabled}
              className="flex-1 h-8 text-xs"
              aria-label="Agent type"
            >
              {AGENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>

            {/* Provider for Claude */}
            {agent.agentType === 'claude' && (
              <Select
                value={agent.providerId || ''}
                onChange={(e) => onUpdate({ providerId: e.target.value || undefined })}
                disabled={disabled}
                className="w-20 h-8 text-xs"
                aria-label="Provider"
              >
                <option value="">Default</option>
                <option value="zai">Z.AI</option>
                <option value="minimax">MiniMax</option>
              </Select>
            )}
          </div>

          {/* Focus Area */}
          <div>
            <Input
              value={agent.angle || ''}
              onChange={(e) => onUpdate({ angle: e.target.value || undefined })}
              placeholder="Focus area (e.g., Security, UX)"
              disabled={disabled}
              className="h-8 text-xs"
            />
          </div>

          {/* Status Badge (when showing progress) */}
          {showStatus && (
            <div className="flex items-center gap-1.5">
              {STATUS_ICONS[agent.status]}
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[agent.status]}</span>
            </div>
          )}
        </div>

        {/* Remove Button */}
        {!disabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Remove agent"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  )
}
