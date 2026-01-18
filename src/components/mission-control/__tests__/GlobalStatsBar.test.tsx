import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlobalStatsBar } from '../GlobalStatsBar'
import type { GlobalStats } from '@/hooks/useMissionControlData'

describe('GlobalStatsBar', () => {
  const mockStats: GlobalStats = {
    activeAgentsCount: 5,
    tasksInProgress: 12,
    tasksCompletedToday: 8,
    totalTasksToday: 20,
    totalCostToday: 2.50,
    activeProjectsCount: 3,
    totalProjects: 5,
  }

  it('should render active agents count', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Active Agents')).toBeInTheDocument()
  })

  it('should render tasks today with progress format', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    // Format is tasksCompletedToday/totalTasksToday
    expect(screen.getByText('8/20')).toBeInTheDocument()
    expect(screen.getByText('Tasks Today')).toBeInTheDocument()
  })

  it('should render tasks in progress as subtext', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    expect(screen.getByText('12 in progress')).toBeInTheDocument()
  })

  it('should render total cost formatted as currency', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    expect(screen.getByText('$2.50')).toBeInTheDocument()
    expect(screen.getByText('Cost Today')).toBeInTheDocument()
  })

  it('should render active projects with total', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    // Format is activeProjectsCount/totalProjects when active > 0
    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('should show loading skeleton when loading', () => {
    render(<GlobalStatsBar stats={mockStats} loading={true} />)

    // Should have skeleton elements
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should handle zero values correctly', () => {
    const zeroStats: GlobalStats = {
      activeAgentsCount: 0,
      tasksInProgress: 0,
      tasksCompletedToday: 0,
      totalTasksToday: 0,
      totalCostToday: 0,
      activeProjectsCount: 0,
      totalProjects: 0,
    }

    render(<GlobalStatsBar stats={zeroStats} loading={false} />)

    // Should display zeros
    expect(screen.getByText('$0.00')).toBeInTheDocument()
    expect(screen.getByText('All idle')).toBeInTheDocument()
    expect(screen.getByText('None active')).toBeInTheDocument()
  })

  it('should show Live indicator when agents are active', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('should not show Live indicator when no agents are active', () => {
    const idleStats = { ...mockStats, activeAgentsCount: 0 }
    render(<GlobalStatsBar stats={idleStats} loading={false} />)

    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })

  it('should format large cost values correctly', () => {
    const largeStats = {
      ...mockStats,
      totalCostToday: 1234.56,
    }

    render(<GlobalStatsBar stats={largeStats} loading={false} />)

    expect(screen.getByText('$1234.56')).toBeInTheDocument()
  })

  it('should format small cost values correctly', () => {
    const smallStats = {
      ...mockStats,
      totalCostToday: 0.01,
    }

    render(<GlobalStatsBar stats={smallStats} loading={false} />)

    expect(screen.getByText('$0.01')).toBeInTheDocument()
  })

  it('should show Working subtext when agents are active', () => {
    render(<GlobalStatsBar stats={mockStats} loading={false} />)

    expect(screen.getByText('Working')).toBeInTheDocument()
  })
})
