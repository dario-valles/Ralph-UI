import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CheckCircle2,
  BookOpen,
  Terminal,
  GitCommit,
  Clock,
  Users,
  FileText,
  Loader2,
  Sparkles,
  Lightbulb,
} from 'lucide-react'
import type { RalphPrd, RalphPrdStatus, RalphProgressSummary, RalphStory, IterationRecord } from '@/types'
import type { CommitInfo } from '@/lib/git-api'
import { StoriesPanel } from './StoriesPanel'
import { ProgressPanel } from './ProgressPanel'
import { TerminalPanel } from './TerminalPanel'
import { GitPanel } from './GitPanel'
import { IterationHistoryView } from './IterationHistoryView'
import { AssignmentsPanel } from './AssignmentsPanel'
import { LearningsPanel } from './LearningsPanel'
import { BriefViewer } from './BriefViewer'

export interface DashboardTabsProps {
  // Data
  prd: RalphPrd
  prdStatus: RalphPrdStatus | null
  progress: string
  progressSummary: RalphProgressSummary | null
  commits: CommitInfo[]
  iterationHistory: IterationRecord[]

  // Execution state
  currentAgentId: string | null
  activeExecutionId: string | null
  isRunning: boolean
  regeneratingStories: boolean

  // Tab state
  activeTab: string
  setActiveTab: (tab: string) => void

  // Tree view
  isTreeVisible: boolean
  panelHeight: number
  containerRef: React.RefObject<HTMLDivElement | null>
  onToggleTreeView: () => void
  onResizeStart: (e: React.MouseEvent) => void

  // Actions
  onToggleStory: (story: RalphStory) => void
  onRegenerateClick: () => void

  // Props for child components
  projectPath: string
  prdName: string
}

export function DashboardTabs({
  prd,
  prdStatus,
  progress,
  progressSummary,
  commits,
  iterationHistory,
  currentAgentId,
  activeExecutionId,
  isRunning,
  regeneratingStories,
  activeTab,
  setActiveTab,
  isTreeVisible,
  panelHeight,
  containerRef,
  onToggleTreeView,
  onResizeStart,
  onToggleStory,
  onRegenerateClick,
  projectPath,
  prdName,
}: DashboardTabsProps): React.JSX.Element {
  return (
    <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col h-full min-h-0"
      >
        <div className="flex items-center justify-between border-b px-1 sm:px-2 flex-shrink-0 gap-1">
          {/* Horizontally scrollable tabs on mobile */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
            <TabsList className="justify-start rounded-none h-auto p-0 border-b-0 bg-transparent inline-flex w-max">
              {/* Stories - Primary tab */}
              <TabsTrigger
                value="stories"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={`Stories (${prdStatus?.passed ?? 0}/${prdStatus?.total ?? 0})`}
              >
                <CheckCircle2 className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">
                  ({prdStatus?.passed ?? 0}/{prdStatus?.total ?? 0})
                </span>
                {/* Mobile badge indicator */}
                {(prdStatus?.total ?? 0) > 0 && (
                  <span className="sm:hidden ml-0.5 text-[9px] font-medium">
                    {prdStatus?.passed ?? 0}/{prdStatus?.total ?? 0}
                  </span>
                )}
              </TabsTrigger>

              {/* Progress */}
              <TabsTrigger
                value="progress"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={`Progress (${progressSummary?.learningsCount ?? 0})`}
              >
                <BookOpen className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">
                  Progress ({progressSummary?.learningsCount ?? 0})
                </span>
              </TabsTrigger>

              {/* Terminal */}
              <TabsTrigger
                value="terminal"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Terminal"
              >
                <Terminal className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Terminal</span>
              </TabsTrigger>

              {/* Git */}
              <TabsTrigger
                value="commits"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Git Commits"
              >
                <GitCommit className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Git</span>
              </TabsTrigger>

              {/* History */}
              <TabsTrigger
                value="history"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={`History (${iterationHistory?.length ?? 0})`}
              >
                <Clock className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">
                  History ({iterationHistory?.length ?? 0})
                </span>
                {(iterationHistory?.length ?? 0) > 0 && (
                  <span className="sm:hidden ml-0.5 text-[9px] font-medium">
                    {iterationHistory?.length ?? 0}
                  </span>
                )}
              </TabsTrigger>

              {/* Agents */}
              <TabsTrigger
                value="agents"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Agents"
              >
                <Users className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Agents</span>
              </TabsTrigger>

              {/* Learnings */}
              <TabsTrigger
                value="learnings"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Learnings"
              >
                <Lightbulb className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Learnings</span>
              </TabsTrigger>

              {/* Brief */}
              <TabsTrigger
                value="brief"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Brief"
              >
                <FileText className="h-4 w-4 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Brief</span>
              </TabsTrigger>
            </TabsList>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 sm:h-7 text-[10px] sm:text-xs px-1.5 sm:px-2 flex-shrink-0"
            onClick={onRegenerateClick}
            disabled={regeneratingStories || isRunning}
            title="Use AI to extract properly formatted user stories from PRD"
          >
            {regeneratingStories ? (
              <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin sm:mr-1" />
            ) : (
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1" />
            )}
            <span className="hidden sm:inline">Regenerate</span>
          </Button>
        </div>

        <TabsContent value="stories" className="p-0 mt-0 flex-1 min-h-0 overflow-hidden">
          <StoriesPanel
            stories={prd.stories}
            prdStatus={prdStatus}
            onToggleStory={onToggleStory}
          />
        </TabsContent>

        <TabsContent value="progress" className="p-0 mt-0 flex-1 min-h-0 overflow-hidden">
          <ProgressPanel content={progress} />
        </TabsContent>

        <TabsContent value="terminal" className="p-0 mt-0 flex-1 min-h-0 overflow-hidden">
          <TerminalPanel
            currentAgentId={currentAgentId}
            activeExecutionId={activeExecutionId}
            isTreeVisible={isTreeVisible}
            panelHeight={panelHeight}
            containerRef={containerRef}
            onToggleTreeView={onToggleTreeView}
            onResizeStart={onResizeStart}
          />
        </TabsContent>

        <TabsContent value="commits" className="p-0 mt-0 flex-1 min-h-0 overflow-hidden">
          <GitPanel commits={commits} />
        </TabsContent>

        <TabsContent value="history" className="p-0 mt-0 flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto p-4">
            <IterationHistoryView iterations={iterationHistory ?? []} />
          </div>
        </TabsContent>

        <TabsContent value="agents" className="p-0 mt-0">
          <div className="p-4">
            <AssignmentsPanel
              projectPath={projectPath}
              prdName={prdName}
              stories={prd?.stories ?? []}
              autoRefresh={!!activeExecutionId}
              refreshInterval={3000}
            />
          </div>
        </TabsContent>

        <TabsContent value="learnings" className="p-0 mt-0">
          <div className="p-4">
            <LearningsPanel projectPath={projectPath} prdName={prdName} stories={prd.stories} />
          </div>
        </TabsContent>

        <TabsContent value="brief" className="p-0 mt-0">
          <div className="p-4">
            <BriefViewer projectPath={projectPath} prdName={prdName} />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
