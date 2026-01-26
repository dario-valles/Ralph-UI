import { ProgressViewer } from './ProgressViewer'

export interface ProgressPanelProps {
  content: string
}

export function ProgressPanel({ content }: ProgressPanelProps): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto p-3">
      <ProgressViewer content={content} />
    </div>
  )
}
