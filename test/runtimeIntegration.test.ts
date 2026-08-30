import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NavMeshVoxelizer } from '../src/ai/NavMeshVoxelizer';
import { EnvironmentQuery, EqsGenerators } from '../src/ai/EnvironmentQuery';
import { AudioManager } from '../src/audio/AudioManager';

import { HELM_MANIFEST } from '../src/helm/manifest';

describe('previously orphaned runtime systems', () => {
  it('voxelizes overlapping floors into separate live navigation spans', () => {
    const scene = new THREE.Scene();
    for (const y of [0, 4]) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8, 1, 1));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = y;
      scene.add(floor);
    }

    const { navmesh, stats } = NavMeshVoxelizer.build([scene], {
      center: new THREE.Vector3(),
      size: 8,
      cellSize: 1,
      agentRadius: 0,
      agentHeight: 1.8,
    });

    const spans = navmesh.spansAt(0, 0).filter((span) => span.walkable);
    expect(stats.trianglesRasterized).toBe(4);
    expect(spans.map((span) => Math.abs(Math.round(span.floorY)))).toEqual([0, 4]);
  });

  it('generates candidates and scores queries for tactical AI positions', () => {
    const querier = new THREE.Vector3(0, 0, 0);
    const target = new THREE.Vector3(10, 0, 0);
    const result = EnvironmentQuery.run({
      items: EqsGenerators.ring(querier, 5, 8),
      tests: [
        { kind: 'distance', from: 'target', min: 3, max: 16, weight: 1 },
        { kind: 'cover', weight: 3 },
      ],
    }, {
      querier,
      target,
      lineOfSight: (from) => from.z >= 0,
    });

    expect(result.survived).toBeGreaterThan(0);
    expect(result.best).not.toBeNull();
    expect(result.best!.breakdown.cover).toBeGreaterThan(0);
  });

  it('routes music through streaming tracks instead of AudioBuffers', async () => {
    const audio = new AudioManager({} as never, { } as never);
    await audio.crossfadeMusic('/audio/score.ogg', 0.5);
    expect(audio.currentMusicSrc).toBe('/audio/score.ogg');
    expect(audio.streaming.getTrack('music:/audio/score.ogg')?.isPlaying).toBe(true);
    await audio.stopMusic(0);
    expect(audio.currentMusicSrc).toBeNull();
  });

  it('keeps engine ownership, ticks, teardown, commands, and HELM entries wired', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const engine = readFileSync(`${root}/src/engine/Engine.ts`, 'utf8');
    const bridge = readFileSync(`${root}/src/ai/AIBridge.ts`, 'utf8');
    const helmCommandTypes = new Set(HELM_MANIFEST.commands.map((c) => c.type));

    for (const token of ['chunkDeltas', 'activeRagdolls', 'springBones', 'footIK', 'buoyancy', 'hlod', 'network', 'gpuParticles']) {
      expect(engine).toContain(`this.${token}`);
    }
    for (const command of ['navmesh_build_multilayer', 'eqs_query', 'buoyancy_add', 'hlod_create', 'network_join', 'gpu_particles_start']) {
      expect(bridge).toContain(command);
      expect(helmCommandTypes.has(command)).toBe(true);
    }
  });
});
