import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Github,
  CheckCircle2,
  AlertTriangle,
  Tag,
  FileText,
} from 'lucide-react'
import {
  githubApi,
  Issue,
  IssueImportResult,
} from '@/lib/git-api'

interface ImportGitHubIssuesDialogProps {
  projectPath: string
  /** PRD name - if not provided, user can enter it in the dialog */
  prdName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (result: IssueImportResult) => void
}

export function ImportGitHubIssuesDialog({
  projectPath,
  prdName: initialPrdName,
  open,
  onOpenChange,
  onSuccess,
}: ImportGitHubIssuesDialogProps): React.JSX.Element {
  const [step, setStep] = useState<'config' | 'preview' | 'importing' | 'done'>('config')
  const [token, setToken] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [prdName, setPrdName] = useState(initialPrdName || '')
  const [labelFilter, setLabelFilter] = useState('')
  const [includeBody, setIncludeBody] = useState(true)
  const [useLabelsAsTags, setUseLabelsAsTags] = useState(true)
  const [issues, setIssues] = useState<Issue[]>([])
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IssueImportResult | null>(null)

  // Try to detect owner/repo from git remote
  useEffect(() => {
    if (!open) return
    // Could detect from git remote here if needed
  }, [open])

  const handleFetchIssues = async () => {
    setLoading(true)
    setError(null)
    try {
      const fetchedIssues = await githubApi.listIssues(token, owner, repo, 'open')

      // Filter by label if specified
      const labels = labelFilter.split(',').map(l => l.trim()).filter(Boolean)
      const filtered = labels.length > 0
        ? fetchedIssues.filter(issue =>
            labels.some(label =>
              issue.labels.some(l => l.toLowerCase() === label.toLowerCase())
            )
          )
        : fetchedIssues

      setIssues(filtered)
      setSelectedIssues(new Set(filtered.map(i => i.number)))
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setLoading(true)
    setError(null)
    setStep('importing')
    try {
      // Get the selected labels for filtering
      const labels = labelFilter.split(',').map(l => l.trim()).filter(Boolean)

      const importResult = await githubApi.importIssuesToPrd(
        token,
        owner,
        repo,
        projectPath,
        prdName,
        labels.length > 0 ? labels : undefined,
        includeBody,
        useLabelsAsTags
      )

      setResult(importResult)
      setStep('done')

      if (importResult.importedCount > 0) {
        onSuccess?.(importResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }

  const toggleIssue = (number: number) => {
    const newSelected = new Set(selectedIssues)
    if (newSelected.has(number)) {
      newSelected.delete(number)
    } else {
      newSelected.add(number)
    }
    setSelectedIssues(newSelected)
  }

  const handleClose = () => {
    if (!loading) {
      setStep('config')
      setIssues([])
      setSelectedIssues(new Set())
      setError(null)
      setResult(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Import GitHub Issues
          </DialogTitle>
          <DialogDescription>
            {step === 'config' && 'Connect to a GitHub repository to import issues as stories.'}
            {step === 'preview' && `Found ${issues.length} issues. Select which to import.`}
            {step === 'importing' && 'Importing issues...'}
            {step === 'done' && 'Import complete!'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Configuration Step */}
          {step === 'config' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="token">GitHub Token</Label>
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_..."
                />
                <p className="text-xs text-muted-foreground">
                  Create a personal access token with repo scope at github.com/settings/tokens
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="owner">Owner</Label>
                  <Input
                    id="owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="username or org"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repo">Repository</Label>
                  <Input
                    id="repo"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="repo-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="labels">Filter by Labels (optional)</Label>
                <Input
                  id="labels"
                  value={labelFilter}
                  onChange={(e) => setLabelFilter(e.target.value)}
                  placeholder="bug, enhancement (comma-separated)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prdName">PRD Name</Label>
                <Input
                  id="prdName"
                  value={prdName}
                  onChange={(e) => setPrdName(e.target.value)}
                  placeholder="my-feature-prd"
                />
                <p className="text-xs text-muted-foreground">
                  Name for the PRD document that will be created
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeBody"
                  checked={includeBody}
                  onCheckedChange={(checked) => setIncludeBody(checked as boolean)}
                />
                <Label htmlFor="includeBody" className="text-sm">
                  Include issue body as story description
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useLabelsAsTags"
                  checked={useLabelsAsTags}
                  onCheckedChange={(checked) => setUseLabelsAsTags(checked as boolean)}
                />
                <Label htmlFor="useLabelsAsTags" className="text-sm">
                  Use issue labels as story tags
                </Label>
              </div>
            </>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {issues.map((issue) => (
                <div
                  key={issue.number}
                  className={`flex items-start gap-3 rounded border p-3 cursor-pointer transition-colors ${
                    selectedIssues.has(issue.number)
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:bg-muted/50'
                  }`}
                  onClick={() => toggleIssue(issue.number)}
                >
                  <Checkbox
                    checked={selectedIssues.has(issue.number)}
                    onCheckedChange={() => toggleIssue(issue.number)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">#{issue.number}</span>
                      <span className="text-sm font-medium truncate">{issue.title}</span>
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {issue.labels.map((label) => (
                          <Badge key={label} variant="secondary" className="text-xs">
                            <Tag className="h-2.5 w-2.5 mr-1" />
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {issues.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No issues found matching your criteria.</p>
                </div>
              )}
            </div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Importing {selectedIssues.size} issues...
              </p>
            </div>
          )}

          {/* Done Step */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  Successfully imported {result.importedCount} stories
                </span>
              </div>

              {result.skippedCount > 0 && (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">
                    {result.skippedCount} issues skipped (already exist)
                  </span>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Warnings:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {result.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.importedStoryIds.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-1">Imported stories:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.importedStoryIds.map((id) => (
                      <Badge key={id} variant="outline">
                        {id}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Error</span>
              </div>
              <p className="mt-1 text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'config' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleFetchIssues}
                disabled={loading || !token || !owner || !repo}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  'Fetch Issues'
                )}
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('config')}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={loading || selectedIssues.size === 0}
              >
                Import {selectedIssues.size} Issues
              </Button>
            </>
          )}

          {step === 'done' && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
