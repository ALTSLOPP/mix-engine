import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

function resolveTargetEntity(ctx: CmdCtx, ref?: string | number): number | undefined {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') return ctx.resolveEntity(ref);
  return ctx.getSelectedEntityId?.() ?? undefined;
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('character_motion_setup', (cmd: Extract<AICommand, { type: 'character_motion_setup' }>) => {
    const director = ctx.motionDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'MotionDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: `Entity #${entityId} has no RigidBodyComponent` });
      return;
    }

    const graph = director.getOrCreateGraph(entityId, rb, rb.mesh);

    // Create base and upper-body layers
    graph.createLayer('base', 0, 'override');
    graph.createLayer('upperBody', 1, 'override', 'upperBody');

    // Register parameters
    graph.parameters.define('speed', 'number', 0, { damping: 0.15 });
    graph.parameters.define('isCombat', 'boolean', false);
    graph.parameters.define('isGrounded', 'boolean', true);

    // Apply pack if specified
    let clipsCount = 0;
    if (cmd.packId && ctx.animRegistry) {
      const pack = ctx.animRegistry.get(cmd.packId);
      if (pack) {
        for (const entry of pack.def.entries) {
          const clip = ctx.animRegistry.getClip(cmd.packId, entry.id);
          if (clip) {
            graph.registerClip(entry.id, clip);
            clipsCount++;
          }
        }
      }
    }

    ctx.setQueryResult({
      ok: true,
      entityId,
      layers: ['base', 'upperBody'],
      parameters: ['speed', 'isCombat', 'isGrounded'],
      clipsRegistered: clipsCount,
    });
  });

  map.set('combat_motion_setup', (cmd: Extract<AICommand, { type: 'combat_motion_setup' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (!director || entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Director or entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: 'No RigidBody' });
      return;
    }

    const graph = director.getOrCreateGraph(entityId, rb, rb.mesh);
    graph.createLayer('upperBody', 1, 'override', 'upperBody');
    graph.parameters.define('comboCount', 'number', 0);
    graph.parameters.define('isAttacking', 'boolean', false);

    ctx.setQueryResult({
      ok: true,
      entityId,
      combatLayer: 'upperBody',
      rootMotionWarpingEnabled: true,
    });
  });

  map.set('locomotion_motion_setup', (cmd: Extract<AICommand, { type: 'locomotion_motion_setup' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (!director || entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Director or entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: 'No RigidBody' });
      return;
    }

    const graph = director.getOrCreateGraph(entityId, rb, rb.mesh);
    graph.parameters.define('moveX', 'number', 0, { damping: 0.1 });
    graph.parameters.define('moveZ', 'number', 0, { damping: 0.1 });
    graph.parameters.define('gait', 'number', 0, { damping: 0.2 }); // 0 = idle, 1 = walk, 2 = run

    ctx.setQueryResult({
      ok: true,
      entityId,
      locomotionMode: cmd.mode ?? 'directional',
      parameters: ['moveX', 'moveZ', 'gait'],
    });
  });

  map.set('motion_quality_report', (cmd: Extract<AICommand, { type: 'motion_quality_report' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (!director || entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Director or entity not found' });
      return;
    }

    const inspection = director.inspect(entityId);
    if (!inspection) {
      ctx.setQueryResult({ ok: false, error: 'No inspection available for entity' });
      return;
    }

    const grade = inspection.activeLayerCount > 0 ? 'AAA' : 'Basic';
    ctx.setQueryResult({
      ok: true,
      entityId,
      grade,
      activeLayers: inspection.activeLayerCount,
      rootMotionActive: inspection.rootMotion.mode !== 'off',
      inspection,
    });
  });
}
