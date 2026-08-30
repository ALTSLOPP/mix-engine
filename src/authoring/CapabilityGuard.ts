/**
 * CapabilityGuard — Capability-based access control and privilege enforcement for AI agents.
 */

import { CommandRegistry } from '../commands/CommandRegistry';
import type { PermissionCapability } from '../commands/types';

export const ROLE_CAPABILITIES: Record<string, PermissionCapability[]> = {
  admin: [
    'scene.read',
    'scene.write',
    'runtime.mutate',
    'destructive.clear',
    'asset.import',
    'package.build',
    'physics.read' as any,
    'physics.write' as any,
    'engine.admin' as any,
  ],
  level_designer: [
    'scene.read',
    'scene.write',
    'asset.import',
  ],
  script_author: [
    'scene.read',
    'scene.write',
    'script.attach',
  ],
  viewer: [
    'scene.read',
    'system.read',
  ],
};

export class CapabilityGuard {
  /**
   * Checks if an agent with given roles or explicit capabilities is allowed to run a command.
   */
  static isCommandAllowed(
    agentRolesOrCaps: string[],
    commandType: string
  ): { allowed: boolean; reason?: string } {
    const def = CommandRegistry.get(commandType);
    if (!def) {
      return { allowed: false, reason: `Unknown command type '${commandType}'.` };
    }

    const requiredCap = def.capability;
    if (!requiredCap) {
      return { allowed: true };
    }

    // Expand agent roles to active capabilities
    const activeCaps = new Set<string>();
    for (const token of agentRolesOrCaps) {
      if (token in ROLE_CAPABILITIES) {
        for (const c of ROLE_CAPABILITIES[token]) activeCaps.add(c);
      } else {
        activeCaps.add(token);
      }
    }

    if (activeCaps.has('engine.admin') || activeCaps.has(requiredCap)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Agent does not hold required capability '${requiredCap}' to execute command '${commandType}'.`,
    };
  }
}
