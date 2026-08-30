import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('weather_set', (cmd: Extract<AICommand, { type: 'weather_set' }>) => {
    const weather = (ctx as any).weatherSystem;
    if (!weather) return false;
    weather.setWeather(cmd.state, cmd.transitionDuration);
    return true;
  });

  map.set('director_set_phase', (cmd: Extract<AICommand, { type: 'director_set_phase' }>) => {
    const director = (ctx as any).aiDirector;
    if (!director) return false;
    director.setPhase(cmd.phase);
    return true;
  });

  map.set('cloth_create_grid', (cmd: Extract<AICommand, { type: 'cloth_create_grid' }>) => {
    const clothSystem = ctx.clothSystem;
    if (!clothSystem) return false;
    const cloth = clothSystem.createGrid(cmd.id, {
      width: cmd.width,
      height: cmd.height,
      segsX: cmd.segsX,
      segsY: cmd.segsY,
      pinTop: cmd.pinTop,
    });
    return {
      id: cloth.id,
      particleCount: cloth.simulation.particles.length,
      constraintCount: cloth.simulation.constraints.length,
    };
  });

  map.set('cloth_remove', (cmd: Extract<AICommand, { type: 'cloth_remove' }>) =>
    ctx.clothSystem?.remove(cmd.id) ?? false,
  );

  map.set('cloth_list', (_cmd: Extract<AICommand, { type: 'cloth_list' }>) =>
    ctx.clothSystem?.list() ?? [],
  );
}
