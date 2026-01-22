import { RalphLoopDashboard } from '@/components/ralph-loop/RalphLoopDashboard'

interface PRDExecutionTabProps {
  projectPath: string
  prdName: string
}

export function PRDExecutionTab({ projectPath, prdName }: PRDExecutionTabProps) {
  return (
    <div className="p-4">
      <RalphLoopDashboard projectPath={projectPath} prdName={prdName} />
    </div>
  )
}
