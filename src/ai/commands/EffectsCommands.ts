import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  // ─── VFX ───────────────────────────────────────────────────────────────
  map.set('spawn_vfx', (cmd: Extract<AICommand, { type: 'spawn_vfx' }>) => {
    ctx.spawnVfx(cmd.preset, new THREE.Vector3(cmd.x, cmd.y, cmd.z), {
      duration: cmd.duration, loop: cmd.loop, maxParticles: cmd.maxParticles,
    });
  });

  map.set('burst_vfx', (cmd: Extract<AICommand, { type: 'burst_vfx' }>) => {
    ctx.burstVfx(cmd.preset, new THREE.Vector3(cmd.x, cmd.y, cmd.z), cmd.count ?? 40);
  });

  // ─── Effects ───────────────────────────────────────────────────────────
  map.set('camera_shake', (cmd: Extract<AICommand, { type: 'camera_shake' }>) => {
    ctx.effects?.shake({
      trauma: cmd.trauma,
      duration: cmd.duration,
      frequency: cmd.frequency,
      translation: cmd.translation,
      rotation: cmd.rotation,
    });
  });

  map.set('screen_flash', (cmd: Extract<AICommand, { type: 'screen_flash' }>) => {
    ctx.effects?.flash({
      color: cmd.color as string | undefined,
      intensity: cmd.intensity,
      duration: cmd.duration,
      mode: cmd.mode,
    });
  });

  map.set('set_time_scale', (cmd: Extract<AICommand, { type: 'set_time_scale' }>) => {
    ctx.effects?.setTimeScale(cmd.scale);
  });

  map.set('set_weather_preset', (cmd: Extract<AICommand, { type: 'set_weather_preset' }>) => {
    ctx.effects?.setWeather(cmd.kind, { intensity: cmd.intensity });
  });

  map.set('hit_feedback', (cmd: Extract<AICommand, { type: 'hit_feedback' }>) => {
    ctx.effects?.hit({
      position: cmd.x !== undefined ? new THREE.Vector3(cmd.x, cmd.y ?? 0, cmd.z ?? 0) : undefined,
      color: cmd.color,
      intensity: cmd.intensity,
      vfx: cmd.vfx,
    });
  });

  map.set('explosion_feedback', (cmd: Extract<AICommand, { type: 'explosion_feedback' }>) => {
    ctx.effects?.explosion({
      position: cmd.x !== undefined ? new THREE.Vector3(cmd.x, cmd.y ?? 0, cmd.z ?? 0) : undefined,
      color: cmd.color,
    });
  });

  map.set('spawn_decal', (cmd: Extract<AICommand, { type: 'spawn_decal' }>) => {
    ctx.effects?.decal({
      origin: new THREE.Vector3(cmd.ox, cmd.oy, cmd.oz),
      direction: new THREE.Vector3(cmd.dx, cmd.dy, cmd.dz),
      size: cmd.size,
      color: cmd.color,
      lifetime: cmd.lifetime,
      tag: cmd.tag,
    });
  });

  map.set('spawn_trail', (cmd: Extract<AICommand, { type: 'spawn_trail' }>) => {
    const t = ctx.effects?.trail({
      color: cmd.color,
      lifetime: cmd.lifetime,
      width: cmd.width,
      segments: cmd.segments,
    });
    if (t) (window as any).__mixLastTrail = t;
  });

  // ─── Debug Draw ───────────────────────────────────────────────────────
  map.set('draw_debug_line', (cmd: Extract<AICommand, { type: 'draw_debug_line' }>) => {
    if (!ctx.debugDraw) return;
    const from = new THREE.Vector3(cmd.fromX, cmd.fromY, cmd.fromZ);
    const to = new THREE.Vector3(cmd.toX, cmd.toY, cmd.toZ);
    ctx.debugDraw.drawLine(from, to, cmd.color, cmd.lifetime);
  });

  map.set('draw_debug_ray', (cmd: Extract<AICommand, { type: 'draw_debug_ray' }>) => {
    if (!ctx.debugDraw) return;
    const o = new THREE.Vector3(cmd.originX, cmd.originY, cmd.originZ);
    const d = new THREE.Vector3(cmd.dirX, cmd.dirY, cmd.dirZ);
    ctx.debugDraw.drawRay(o, d, cmd.length, cmd.color, cmd.lifetime);
  });

  map.set('draw_debug_box', (cmd: Extract<AICommand, { type: 'draw_debug_box' }>) => {
    if (!ctx.debugDraw) return;
    const c = new THREE.Vector3(cmd.centerX, cmd.centerY, cmd.centerZ);
    const s = new THREE.Vector3(cmd.sizeX, cmd.sizeY, cmd.sizeZ);
    ctx.debugDraw.drawBox(c, s, cmd.color, cmd.lifetime);
  });

  map.set('draw_debug_sphere', (cmd: Extract<AICommand, { type: 'draw_debug_sphere' }>) => {
    if (!ctx.debugDraw) return;
    const c2 = new THREE.Vector3(cmd.centerX, cmd.centerY, cmd.centerZ);
    ctx.debugDraw.drawSphere(c2, cmd.radius, cmd.color, cmd.lifetime);
  });

  map.set('draw_debug_text', (cmd: Extract<AICommand, { type: 'draw_debug_text' }>) => {
    if (!ctx.debugDraw) return;
    const p = new THREE.Vector3(cmd.x, cmd.y, cmd.z);
    ctx.debugDraw.drawText(p, cmd.text, cmd.color, cmd.size, cmd.lifetime);
  });

  map.set('clear_debug_draw', () => {
    ctx.debugDraw?.clearAll();
  });

  map.set('set_debug_draw', (cmd: Extract<AICommand, { type: 'set_debug_draw' }>) => {
    ctx.debugDraw?.setEnabled(cmd.enabled);
  });
}
