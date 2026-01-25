// PRD API wrappers (File-based storage only)

import type { PRDFile, DeletePrdResult } from '@/types'
import { invoke } from '../invoke'

export const prdApi = {
  /** Scan .ralph-ui/prds/ directory for PRD markdown files */
  scanFiles: async (projectPath: string): Promise<PRDFile[]> => {
    return await invoke('scan_prd_files', { projectPath })
  },

  /** Get a PRD file by name */
  getFile: async (projectPath: string, prdName: string): Promise<PRDFile> => {
    return await invoke('get_prd_file', { projectPath, prdName })
  },

  /** Update a PRD file's content */
  updateFile: async (projectPath: string, prdName: string, content: string): Promise<PRDFile> => {
    return await invoke('update_prd_file', { projectPath, prdName, content })
  },

  /** Delete a PRD file and all related resources (JSON, progress, worktrees, branches) */
  deleteFile: async (projectPath: string, prdName: string): Promise<DeletePrdResult> => {
    return await invoke('delete_prd_file', { projectPath, prdName })
  },
}
