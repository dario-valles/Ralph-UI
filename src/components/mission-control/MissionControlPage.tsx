// Mission Control Dashboard - Main page container
// Provides a unified view of all projects and Ralph Loop activity

import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalStatsBar } from './GlobalStatsBar'
import { ProjectsOverview } from './ProjectsOverview'
import { QuickActionsBar } from './QuickActionsBar'
import {
  useGlobalStats,
  useProjectStatuses,
  useVisibilityPolling,
} from '@/hooks/useMissionControlData'
import { useProjectStore } from '@/stores/projectStore'
import { Repeat, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function MissionControlPage() {
  const navigate = useNavigate()

  // Get data from custom hooks
  const globalStats = useGlobalStats()
  const { projectStatuses, loading: projectsLoading } = useProjectStatuses()

  // Store actions for refreshing
  const loadProjects = useProjectStore(s => s.loadProjects)

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
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Mission Control</h1>
              <p className="text-sm text-muted-foreground">
                Overview of all projects and Ralph Loop activity
              </p>
            </div>
            <QuickActionsBar
              onRefreshAll={handleRefreshAll}
              isRefreshing={isLoading}
            />
          </div>

          {/* Ralph Loop Quick Access Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Ralph Loop</CardTitle>
                </div>
                <Button onClick={() => navigate('/ralph-loop')} size="sm">
                  Go to Ralph Loop
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
              <CardDescription>
                Start autonomous AI coding sessions with the Ralph Wiggum Loop technique
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{globalStats.activeExecutionsCount}</span>
                  <span className="text-muted-foreground">active execution{globalStats.activeExecutionsCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Projects Overview */}
          <ProjectsOverview
            projectStatuses={projectStatuses}
            loading={projectsLoading}
          />
        </div>
      </div>
    </div>
  )
}
