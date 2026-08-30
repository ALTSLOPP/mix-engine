import * as THREE from 'three';
import type { EntityId } from '../ecs/SceneManager';
import type { NavAgentInfo } from './NavigationSystem';

/** Locomotion intent. Maps to a steering max-speed (and, if wired, an animation state). */
export type PathMode = 'walk' | 'run' | 'sprint';

/** A destination reference an agent can be told to go to. */
export type NavDestination = string | THREE.Vector3 | [number, number, number];

export interface NavigateToOptions {
  /** How fast to travel — 'walk' (default) | 'run' | 'sprint'. */
  pathMode?: PathMode;
  /** How close (metres) counts as "arrived". Defaults to the agent's arrive radius. */
  arriveRadius?: number;
  /** If true, reject immediately when no A* path exists (instead of best-effort seek). */
  requirePath?: boolean;
  /** Abandon (resolve with status 'timeout') after this many seconds. Default 60. */
  timeoutSec?: number;
}

export interface NavArrival {
  status: 'arrived' | 'unreachable' | 'aborted' | 'timeout' | 'superseded';
  entityId: EntityId;
  /** Resolved world-space destination, or null if it couldn't be resolved. */
  destination: { x: number; y: number; z: number } | null;
  /** The semantic name the destination resolved from (e.g. "building_42"), if any. */
  destinationName?: string;
  /** A* path length in metres for the route taken (0 if direct/none). */
  pathLength: number;
  elapsedSec: number;
}

/**
 * The minimal NavigationSystem surface a handle needs. Declared as an interface so the
 * handle file has no value-level import cycle with NavigationSystem.
 */
export interface SemanticNavHost {
  navigateTo(entityId: EntityId, dest: NavDestination, opts?: NavigateToOptions): Promise<NavArrival>;
  stopAgent(entityId: EntityId): void;
  getAgentInfo(entityId: EntityId): NavAgentInfo | null;
}

/**
 * NavAgentHandle — the AI-native, semantic façade over a single NavAgent.
 *
 * This is the surface the spec calls for:
 *
 *   await engine.nav.agent(npcId).navigateTo("building_42", { pathMode: "walk" });
 *
 * No vector math, no manual pathfinding — the coding agent names a place and a gait and
 * awaits arrival. The promise resolves with a structured {@link NavArrival} (arrived /
 * unreachable / timeout / aborted) so a script can branch on the outcome.
 */
export class NavAgentHandle {
  constructor(private readonly host: SemanticNavHost, readonly entityId: EntityId) {}

  /** Walk/run/sprint to a named landmark, a named/tagged entity, or a world position. */
  navigateTo(dest: NavDestination, opts?: NavigateToOptions): Promise<NavArrival> {
    return this.host.navigateTo(this.entityId, dest, opts);
  }

  /** Stop moving (idle). Any in-flight navigateTo resolves with status 'aborted'. */
  stop(): void {
    this.host.stopAgent(this.entityId);
  }

  /** Live agent telemetry (mode, speed, path), or null if the entity isn't an agent. */
  get info(): NavAgentInfo | null {
    return this.host.getAgentInfo(this.entityId);
  }

  /** True while the agent is travelling (has a non-trivial speed). */
  get isMoving(): boolean {
    const i = this.host.getAgentInfo(this.entityId);
    return i ? i.speed > 0.05 : false;
  }
}

/** Steering max-speed (m/s) for each gait. */
export const PATH_MODE_SPEED: Record<PathMode, number> = {
  walk: 1.8,
  run: 4.5,
  sprint: 7.0,
};
