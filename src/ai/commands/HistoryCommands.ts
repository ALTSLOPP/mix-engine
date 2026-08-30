import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { SceneDiffer } from '../../authoring/SceneDiffer';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('undo', async (_cmd: Extract<AICommand, { type: 'undo' }>) => {
    const history = (ctx as any).history;
    if (history) {
      return await history.undo();
    }
    return false;
  });

  map.set('redo', async (_cmd: Extract<AICommand, { type: 'redo' }>) => {
    const history = (ctx as any).history;
    if (history) {
      return await history.redo();
    }
    return false;
  });

  map.set('history_list', (_cmd: Extract<AICommand, { type: 'history_list' }>) => {
    const history = (ctx as any).history;
    return history ? history.getEntries() : [];
  });

  map.set('history_clear', (_cmd: Extract<AICommand, { type: 'history_clear' }>) => {
    const history = (ctx as any).history;
    if (history) history.clear();
  });

  map.set('scene_diff', (cmd: Extract<AICommand, { type: 'scene_diff' }>) => {
    const listCurrent = (): any[] => {
      const out = [];
      for (const id of ctx.sceneManager.allEntityIds()) {
        const rb = ctx.sceneManager.getRigidBody(id);
        out.push({
          id,
          name: (ctx as any).entityNames?.get(id),
          tags: ctx.sceneManager.getTags(id),
          position: rb ? { x: rb.mesh.position.x, y: rb.mesh.position.y, z: rb.mesh.position.z } : undefined,
          rotation: rb ? { x: rb.mesh.quaternion.x, y: rb.mesh.quaternion.y, z: rb.mesh.quaternion.z, w: rb.mesh.quaternion.w } : undefined,
        });
      }
      return out;
    };

    const before = cmd.beforeEntities ?? [];
    const after = cmd.afterEntities ?? listCurrent();
    return SceneDiffer.diff(before, after);
  });
}
