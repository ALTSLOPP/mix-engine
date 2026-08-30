import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

/**
 * SpawnerCommands — text-first surface for declarative entity spawners. Define a spawner
 * once (blueprint + area + caps + per-spawn onSpawn config), then start/stop it; chain
 * `spawner_cleared` (via gameplay rules) for waves. No-op (with a warning) if no system.
 */
export function register(map: CommandMap, ctx: CmdCtx): void {
  const warn = (cmd: string) =>
    console.warn(`[AIBridge] ${cmd}: spawner system unavailable (no SpawnerSystem wired).`);

  map.set('spawner_create', (cmd: Extract<AICommand, { type: 'spawner_create' }>) => {
    if (!ctx.spawner) return warn('spawner_create');
    ctx.spawner.create(cmd.def);
  });

  map.set('spawner_start', (cmd: Extract<AICommand, { type: 'spawner_start' }>) => {
    if (!ctx.spawner) return warn('spawner_start');
    ctx.spawner.start(cmd.id);
  });

  map.set('spawner_stop', (cmd: Extract<AICommand, { type: 'spawner_stop' }>) => {
    if (!ctx.spawner) return warn('spawner_stop');
    ctx.spawner.stop(cmd.id);
  });

  map.set('spawner_remove', (cmd: Extract<AICommand, { type: 'spawner_remove' }>) => {
    if (!ctx.spawner) return warn('spawner_remove');
    ctx.spawner.remove(cmd.id);
  });

  map.set('spawner_clear', (cmd: Extract<AICommand, { type: 'spawner_clear' }>) => {
    if (!ctx.spawner) return warn('spawner_clear');
    ctx.spawner.clearSpawned(cmd.id);
  });

  map.set('spawner_status', (cmd: Extract<AICommand, { type: 'spawner_status' }>) => {
    if (!ctx.spawner) return warn('spawner_status');
    ctx.setQueryResult(ctx.spawner.status(cmd.id));
  });
}
