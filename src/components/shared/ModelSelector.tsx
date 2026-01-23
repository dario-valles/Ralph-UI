import { NativeSelect as Select } from '@/components/ui/select'
import { groupModelsByProvider, formatProviderName } from '@/lib/model-api'
import type { ModelInfo } from '@/lib/model-api'
import { cn } from '@/lib/utils'

export interface ModelSelectorProps {
  /** Currently selected model ID */
  value: string
  /** Callback when model selection changes */
  onChange: (modelId: string) => void
  /** List of available models */
  models: ModelInfo[]
  /** Whether the models are currently loading */
  loading?: boolean
  /** Whether the selector is disabled */
  disabled?: boolean
  /** HTML id attribute */
  id?: string
  /** aria-label for accessibility */
  ariaLabel?: string
  /** Additional CSS classes */
  className?: string
  /** Loading text to display */
  loadingText?: string
}

/**
 * Shared model selector component that displays models grouped by provider.
 * Used across PRD Chat, Ralph Loop Dashboard, and other places that need model selection.
 */
export function ModelSelector({
  value,
  onChange,
  models,
  loading = false,
  disabled = false,
  id = 'model-selector',
  ariaLabel = 'Model',
  className,
  loadingText = 'Loading...',
}: ModelSelectorProps): React.JSX.Element {
  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      className={cn(className)}
    >
      {loading ? (
        <option>{loadingText}</option>
      ) : (
        Object.entries(groupModelsByProvider(models)).map(([provider, providerModels]) => (
          <optgroup key={provider} label={formatProviderName(provider)}>
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))
      )}
    </Select>
  )
}
