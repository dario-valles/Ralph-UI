/**
 * Centralized status configuration for badges and indicators
 *
 * This file provides consistent status styling across the application.
 */

import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  Play,
  Pause,
  type LucideIcon,
} from 'lucide-react'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'info'

interface StatusConfig {
  icon: LucideIcon
  variant: BadgeVariant
  label: string
}

/**
 * Task status configuration
 */
export const taskStatusConfig: Record<string, StatusConfig> = {
  pending: { icon: Circle, variant: 'secondary', label: 'Pending' },
  in_progress: { icon: Clock, variant: 'info', label: 'In Progress' },
  completed: { icon: CheckCircle2, variant: 'success', label: 'Completed' },
  failed: { icon: XCircle, variant: 'destructive', label: 'Failed' },
}

/**
 * Session status configuration
 */
export const sessionStatusConfig: Record<string, StatusConfig> = {
  active: { icon: Play, variant: 'default', label: 'Active' },
  paused: { icon: Pause, variant: 'secondary', label: 'Paused' },
  completed: { icon: CheckCircle2, variant: 'outline', label: 'Completed' },
  failed: { icon: XCircle, variant: 'destructive', label: 'Failed' },
}

/**
 * Agent status configuration
 */
export const agentStatusConfig: Record<string, StatusConfig> = {
  idle: { icon: Circle, variant: 'secondary', label: 'Idle' },
  thinking: { icon: Clock, variant: 'info', label: 'Thinking' },
  reading: { icon: Clock, variant: 'info', label: 'Reading' },
  implementing: { icon: Clock, variant: 'info', label: 'Implementing' },
  testing: { icon: Clock, variant: 'info', label: 'Testing' },
  committing: { icon: CheckCircle2, variant: 'success', label: 'Committing' },
}

/**
 * Get status config with fallback
 */
export function getStatusConfig(
  config: Record<string, StatusConfig>,
  status: string,
  fallback?: StatusConfig
): StatusConfig {
  return config[status] || fallback || { icon: Circle, variant: 'secondary', label: status }
}
