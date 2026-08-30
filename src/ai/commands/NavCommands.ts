import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import type { NavMeshBuildOptions } from '../NavMesh';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('navmesh_build', (cmd: Extract<AICommand, { type: 'navmesh_build' }>) => {
    if (!ctx.nav) { console.warn('[AIBridge] navmesh_build: navigation system unavailable'); return; }
    void ctx.trackAsync(navmeshBuild(cmd, ctx));
  });

  map.set('nav_debug', (cmd: Extract<AICommand, { type: 'nav_debug' }>) => {
    if (!ctx.nav) return;
    if (cmd.enabled === undefined) ctx.nav.toggleDebug();
    else ctx.nav.setDebug(cmd.enabled);
  });

  map.set('nav_query', (cmd: Extract<AICommand, { type: 'nav_query' }>) => {
    if (!ctx.nav) return;
    const h = ctx.nav.floorHeightAt(cmd.x, cmd.z);
    ctx.setQueryResult({ x: cmd.x, z: cmd.z, walkable: h !== null, height: h });
  });

  map.set('find_path', (cmd: Extract<AICommand, { type: 'find_path' }>) => {
    if (!ctx.nav) { ctx.setQueryResult({ found: false, reason: 'unreachable' }); return; }
    const r = ctx.nav.findPath(
      new THREE.Vector3(cmd.fromX, cmd.fromY, cmd.fromZ),
      new THREE.Vector3(cmd.toX, cmd.toY, cmd.toZ),
      { smooth: cmd.smooth, goalTolerance: cmd.goalTolerance },
    );
    ctx.setQueryResult({
      found: r.found,
      reason: r.reason,
      expansions: r.expansions,
      length: r.length,
      waypoints: r.waypoints.map((p) => [r3(p.x), r3(p.y), r3(p.z)] as [number, number, number]),
    });
  });

  map.set('add_nav_agent', (cmd: Extract<AICommand, { type: 'add_nav_agent' }>) => {
    if (!ctx.nav) { console.warn('[AIBridge] add_nav_agent: navigation system unavailable'); return; }
    ctx.nav.addAgent(cmd.entityId, {
      mode: cmd.mode,
      target: cmd.targetX !== undefined ? new THREE.Vector3(cmd.targetX, cmd.targetY ?? 0, cmd.targetZ ?? 0) : undefined,
      targetEntityId: cmd.targetEntityId,
      patrol: cmd.patrol?.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      patrolLoop: cmd.patrolLoop,
      steering: cmd.steering,
      behaviorTree: cmd.behaviorTree,
      enableTrace: cmd.enableTrace,
      faceMovement: cmd.faceMovement,
      groundSnap: cmd.groundSnap,
      tag: cmd.tag,
      flockRadius: cmd.flockRadius,
      queueLaneWidth: cmd.queueLaneWidth,
    });
  });

  map.set('set_nav_target', (cmd: Extract<AICommand, { type: 'set_nav_target' }>) => {
    if (!ctx.nav) return;
    ctx.nav.setAgentTarget(cmd.entityId, cmd.mode, {
      world: cmd.targetX !== undefined ? new THREE.Vector3(cmd.targetX, cmd.targetY ?? 0, cmd.targetZ ?? 0) : undefined,
      entityId: cmd.targetEntityId,
      patrol: cmd.patrol?.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    });
  });

  map.set('set_nav_behavior_tree', (cmd: Extract<AICommand, { type: 'set_nav_behavior_tree' }>) => {
    if (!ctx.nav) return;
    ctx.nav.setAgentBehaviorTree(cmd.entityId, cmd.tree, cmd.enableTrace);
  });

  map.set('set_nav_steering', (cmd: Extract<AICommand, { type: 'set_nav_steering' }>) => {
    if (!ctx.nav) return;
    ctx.nav.setAgentSteering(cmd.entityId, cmd.steering);
  });

  map.set('set_nav_blackboard', (cmd: Extract<AICommand, { type: 'set_nav_blackboard' }>) => {
    if (!ctx.nav) return;
    ctx.nav.setAgentBlackboard(cmd.entityId, cmd.key, cmd.value);
  });

  map.set('remove_nav_agent', (cmd: Extract<AICommand, { type: 'remove_nav_agent' }>) => {
    if (!ctx.nav) return;
    ctx.nav.removeAgent(cmd.entityId);
  });

  map.set('nav_goto', (cmd: Extract<AICommand, { type: 'nav_goto' }>) => {
    if (!ctx.nav) { ctx.setQueryResult({ status: 'unreachable', reason: 'navigation system unavailable' }); return; }
    const nav = ctx.nav;
    void ctx.trackAsync(
      nav.navigateTo(cmd.entityId, cmd.target, {
        pathMode: cmd.pathMode,
        arriveRadius: cmd.arriveRadius,
        requirePath: cmd.requirePath,
        timeoutSec: cmd.timeoutSec,
      }).then((arrival) => { ctx.setQueryResult(arrival); return arrival; }),
    );
  });

  map.set('nav_register_landmark', (cmd: Extract<AICommand, { type: 'nav_register_landmark' }>) => {
    if (!ctx.nav) return;
    ctx.nav.registerLandmark(cmd.name, new THREE.Vector3(cmd.x, cmd.y, cmd.z), cmd.radius);
  });

  map.set('navmesh_auto', (cmd: Extract<AICommand, { type: 'navmesh_auto' }>) => {
    if (!ctx.nav) return;
    ctx.nav.setDynamic({ enabled: cmd.enabled, maxRegionsPerFrame: cmd.maxRegionsPerFrame, maxQueued: cmd.maxQueued });
  });

  map.set('navmesh_invalidate', (cmd: Extract<AICommand, { type: 'navmesh_invalidate' }>) => {
    if (!ctx.nav) return;
    ctx.nav.markRegionDirty({ minX: cmd.minX, minZ: cmd.minZ, maxX: cmd.maxX, maxZ: cmd.maxZ });
  });
}

async function navmeshBuild(cmd: Extract<AICommand, { type: 'navmesh_build' }>, ctx: CmdCtx): Promise<void> {
  if (!ctx.nav) return;
  const opts: NavMeshBuildOptions = {
    center: new THREE.Vector3(cmd.centerX, 0, cmd.centerZ),
    size: cmd.size,
    cellSize: cmd.cellSize,
    agentRadius: cmd.agentRadius,
    agentHeight: cmd.agentHeight,
    maxSlopeDeg: cmd.maxSlopeDeg,
    maxStepHeight: cmd.maxStepHeight,
  };
  const stats = await ctx.nav.buildNavMesh(opts);
  ctx.setQueryResult(stats);
  try {
    await fetch('/api/scene-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'navmesh_build', stats }),
    });
  } catch { /* dev server absent */ }
}

function r3(v: number): number { return Math.round(v * 1000) / 1000; }
