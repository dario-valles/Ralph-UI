import { Component, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <CardTitle>Something went wrong</CardTitle>
                  <CardDescription>The application encountered an unexpected error</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-sm font-mono text-destructive break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              {import.meta.env.DEV && this.state.errorInfo && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show stack trace
                  </summary>
                  <pre className="mt-2 p-3 rounded-md bg-muted text-xs overflow-auto max-h-48">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button variant="outline" onClick={this.handleReset}>
                Try Again
              </Button>
              <Button variant="outline" onClick={this.handleGoHome}>
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload App
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
