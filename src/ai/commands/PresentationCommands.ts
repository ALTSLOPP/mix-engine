import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { WorldCanvas } from '../../ui/WorldCanvas';

export function register(map: CommandMap, ctx: CmdCtx): void {
  const canvases = new Map<string, WorldCanvas>();

  map.set('world_canvas_create', (cmd: Extract<AICommand, { type: 'world_canvas_create' }>) => {
    const canvas = new WorldCanvas({
      width: cmd.width,
      height: cmd.height,
      billboard: cmd.billboard,
    });

    if (cmd.position) {
      const pos = new THREE.Vector3(cmd.position.x, cmd.position.y, cmd.position.z);
      ctx.worldOrigin.toEngineSpaceInto(pos, pos);
      canvas.mesh.position.copy(pos);
    }

    if (cmd.text) {
      canvas.drawText(cmd.text, 256, 256, { background: 'rgba(0,0,0,0.7)', color: '#ffffff' });
    }

    ctx.viewport.scene.add(canvas.mesh);
    canvases.set(cmd.canvasId, canvas);
    return true;
  });

  map.set('world_canvas_set_text', (cmd: Extract<AICommand, { type: 'world_canvas_set_text' }>) => {
    const canvas = canvases.get(cmd.canvasId);
    if (!canvas) return false;

    canvas.clear();
    canvas.drawText(cmd.text, canvas.canvas.width / 2, canvas.canvas.height / 2, {
      color: cmd.color,
      background: cmd.background,
    });
    return true;
  });

  map.set('world_canvas_destroy', (cmd: Extract<AICommand, { type: 'world_canvas_destroy' }>) => {
    const canvas = canvases.get(cmd.canvasId);
    if (!canvas) return false;

    ctx.viewport.scene.remove(canvas.mesh);
    canvas.dispose();
    canvases.delete(cmd.canvasId);
    return true;
  });

  map.set('reverb_zone_create', (cmd: Extract<AICommand, { type: 'reverb_zone_create' }>) => {
    const reverbSys = (ctx as any).reverbSystem;
    if (!reverbSys) return false;

    const min = new THREE.Vector3(cmd.min.x, cmd.min.y, cmd.min.z);
    const max = new THREE.Vector3(cmd.max.x, cmd.max.y, cmd.max.z);

    reverbSys.addZone({
      id: cmd.zoneId,
      name: cmd.name,
      min,
      max,
      wet: cmd.wet ?? 0.5,
      params: {
        duration: cmd.duration ?? 2.0,
        decay: cmd.decay ?? 2.0,
      },
    });
    return true;
  });

  map.set('reverb_zone_remove', (cmd: Extract<AICommand, { type: 'reverb_zone_remove' }>) => {
    const reverbSys = (ctx as any).reverbSystem;
    return reverbSys ? reverbSys.removeZone(cmd.zoneId) : false;
  });

  map.set('reflection_probe_create', (cmd: Extract<AICommand, { type: 'reflection_probe_create' }>) => {
    if (!ctx.createReflectionProbe) return false;
    return ctx.createReflectionProbe(
      cmd.probeId,
      new THREE.Vector3(cmd.position.x, cmd.position.y, cmd.position.z),
      { resolution: cmd.resolution, boxSize: cmd.boxSize, intensity: cmd.intensity },
    );
  });

  map.set('reflection_probe_remove', (cmd: Extract<AICommand, { type: 'reflection_probe_remove' }>) =>
    ctx.removeReflectionProbe?.(cmd.probeId) ?? false,
  );

  map.set('reflection_probe_capture', (cmd: Extract<AICommand, { type: 'reflection_probe_capture' }>) =>
    ctx.markReflectionProbeDirty?.(cmd.probeId) ?? false,
  );
}
