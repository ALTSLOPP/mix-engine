import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  // ─── Editor controls ───────────────────────────────────────────────────
  map.set('set_mode', (cmd: Extract<AICommand, { type: 'set_mode' }>) => {
    ctx.input.setMode(cmd.mode);
  });

  map.set('set_snap', (cmd: Extract<AICommand, { type: 'set_snap' }>) => {
    ctx._setSnap?.(cmd.enabled, cmd.translateSnap, cmd.rotateSnap);
  });

  map.set('set_grid', (cmd: Extract<AICommand, { type: 'set_grid' }>) => {
    ctx._setGrid?.(cmd);
  });

  map.set('set_gizmo_mode', (cmd: Extract<AICommand, { type: 'set_gizmo_mode' }>) => {
    ctx._setGizmoMode?.(cmd.mode);
  });

  map.set('viewport_detach', () => {
    ctx._detachViewport?.();
  });

  map.set('viewport_reattach', () => {
    ctx._reattachViewport?.();
  });

  map.set('export_typings', () => {
    fetch('/api/export-typings', { method: 'POST' }).catch(() => {
      console.warn('[AIBridge] export_typings: dev server not reachable. Run `npm run gen-typings` manually.');
    });
  });

  // ─── Scripts ───────────────────────────────────────────────────────────
  map.set('run_script', (cmd: Extract<AICommand, { type: 'run_script' }>) => {
    for (const c of cmd.commands) ctx.execute(c);
  });

  map.set('add_script', (cmd: Extract<AICommand, { type: 'add_script' }>) => {
    // Live state-preserved hot-swap when a script already exists on the entity.
    // Surface the compile result so an iterating agent sees whether the swap took.
    const res = ctx.sceneManager.addScript(cmd.entityId, cmd.sourceCode);
    ctx.setQueryResult(res);
    if (!res.ok) {
      console.warn(`[add_script] compile failed for entity ${cmd.entityId}: ${res.error}`);
      ctx.sceneManager.events.emit('script_error', { entityId: cmd.entityId, error: res.error });
    }
  });

  map.set('remove_script', (cmd: Extract<AICommand, { type: 'remove_script' }>) => {
    ctx.sceneManager.removeScript(cmd.entityId);
  });

  // ─── Events ────────────────────────────────────────────────────────────
  map.set('emit_event', (cmd: Extract<AICommand, { type: 'emit_event' }>) => {
    ctx.sceneManager.events.emit(cmd.event, cmd.data);
  });

  // ─── Zoom / frame ──────────────────────────────────────────────────────
  map.set('zoom_in', (cmd: Extract<AICommand, { type: 'zoom_in' }>) => {
    ctx.zoomIn?.(cmd.factor);
  });

  map.set('zoom_out', (cmd: Extract<AICommand, { type: 'zoom_out' }>) => {
    ctx.zoomOut?.(cmd.factor);
  });

  map.set('zoom_reset', () => {
    ctx.zoomReset?.();
  });

  map.set('camera_preset', (cmd: Extract<AICommand, { type: 'camera_preset' }>) => {
    const ok = ctx.applyCameraPreset?.(cmd.preset, { anchorToSelection: cmd.anchorToSelection });
    ctx.setQueryResult({ ok: !!ok, preset: cmd.preset, applied: !!ok });
    if (!ok) console.warn(`[camera_preset] unknown preset "${cmd.preset}"`);
  });
  map.set('camera_preset_next', () => {
    const id = ctx.cycleCameraPreset?.(1);
    ctx.setQueryResult({ ok: !!id, preset: id });
  });
  map.set('camera_preset_prev', () => {
    const id = ctx.cycleCameraPreset?.(-1);
    ctx.setQueryResult({ ok: !!id, preset: id });
  });
  map.set('list_camera_presets', () => {
    const list = ctx.listCameraPresets?.() ?? [];
    ctx.setQueryResult(list.map(p => ({ id: p.id, name: p.name, description: p.description, fov: p.fov, group: p.group })));
  });

  map.set('frame_all', (cmd: Extract<AICommand, { type: 'frame_all' }>) => {
    ctx.frameAll?.(cmd.padding);
  });

  map.set('frame_entity', (cmd: Extract<AICommand, { type: 'frame_entity' }>) => {
    ctx.frameEntity?.(cmd.entityId, cmd.padding);
  });

  // ─── HUD / UI ──────────────────────────────────────────────────────────
  map.set('hud_load', (cmd: Extract<AICommand, { type: 'hud_load' }>) => {
    ctx.hud?.load(cmd.layout);
  });

  map.set('hud_show', (cmd: Extract<AICommand, { type: 'hud_show' }>) => {
    ctx.hud?.show(cmd.id);
  });

  map.set('hud_hide', (cmd: Extract<AICommand, { type: 'hud_hide' }>) => {
    ctx.hud?.hide(cmd.id);
  });

  map.set('hud_clear', () => {
    ctx.hud?.clear();
  });

  map.set('dialogue_show', (cmd: Extract<AICommand, { type: 'dialogue_show' }>) => {
    if (ctx.dialogueSystem) {
      const mappedChoices = (cmd.choices || []).map(c => ({
        text: c.text,
        onClick: () => {
          if (c.command) ctx.execute(c.command);
        },
      }));
      ctx.dialogueSystem.show(cmd.text, cmd.speaker, mappedChoices);
    }
  });

  // ─── Replay ────────────────────────────────────────────────────────────
  map.set('replay_start_recording', () => {
    ctx.replay?.startRecording();
  });

  map.set('replay_stop_recording', () => {
    const rec = ctx.replay?.stopRecording();
    if (rec) ctx.setQueryResult({ frames: rec.frames.length, fixedDt: rec.fixedDt });
  });

  map.set('replay_play', () => {
    ctx.replay?.play();
  });

  map.set('replay_pause', () => {
    ctx.replay?.pause();
  });

  map.set('replay_stop', () => {
    ctx.replay?.stop();
  });

  map.set('replay_step', () => {
    ctx.replay?.stepForward();
  });

  map.set('replay_step_back', () => {
    ctx.replay?.stepBackward();
  });

  map.set('replay_set_frame', (cmd: Extract<AICommand, { type: 'replay_set_frame' }>) => {
    ctx.replay?.seekToFrame(cmd.frame);
    for (const rb of ctx.sceneManager.rigidBodyList) {
      rb.resetInterpolationBuffers();
    }
  });

  // ─── Game State ────────────────────────────────────────────────────────
  map.set('set_state', (cmd: Extract<AICommand, { type: 'set_state' }>) => {
    ctx.sceneManager.gameState.setItem(cmd.key, cmd.value);
  });

  map.set('get_state', (cmd: Extract<AICommand, { type: 'get_state' }>) => {
    ctx.setQueryResult({ key: cmd.key, value: ctx.sceneManager.gameState.getItem(cmd.key) });
  });

  map.set('list_state', () => {
    ctx.setQueryResult(ctx.sceneManager.gameState.getAll());
  });

  map.set('save_state_snapshot', (cmd: Extract<AICommand, { type: 'save_state_snapshot' }>) => {
    ctx.sceneManager.gameState.saveSnapshot(cmd.name);
  });

  map.set('load_state_snapshot', (cmd: Extract<AICommand, { type: 'load_state_snapshot' }>) => {
    ctx.sceneManager.gameState.loadSnapshotByName(cmd.name);
  });

  map.set('remove_state', (cmd: Extract<AICommand, { type: 'remove_state' }>) => {
    ctx.sceneManager.gameState.removeItem(cmd.key);
  });

  map.set('clear_state', () => {
    ctx.sceneManager.gameState.clear();
  });
}
