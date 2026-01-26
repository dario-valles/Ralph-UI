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
              <TabsTrigger
                value="stories"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <CheckCircle2 className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline">Stories </span>({prdStatus?.passed ?? 0}/
                {prdStatus?.total ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="progress"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <BookOpen className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline">Progress </span>(
                {progressSummary?.learningsCount ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="terminal"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <Terminal className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Terminal
              </TabsTrigger>
              <TabsTrigger
                value="commits"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <GitCommit className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Commits</span>
                <span className="sm:hidden">Git</span>
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <Clock className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">
                  History ({iterationHistory?.length ?? 0})
                </span>
                <span className="sm:hidden">{iterationHistory?.length ?? 0}</span>
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <Users className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Agents
              </TabsTrigger>
              <TabsTrigger
                value="learnings"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <BookOpen className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Learnings
              </TabsTrigger>
              <TabsTrigger
                value="brief"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[10px] sm:text-xs py-1 sm:py-1.5 px-1.5 sm:px-2 whitespace-nowrap"
              >
                <FileText className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Brief
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
