// Home Dashboard - Main page container
// Provides a unified view of all projects and Ralph Loop activity

import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalStatsBar } from './GlobalStatsBar'
import { ProjectsOverview } from './ProjectsOverview'
import { QuickActionsBar } from './QuickActionsBar'
import { ProjectSetupProgress } from './ProjectSetupProgress'
import {
  useGlobalStats,
  useProjectStatuses,
  useVisibilityPolling,
} from '@/hooks/useMissionControlData'
import { useProjectStore } from '@/stores/projectStore'
import { useUIStore } from '@/stores/uiStore'
import { Repeat, ArrowRight, FolderPlus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const WELCOME_FEATURES = [
  { label: 'Context-Aware', desc: 'AI understands your code' },
  { label: 'PRD-Driven', desc: 'Define, then execute' },
  { label: 'Multi-Agent', desc: 'Parallel development' },
] as const

export function MissionControlPage() {
  const navigate = useNavigate()

  // Get data from custom hooks
  const globalStats = useGlobalStats()
  const { projectStatuses, loading: projectsLoading } = useProjectStatuses()

  // Store state
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const openProjectSwitcher = useUIStore((s) => s.openProjectSwitcher)

  // Get the active project or the first project for context card
  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : projects[0]

  // Initial data load
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Refresh all data
  const handleRefreshAll = useCallback(async () => {
    await loadProjects()
  }, [loadProjects])

  // Set up polling
  useVisibilityPolling(handleRefreshAll, 15000, true)

  const isLoading = globalStats.loading || projectsLoading

  return (
    <div className="flex flex-col min-h-full">
      {/* Global Stats Bar */}
      <GlobalStatsBar stats={globalStats} loading={globalStats.loading} />

      {/* Main Content */}
      <div className="flex-1">
        <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Home</h1>
              <p className="text-sm text-muted-foreground">
                Overview of all projects and Ralph Loop activity
              </p>
            </div>
            <QuickActionsBar onRefreshAll={handleRefreshAll} isRefreshing={isLoading} />
          </div>

          {/* Welcome message for new users with no projects */}
          {projects.length === 0 && !projectsLoading && (
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
              {/* Decorative background elements */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/3 blur-3xl" />
              </div>

              <CardContent className="relative p-6 sm:p-8">
                <div className="max-w-lg space-y-6">
                  {/* Animated icon */}
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>

                  {/* Welcome text */}
                  <div className="space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                      Welcome to Ralph UI
                    </h2>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      Orchestrate autonomous AI coding agents across your projects using the Ralph Wiggum Loop technique.
                    </p>
                  </div>

                  {/* Feature highlights */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {WELCOME_FEATURES.map((feature) => (
                      <div key={feature.label} className="p-3 rounded-lg bg-background/60 backdrop-blur-sm border border-border/50">
                        <p className="text-sm font-medium">{feature.label}</p>
                        <p className="text-xs text-muted-foreground">{feature.desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <Button size="lg" className="group w-fit" onClick={openProjectSwitcher}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Add Your First Project
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ralph Loop Quick Access Card - Only shown when there are active executions */}
          {globalStats.activeExecutionsCount > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Ralph Loop</CardTitle>
                  </div>
                  <Button onClick={() => navigate('/ralph-loop')} size="sm" className="w-fit">
                    Go to Ralph Loop
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
                <CardDescription>
                  Autonomous AI coding sessions running with the Ralph Wiggum Loop technique
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{globalStats.activeExecutionsCount}</span>
                    <span className="text-muted-foreground">
                      active execution{globalStats.activeExecutionsCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project Setup Progress - Shows for active project that needs setup */}
          {activeProject && (
            <ProjectSetupProgress project={activeProject} />
          )}

          {/* Projects Overview */}
          <ProjectsOverview projectStatuses={projectStatuses} loading={projectsLoading} />
        </div>
      </div>
    </div>
  )
}
