import { Layers, FileText, CheckSquare, Sparkles } from 'lucide-react'

export interface SlashCommand {
  id: string
  label: string
  description: string
  template: string
  icon: React.ReactNode
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'epic',
    label: 'Epic',
    description: 'Insert an Epic template',
    template: '### Epic: [Title]\n**Description:** [Description]\n',
    icon: <Layers className="h-4 w-4 mr-2" />,
  },
  {
    id: 'story',
    label: 'User Story',
    description: 'Insert a User Story template',
    template: '#### US-X.X: [Title]\n**As a** [user],\n**I want** [action],\n**So that** [benefit].\n\n**Acceptance Criteria:**\n- [Criterion 1]\n',
    icon: <FileText className="h-4 w-4 mr-2" />,
  },
  {
    id: 'task',
    label: 'Task',
    description: 'Insert a Task template',
    template: '- [ ] Task: [Title]\n',
    icon: <CheckSquare className="h-4 w-4 mr-2" />,
  },
  {
    id: 'critique',
    label: 'Critique',
    description: 'Ask for a critique of the current PRD',
    template: 'Please critique the current requirements for clarity, completeness, and feasibility.',
    icon: <Sparkles className="h-4 w-4 mr-2" />,
  },
]
