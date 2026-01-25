// Command priority resolution for terminal custom commands
// Priority order: Project > Global > Default

import { CustomCommand } from '@/stores/customCommandsStore'

/**
 * Find overrides: returns commands grouped by effective command
 * If a project command has the same label as a global command,
 * the project command "overrides" the global one
 */
export function findCommandOverrides(
  commands: CustomCommand[]
): Map<string, { effective: CustomCommand; overrides?: CustomCommand[] }> {
  const overrideMap = new Map<string, { effective: CustomCommand; overrides?: CustomCommand[] }>()

  // Group commands by label
  const commandsByLabel = new Map<string, CustomCommand[]>()
  for (const cmd of commands) {
    if (!commandsByLabel.has(cmd.label)) {
      commandsByLabel.set(cmd.label, [])
    }
    commandsByLabel.get(cmd.label)!.push(cmd)
  }

  // For each label, determine the effective command and which ones it overrides
  for (const [label, cmds] of commandsByLabel) {
    // Sort by priority: project (0) > global (1) > local (2)
    const sortedByPriority = cmds.sort((a, b) => {
      const priorityA = a.scope === 'project' ? 0 : a.scope === 'global' ? 1 : 2
      const priorityB = b.scope === 'project' ? 0 : b.scope === 'global' ? 1 : 2
      return priorityA - priorityB
    })

    const effective = sortedByPriority[0]
    const overrides = sortedByPriority.slice(1)

    overrideMap.set(label, {
      effective,
      overrides: overrides.length > 0 ? overrides : undefined,
    })
  }

  return overrideMap
}

/**
 * Check if a command is overriding another command with the same label
 */
export function isCommandOverriding(
  command: CustomCommand,
  commands: CustomCommand[]
): CustomCommand | undefined {
  const overrides = findCommandOverrides(commands)
  const entry = overrides.get(command.label)

  if (!entry?.overrides || entry.effective.id === command.id) {
    return undefined
  }

  // Return the command this one is overriding
  return entry.overrides.find((cmd) => cmd.scope === 'global')
}

/**
 * Get the effective command for a given label
 * (the one that would actually be used, based on priority)
 */
export function getEffectiveCommand(
  label: string,
  commands: CustomCommand[]
): CustomCommand | undefined {
  const overrides = findCommandOverrides(commands)
  return overrides.get(label)?.effective
}
