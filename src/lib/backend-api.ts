// Backend API wrappers
// All commands are proxied through HTTP to the Rust/Axum backend server.
//
// This file re-exports from domain-specific API modules in src/lib/api/
// for backwards compatibility. New code should import directly from the modules.

// Re-export all API modules
export {
  sessionApi,
  projectApi,
  prdApi,
  prdChatApi,
  missionControlApi,
  ralphLoopApi,
  gsdApi,
  templateApi,
} from './api'

// Re-export types for backwards compatibility
export type {
  AgentAvailabilityResult,
  WatchFileResponse,
  ActivityEvent,
  GlobalStats,
} from './api'
