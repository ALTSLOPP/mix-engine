import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('sensorium_test', (cmd: Extract<AICommand, { type: 'sensorium_test' }>) => {
    void ctx.sensorium.test(cmd.profile, cmd.options).then((r) => { ctx.setQueryResult(r); });
  });

  map.set('sensorium_run', (cmd: Extract<AICommand, { type: 'sensorium_run' }>) => {
    void ctx.sensorium.run(cmd.script).then((r) => { ctx.setQueryResult(r); });
  });

  map.set('playback_run', (cmd: Extract<AICommand, { type: 'playback_run' }>) => {
    void ctx.sensorium.run(cmd.script).then((r) => { ctx.setQueryResult(r); });
  });

  map.set('sensorium_stop', () => {
    ctx.sensorium.abort();
  });

  map.set('playback_stop', () => {
    ctx.sensorium.abort();
  });

  map.set('sensorium_status', () => {
    ctx.setQueryResult(ctx.sensorium.lastReport);
  });

  map.set('playback_status', () => {
    ctx.setQueryResult(ctx.sensorium.lastReport);
  });

  map.set('sensorium_baseline', (cmd: Extract<AICommand, { type: 'sensorium_baseline' }>) => {
    void ctx.sensorium.saveBaseline(cmd.name);
  });
}
