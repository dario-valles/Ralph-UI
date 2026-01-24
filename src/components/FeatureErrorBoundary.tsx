import { Component, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Name of the feature for error messaging */
  featureName?: string
  /** Custom fallback UI */
  fallback?: ReactNode
  /** Callback when an error occurs */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /** Whether to show a compact version */
  compact?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary for feature areas.
 * Provides a lighter-weight error handling than the root ErrorBoundary.
 * Use this to wrap individual feature sections so errors don't crash the entire app.
 *
 * @example
 * ```tsx
 * <FeatureErrorBoundary featureName="Agent Monitoring">
 *   <AgentMonitoringPanel />
 * </FeatureErrorBoundary>
 * ```
 */
export class FeatureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[${this.props.featureName || 'Feature'}] Error:`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const featureName = this.props.featureName || 'This section'

      if (this.props.compact) {
        return (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{featureName} encountered an error</span>
            <Button variant="ghost" size="sm" onClick={this.handleRetry} className="ml-auto h-7">
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        )
      }

      return (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {featureName} Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {featureName} encountered an unexpected error and couldn't load properly.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <div className="p-2 rounded-md bg-muted text-xs font-mono text-destructive break-words">
                {this.state.error.message}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={this.handleRetry}>
              <RefreshCw className="h-3 w-3 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
