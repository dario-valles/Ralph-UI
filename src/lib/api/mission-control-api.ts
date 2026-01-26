// Mission Control API wrappers

import { invoke } from '../invoke'
import type { ActivityEvent, GlobalStats } from './types'

export const missionControlApi = {
  /** Get activity feed for Mission Control dashboard */
  getActivityFeed: async (limit?: number, offset?: number): Promise<ActivityEvent[]> => {
    return await invoke('get_activity_feed', { limit, offset })
  },

  /** Get global statistics for Mission Control dashboard */
  getGlobalStats: async (): Promise<GlobalStats> => {
    return await invoke('get_global_stats')
  },
}
