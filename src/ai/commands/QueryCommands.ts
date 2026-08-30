import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import type { EntityId } from '../../ecs/SceneManager';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('query_scene', (cmd: Extract<AICommand, { type: 'query_scene' }>) => {
    void ctx.trackAsync(queryScene(cmd, ctx));
  });

  map.set('query_raycast', (cmd: Extract<AICommand, { type: 'query_raycast' }>) => {
    queryRaycast(cmd, ctx);
  });

  map.set('query_sphere', (cmd: Extract<AICommand, { type: 'query_sphere' }>) => {
    querySphere(cmd, ctx);
  });
}

async function queryScene(cmd: Extract<AICommand, { type: 'query_scene' }>, ctx: CmdCtx): Promise<void> {
  const sm = ctx.sceneManager as unknown as {
    entities: Set<EntityId>;
    rigidBodyList: RigidBodyComponent[];
    rigidBodyEntities: EntityId[];
  };
  const filter = cmd.filter;
  const out: any[] = [];
  const cam = ctx.viewport.camera;
  const worldCam = new THREE.Vector3();
  ctx.worldOrigin.toWorldSpaceInto(worldCam, cam.position);
  for (let i = 0; i < sm.rigidBodyList.length; i++) {
    const rb = sm.rigidBodyList[i];
    const id = sm.rigidBodyEntities[i];
    const blueprint = ctx.sceneManager.getBlueprint(id);
    ctx.worldOrigin.toWorldSpaceInto(ctx._worldPos, rb.mesh.position);
    const name = ctx.entityNames.get(id);
    const tags = ctx.getEntityTags(id);
    if (filter?.kind && blueprint?.kind !== filter.kind) continue;
    if (filter?.tag && !tags.includes(filter.tag)) continue;
    if (filter?.name && name !== filter.name) continue;
    out.push({
      id,
      name,
      tags,
      kind: blueprint?.kind,
      position: { x: ctx._worldPos.x, y: ctx._worldPos.y, z: ctx._worldPos.z },
      bodyType: rb.rapierBody.bodyType(),
    });
  }
  const result = {
    camera: { position: { x: worldCam.x, y: worldCam.y, z: worldCam.z } },
    entityCount: out.length,
    entities: out,
    timestamp: Date.now(),
  };
  ctx.setQueryResult(result);
  try {
    await fetch('/api/scene-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
  } catch {
    /* dev server absent (prod) — result is still on query result */
  }
}

function queryRaycast(cmd: Extract<AICommand, { type: 'query_raycast' }>, ctx: CmdCtx): void {
  const origin = new THREE.Vector3(cmd.origin[0], cmd.origin[1], cmd.origin[2]);
  const dir = new THREE.Vector3(cmd.direction[0], cmd.direction[1], cmd.direction[2]).normalize();
  ctx.worldOrigin.toEngineSpaceInto(ctx._engPos, origin);
  const hit = ctx.physicsWorld.raycast(ctx._engPos, dir, cmd.maxDistance ?? 1000);
  if (!hit) {
    ctx.setQueryResult(null);
    return;
  }
  const body = ctx.physicsWorld.rapierBodyFromColliderHandle(hit.colliderHandle);
  let entityId: number | null = null;
  if (body) {
    const sm = ctx.sceneManager as unknown as { rigidBodyList: RigidBodyComponent[], entityOf: (rb: RigidBodyComponent) => EntityId | null };
    const rb = sm.rigidBodyList.find(r => r.rapierBody === body);
    if (rb) entityId = sm.entityOf(rb);
  }
  ctx.worldOrigin.toWorldSpaceInto(ctx._worldPos, hit.point);
  ctx.setQueryResult({
    point: [ctx._worldPos.x, ctx._worldPos.y, ctx._worldPos.z],
    entityId,
    distance: hit.toi,
  });
}

function querySphere(cmd: Extract<AICommand, { type: 'query_sphere' }>, ctx: CmdCtx): void {
  const center = new THREE.Vector3(cmd.center[0], cmd.center[1], cmd.center[2]);
  ctx.worldOrigin.toEngineSpaceInto(ctx._engPos, center);

  const r2 = cmd.radius * cmd.radius;
  const out: any[] = [];

  for (let i = 0; i < ctx.sceneManager.rigidBodyList.length; i++) {
    const rb = ctx.sceneManager.rigidBodyList[i];
    const distSq = rb.mesh.position.distanceToSquared(ctx._engPos);
    if (distSq <= r2) {
      const id = ctx.sceneManager.entityAtIndex(i);
      if (id === undefined) continue;

      const tags = ctx.sceneManager.getTags(id);
      if (cmd.tags && cmd.tags.length > 0) {
        let match = false;
        for (const t of cmd.tags) {
          if (ctx.sceneManager.hasTag(id, t)) {
            match = true;
            break;
          }
        }
        if (!match) continue;
      }

      ctx.worldOrigin.toWorldSpaceInto(ctx._worldPos, rb.mesh.position);
      out.push({
        id,
        name: ctx.entityNames.get(id),
        tags,
        kind: ctx.sceneManager.getBlueprint(id)?.kind,
        position: { x: ctx._worldPos.x, y: ctx._worldPos.y, z: ctx._worldPos.z },
        distance: Math.sqrt(distSq),
      });
    }
  }

  out.sort((a, b) => a.distance - b.distance);
  ctx.setQueryResult(out);
}


