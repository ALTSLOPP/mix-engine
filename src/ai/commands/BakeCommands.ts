import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { bakeVertexAO, flushBakedAO, type BakeStats } from '../../features/BakePipeline';

/**
 * `bake_ao` — deterministic vertex ambient-occlusion bake. Stamps contact/crevice AO into
 * static mesh vertex colors so the runtime pays zero per-frame cost for it (bake, don't
 * brute-force). Same `seed` + same world ⇒ bit-identical bake, which SENSORIUM can diff.
 */
export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('bake_ao', (cmd: Extract<AICommand, { type: 'bake_ao' }>) => {
    // Each rigid body's `mesh` is a root Group; collect the real meshes inside it.
    const meshes: import('three').Mesh[] = [];
    for (const rb of ctx.sceneManager.rigidBodyList) {
      if (!rb.mesh) continue;
      rb.mesh.traverse((node) => {
        const m = node as import('three').Mesh;
        if (m.isMesh && m.geometry?.attributes?.position) meshes.push(m);
      });
    }

    if (!meshes.length) {
      ctx.setQueryResult({ ok: false, error: 'No static meshes to bake.' });
      return;
    }

    // Refresh world matrices from the scene root so baked AO is in world space.
    ctx.viewport.scene.updateMatrixWorld(true);

    const stats: BakeStats = bakeVertexAO(meshes, {
      samples: cmd.samples,
      distance: cmd.distance,
      strength: cmd.strength,
      seed: cmd.seed,
    });

    ctx.setQueryResult({
      ok: true,
      baked: 'vertex_ao',
      meshes: stats.meshesBaked,
      vertices: stats.verticesBaked,
      rays: stats.raysCast,
      samplesPerVertex: stats.samplesPerVertex,
      distance: stats.distance,
      seed: stats.seed,
      // The exact invocation that reproduces this bake — paste to re-run identically.
      recipe: stats.recipe,
    });

    // Record the deterministic recipe so a `save_game` persists it for re-bake on reload.
    ctx.bakes?.setAO({
      samples: stats.samplesPerVertex,
      distance: stats.distance,
      strength: cmd.strength ?? 1,
      seed: stats.seed,
    });
  });

  map.set('bake_flush', () => {
    const meshes: import('three').Object3D[] = ctx.sceneManager.rigidBodyList.map((rb) => rb.mesh);
    const flushed = flushBakedAO(meshes);
    ctx.bakes?.clearAO();
    ctx.setQueryResult({ ok: true, flushed, restored: 'original materials' });
  });
}
