import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

function resolveTargetEntity(ctx: CmdCtx, ref?: string | number): number | undefined {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') return ctx.resolveEntity(ref);
  return ctx.getSelectedEntityId?.() ?? undefined;
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('motion_play', (cmd: Extract<AICommand, { type: 'motion_play' }>) => {
    const director = ctx.motionDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'MotionDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: `Entity '${cmd.entityId}' not found` });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} has no RigidBodyComponent` });
      return;
    }

    const graph = director.getOrCreateGraph(entityId, rb, rb.mesh);

    // If pack is specified, preload clip from pack registry if not registered
    if (cmd.packId && ctx.animRegistry) {
      const clip = ctx.animRegistry.getClip(cmd.packId, cmd.clip);
      if (clip && !graph.hasClip(cmd.clip)) {
        graph.registerClip(cmd.clip, clip);
      }
    }

    try {
      const handle = graph.play(cmd.clip, {
        layer: cmd.layer ?? 'base',
        fade: cmd.fade ?? 0.2,
        speed: cmd.speed ?? 1.0,
        loop: cmd.loop ?? true,
        rootMotion: cmd.rootMotion,
      });

      ctx.setQueryResult({
        ok: true,
        entityId,
        stateId: handle.id,
        clip: cmd.clip,
        layer: cmd.layer ?? 'base',
        duration: handle.duration,
      });
    } catch (err) {
      ctx.setQueryResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  map.set('motion_stop', (cmd: Extract<AICommand, { type: 'motion_stop' }>) => {
    const director = ctx.motionDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'MotionDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId !== undefined) {
      director.stop(entityId, cmd.fade ?? 0.2, cmd.layer);
      ctx.setQueryResult({ ok: true, entityId });
    } else {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
    }
  });

  map.set('motion_pause', (cmd: Extract<AICommand, { type: 'motion_pause' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const g = director.getGraph(entityId);
      g?.pause();
      ctx.setQueryResult({ ok: true, entityId });
    } else {
      ctx.setQueryResult({ ok: false, error: 'Graph not found' });
    }
  });

  map.set('motion_resume', (cmd: Extract<AICommand, { type: 'motion_resume' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const g = director.getGraph(entityId);
      g?.resume();
      ctx.setQueryResult({ ok: true, entityId });
    } else {
      ctx.setQueryResult({ ok: false, error: 'Graph not found' });
    }
  });

  map.set('motion_crossfade', (cmd: Extract<AICommand, { type: 'motion_crossfade' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const handle = director.play(entityId, cmd.targetClip, {
        layer: cmd.layer ?? 'base',
        fade: cmd.fade ?? 0.25,
      });
      ctx.setQueryResult({ ok: true, entityId, stateId: handle?.id });
    } else {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
    }
  });

  map.set('motion_layer_create', (cmd: Extract<AICommand, { type: 'motion_layer_create' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const g = director.getGraph(entityId);
      if (g) {
        g.createLayer(cmd.name, cmd.index, cmd.blendMode ?? 'override', cmd.mask);
        ctx.setQueryResult({ ok: true, entityId, layerName: cmd.name });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Graph not found' });
  });

  map.set('motion_layer_weight', (cmd: Extract<AICommand, { type: 'motion_layer_weight' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const g = director.getGraph(entityId);
      if (g) {
        g.setLayerWeight(cmd.layer, cmd.weight, cmd.fade ?? 0.2);
        ctx.setQueryResult({ ok: true, entityId, layer: cmd.layer, weight: cmd.weight });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Graph not found' });
  });

  map.set('motion_parameter_set', (cmd: Extract<AICommand, { type: 'motion_parameter_set' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const g = director.getGraph(entityId);
      if (g) {
        g.parameters.set(cmd.name, cmd.value as any, cmd.damping ?? 0);
        ctx.setQueryResult({ ok: true, name: cmd.name, value: cmd.value });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Graph not found' });
  });

  map.set('motion_parameter_get', (cmd: Extract<AICommand, { type: 'motion_parameter_get' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const g = director.getGraph(entityId);
      if (g) {
        const val = g.parameters.get(cmd.name);
        ctx.setQueryResult({ ok: true, name: cmd.name, value: val });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Parameter not found' });
  });

  map.set('motion_graph_inspect', (cmd: Extract<AICommand, { type: 'motion_graph_inspect' }>) => {
    const director = ctx.motionDirector;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (director && entityId !== undefined) {
      const info = director.inspect(entityId);
      ctx.setQueryResult({ ok: true, inspection: info });
    } else {
      ctx.setQueryResult({ ok: false, error: 'Graph not found' });
    }
  });

  map.set('motion_preview', (cmd: Extract<AICommand, { type: 'motion_preview' }>) => {
    const director = ctx.motionDirector;
    let targetId: number | null = null;
    if (typeof cmd.entityId === 'number') targetId = cmd.entityId;
    else targetId = ctx.getSelectedEntityId?.() ?? null;

    if (director && targetId !== null) {
      const rb = ctx.sceneManager.getRigidBody(targetId);
      if (rb) {
        const g = director.getOrCreateGraph(targetId, rb, rb.mesh);
        if (cmd.packId && ctx.animRegistry) {
          const clip = ctx.animRegistry.getClip(cmd.packId, cmd.clip);
          if (clip && !g.hasClip(cmd.clip)) {
            g.registerClip(cmd.clip, clip);
          }
        }
        g.play(cmd.clip, { fade: cmd.fade ?? 0.2 });
        ctx.setQueryResult({ ok: true, entityId: targetId, clip: cmd.clip });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'No target entity for preview' });
  });
}
