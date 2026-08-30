import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { GamePackager } from '../../export/GamePackager';
import { TauriConfigBuilder } from '../../export/TauriConfigBuilder';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('package_game', (cmd: Extract<AICommand, { type: 'package_game' }>) => {
    const listCurrent = (): any[] => {
      const out = [];
      for (const id of ctx.sceneManager.allEntityIds()) {
        const rb = ctx.sceneManager.getRigidBody(id);
        const bp = ctx.sceneManager.getBlueprint(id);
        if (!rb || !bp) continue;
        // Skip boot fixture ground plane (recreated on launch)
        if (bp.kind === 'box' && bp.params.hx === 50 && bp.params.hy === 0.5 && bp.params.hz === 50 && (bp.params as any).dynamic === false) continue;
        if (bp.kind === 'dojo' || bp.kind === 'mapModel') continue;
        const guid = (ctx.sceneManager as any).ensureGuid?.(id) ?? (ctx.sceneManager as any).getGuid?.(id) ?? String(id);
        const scriptComp: any = (ctx.sceneManager as any).getComponent?.(id, 'script');
        out.push({
          guid,
          id,
          name: (ctx as any).entityNames?.get(id),
          tags: ctx.sceneManager.getTags(id),
          blueprint: bp,
          position: rb ? [rb.mesh.position.x, rb.mesh.position.y, rb.mesh.position.z] : undefined,
          quaternion: rb ? [rb.mesh.quaternion.x, rb.mesh.quaternion.y, rb.mesh.quaternion.z, rb.mesh.quaternion.w] : undefined,
          scale: rb ? [rb.mesh.scale.x, rb.mesh.scale.y, rb.mesh.scale.z] : undefined,
          scriptSource: scriptComp?.sourceCode ?? null,
          parentId: ctx.sceneManager.getParent(id),
        });
      }
      return out;
    };

    const entryScene = (cmd.entryScene ?? 'main').trim() || 'main';
    const bundle = GamePackager.createBundle({
      title: cmd.title,
      entryScene,
      visualStyle: cmd.visualStyle,
      scenes: {
        [entryScene]: listCurrent(),
      },
      inputActions: ctx.input.getActions(),
    });

    return {
      manifest: bundle,
      validation: GamePackager.validateBundle(bundle),
    };
  });

  map.set('export_tauri_manifest', (cmd: Extract<AICommand, { type: 'export_tauri_manifest' }>) => {
    return TauriConfigBuilder.generateTauriConf({
      title: cmd.title ?? 'MIX Engine Game',
      version: cmd.version ?? '1.0.0',
      fullscreen: cmd.fullscreen,
    });
  });
}
