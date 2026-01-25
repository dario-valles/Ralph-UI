// Template API wrappers
// Combines template functionality from backend-api.ts and config-api.ts

import type { TemplateInfo, TemplatePreviewResult, RenderRequest } from '@/types'
import { invoke } from '../invoke'

export const templateApi = {
  /** List all available templates (project, global, builtin) */
  list: async (projectPath?: string): Promise<TemplateInfo[]> => {
    return await invoke('list_templates', { projectPath })
  },

  /** Get template content by name */
  getContent: async (name: string, projectPath?: string): Promise<string> => {
    return await invoke('get_template_content', { name, projectPath })
  },

  /** Save a template to project or global scope */
  save: async (
    name: string,
    content: string,
    scope: 'project' | 'global',
    projectPath?: string
  ): Promise<void> => {
    return await invoke('save_template', { name, content, scope, projectPath })
  },

  /** Delete a template from project or global scope */
  delete: async (
    name: string,
    scope: 'project' | 'global',
    projectPath?: string
  ): Promise<void> => {
    return await invoke('delete_template', { name, scope, projectPath })
  },

  /** List builtin template names */
  listBuiltin: async (): Promise<string[]> => {
    return await invoke('list_builtin_templates')
  },

  /** Preview a template with sample context (US-013) */
  preview: async (content: string, projectPath?: string): Promise<TemplatePreviewResult> => {
    return await invoke('preview_template', { content, projectPath })
  },

  /** Render a template with context */
  render: async (request: RenderRequest): Promise<string> => {
    return await invoke('render_template', { request })
  },

  /** Render task prompt using template system */
  renderTaskPrompt: async (taskId: string, templateName?: string): Promise<string> => {
    return await invoke('render_task_prompt', { taskId, templateName })
  },
}
