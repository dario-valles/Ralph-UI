import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RalphLoopDashboard } from './RalphLoopDashboard'
import { useProjectStore } from '@/stores/projectStore'
import { useRalphLoopStore } from '@/stores/ralphLoopStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { FolderOpen, AlertCircle, ArrowLeft } from 'lucide-react'

export function RalphLoopPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projects, getActiveProject, setActiveProject, loadProjects } = useProjectStore()
  const { ralphFiles, checkRalphFiles } = useRalphLoopStore()

  // Get project path from URL params or active project
  const projectPathParam = searchParams.get('project')
  const activeProject = getActiveProject()
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(
    projectPathParam || activeProject?.path || null
  )

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

  // No project selected
  if (!selectedProjectPath) {
    return (
      <div className="container py-6">
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
                  <option value="" disabled>Select a project...</option>
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
    const projectName = projects.find((p) => p.path === selectedProjectPath)?.name || selectedProjectPath

    return (
      <div className="container py-6">
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
                  This project doesn't have a Ralph PRD yet. Create one by exporting from PRD Chat
                  or initialize manually at <code className="text-xs bg-muted px-1 py-0.5 rounded">.ralph/prd.json</code>
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

  const projectName = projects.find((p) => p.path === selectedProjectPath)?.name || selectedProjectPath

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedProjectPath(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Ralph Wiggum Loop</h1>
            <p className="text-muted-foreground">{projectName}</p>
          </div>
        </div>

        {/* Project selector */}
        <Select
          className="w-[200px]"
          value={selectedProjectPath || ''}
          onChange={(e) => handleProjectChange(e.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.path}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>

      <RalphLoopDashboard projectPath={selectedProjectPath} />
    </div>
  )
}
