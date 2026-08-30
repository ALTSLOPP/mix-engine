import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('play_sound', (cmd: Extract<AICommand, { type: 'play_sound' }>) => {
    void ctx.audio.play(cmd.src, { x: cmd.x, y: cmd.y, z: cmd.z, volume: cmd.volume, loop: cmd.loop, refDistance: cmd.refDistance, maxDistance: cmd.maxDistance });
  });

  map.set('attach_sound', (cmd: Extract<AICommand, { type: 'attach_sound' }>) => {
    void ctx.audio.attachToEntity(cmd.entityId, cmd.src, { volume: cmd.volume, loop: cmd.loop });
  });

  map.set('stop_sound', (cmd: Extract<AICommand, { type: 'stop_sound' }>) => {
    ctx.audio.stop({ src: cmd.src, entityId: cmd.entityId });
  });

  map.set('set_master_volume', (cmd: Extract<AICommand, { type: 'set_master_volume' }>) => {
    ctx.audio.setMasterVolume(cmd.volume);
  });

  map.set('set_bus_volume', (cmd: Extract<AICommand, { type: 'set_bus_volume' }>) => {
    ctx.audio.setBusVolume(cmd.bus, cmd.volume);
  });

  map.set('crossfade_music', (cmd: Extract<AICommand, { type: 'crossfade_music' }>) => {
    void ctx.audio.crossfadeMusic(cmd.src, cmd.duration);
  });

  map.set('stop_music', (cmd: Extract<AICommand, { type: 'stop_music' }>) => {
    void ctx.audio.stopMusic(cmd.fadeOut);
  });

  map.set('add_trigger_zone', (cmd: Extract<AICommand, { type: 'add_trigger_zone' }>) => {
    ctx.audio.addTriggerZone({
      id: cmd.id, x: cmd.x, y: cmd.y, z: cmd.z, radius: cmd.radius,
      enterSound: cmd.enterSound, exitSound: cmd.exitSound,
      ambientSound: cmd.ambientSound, volume: cmd.volume,
    });
  });

  map.set('remove_trigger_zone', (cmd: Extract<AICommand, { type: 'remove_trigger_zone' }>) => {
    ctx.audio.removeTriggerZone(cmd.id);
  });
}
