import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RalphLoopDashboard } from './RalphLoopDashboard'
import { useProjectStore } from '@/stores/projectStore'
import { useRalphLoopStore } from '@/stores/ralphLoopStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect as Select } from '@/components/ui/select'
import { FolderOpen, AlertCircle, ArrowLeft, RefreshCw, GitBranch } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

export function RalphLoopPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projects, getActiveProject, setActiveProject, loadProjects } = useProjectStore()
  const { ralphFiles, checkRalphFiles, loading } = useRalphLoopStore()

  // Get project path and PRD name from URL params or active project
  const projectPathParam = searchParams.get('project')
  const prdNameParam = searchParams.get('prd')
  const activeProject = getActiveProject()
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(
    projectPathParam || activeProject?.path || null
  )
  const [selectedPrdName, setSelectedPrdName] = useState<string | null>(prdNameParam)

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Check for Ralph files when project changes
  useEffect(() => {
    if (selectedProjectPath) {
      checkRalphFiles(selectedProjectPath)
    }
  }, [selectedProjectPath, checkRalphFiles])

  // Update URL when project changes
  const handleProjectChange = (path: string) => {
    setSelectedProjectPath(path)
    const project = projects.find((p) => p.path === path)
    if (project) {
      setActiveProject(project.id)
    }
    navigate(`/ralph-loop?project=${encodeURIComponent(path)}`, { replace: true })
  }

  // Update URL when PRD changes
  const handlePrdChange = (prdName: string) => {
    setSelectedPrdName(prdName)
    if (selectedProjectPath) {
      navigate(
        `/ralph-loop?project=${encodeURIComponent(selectedProjectPath)}&prd=${encodeURIComponent(prdName)}`,
        { replace: true }
      )
    }
  }

  // No project selected
  if (!selectedProjectPath) {
    return (
      <div className="px-3 py-2">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Ralph Wiggum Loop</h1>
          <p className="text-muted-foreground">
            External orchestration for autonomous PRD execution
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">Select a Project</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a project to view or start a Ralph Loop execution
                </p>
              </div>

              {projects.length > 0 ? (
                <Select
                  className="w-[300px]"
                  value=""
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  <option value="" disabled>
                    Select a project...
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.path}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No projects registered. Register a project first.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Project selected but no Ralph files
  if (ralphFiles && !ralphFiles.hasPrd) {
    const projectName =
      projects.find((p) => p.path === selectedProjectPath)?.name || selectedProjectPath

    return (
      <div className="px-3 py-2">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedProjectPath(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Ralph Wiggum Loop</h1>
            <p className="text-muted-foreground">{projectName}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">No Ralph PRD Found</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  This project doesn't have a Ralph PRD yet. Create one by using PRD Chat or from
                  the PRD list. PRDs are stored in{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">.ralph-ui/prds/</code>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/prds/chat')}>
                  Go to PRD Chat
                </Button>
                <Button variant="outline" onClick={() => setSelectedProjectPath(null)}>
                  Choose Different Project
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const projectName =
    projects.find((p) => p.path === selectedProjectPath)?.name || selectedProjectPath

  // If we have PRDs but none selected, show the selection list
  if (!selectedPrdName && ralphFiles && ralphFiles.prdNames.length > 0) {
    return (
      <div className="px-3 py-2">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProjectPath(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Select PRD to Execute</h1>
              <p className="text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => checkRalphFiles(selectedProjectPath!)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {ralphFiles.prdNames.map((name) => (
                  <div
                    key={name}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => handlePrdChange(name)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <GitBranch className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {ralphFiles.hasProgress ? 'Has progress history' : 'Ready to start'}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 h-full flex flex-col min-h-0">
      <div className="mb-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              // If going back from dashboard, go to list if multiple PRDs exist
              if (selectedPrdName && ralphFiles && ralphFiles.prdNames.length > 1) {
                setSelectedPrdName(null)
                navigate(`/ralph-loop?project=${encodeURIComponent(selectedProjectPath!)}`, {
                  replace: true,
                })
              } else {
                setSelectedProjectPath(null)
              }
            }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold">Ralph Wiggum Loop</h1>
        </div>

        {/* PRD selector (if multiple PRDs exist) */}
        {selectedPrdName && ralphFiles && ralphFiles.prdNames.length > 1 && (
          <Select
            className="w-[200px]"
            value={selectedPrdName}
            onChange={(e) => handlePrdChange(e.target.value)}
          >
            {ralphFiles.prdNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {selectedPrdName ? (
        <div className="flex-1 min-h-0">
          <RalphLoopDashboard projectPath={selectedProjectPath} prdName={selectedPrdName} />
        </div>
      ) : (
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>
              No PRD name specified in URL. File-based PRDs require a <code>prd</code> parameter.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
