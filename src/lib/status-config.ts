/**
 * Centralized status configuration for badges and indicators
 *
 * This file provides consistent status styling across the application.
 */

import { CheckCircle2, Circle, Clock, XCircle, type LucideIcon } from 'lucide-react'

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
