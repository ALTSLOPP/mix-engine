import * as THREE from 'three';

/** A candidate location an EQS query is deciding between. */
export interface EqsItem {
  /** World-space position of the candidate. */
  position: THREE.Vector3;
  /** Accumulated 0..1 score. Higher is better. */
  score: number;
  /** Per-test scores, for debugging why a spot won or lost. */
  breakdown: Record<string, number>;
  /** Set when a filter test rejected the item. */
  rejectedBy?: string;
}

/** Everything the tests are allowed to look at. All positions are WORLD space. */
export interface EqsContext {
  /** The asking agent's position — "distance from me", "in front of me". */
  querier: THREE.Vector3;
  /** Optional facing direction of the querier (unit vector). */
  querierForward?: THREE.Vector3;
  /** The thing being reasoned about — the enemy, the objective, the noise. */
  target?: THREE.Vector3;
  /** Walkability + height lookup. Any NavGrid-shaped object works. */
  nav?: {
    isWalkableAt(worldX: number, worldZ: number): boolean;
    heightAt(worldX: number, worldZ: number): number | null;
  };
  /**
   * World-space line-of-sight probe: true when `from` can see `to`. Supply the
   * physics raycast, the navmesh's 2D LOS, or a stub in tests.
   */
  lineOfSight?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
}

export type EqsScoreCurve = 'linear' | 'inverse' | 'square' | 'inverse_square';

interface EqsTestBase {
  /** Name shown in the score breakdown. */
  name?: string;
  /** Relative contribution to the final score. Ignored for pure filters. */
  weight?: number;
  /** 'filter' rejects outright; 'score' only weights. Default 'score'. */
  mode?: 'filter' | 'score';
}

export interface EqsDistanceTest extends EqsTestBase {
  kind: 'distance';
  /** Measure from the querier (default) or the target. */
  from?: 'querier' | 'target';
  min?: number;
  max?: number;
  /** 'near' scores close positions highest, 'far' the opposite. Default 'near'. */
  prefer?: 'near' | 'far';
  curve?: EqsScoreCurve;
}

export interface EqsLineOfSightTest extends EqsTestBase {
  kind: 'line_of_sight';
  /** Reward visibility of the target (default) or reward being hidden from it. */
  want?: 'visible' | 'hidden';
  /** Eye height offset added to both ends of the probe. Default 1.6m. */
  eyeHeight?: number;
}

export interface EqsNavigableTest extends EqsTestBase {
  kind: 'navigable';
  /** Snap the item's Y onto the navmesh floor when it is walkable. Default true. */
  snapToFloor?: boolean;
}

export interface EqsDotTest extends EqsTestBase {
  kind: 'dot';
  /** Compare against the querier's forward vector (default) or the direction to target. */
  against?: 'querier_forward' | 'to_target';
  /** Reject items whose dot is below this. */
  min?: number;
}

export interface EqsCoverTest extends EqsTestBase {
  kind: 'cover';
  /**
   * Radius of the peek offsets probed around the item. A good cover spot is one the
   * target cannot see, but that has a neighbour the target CAN see — i.e. you can
   * lean out and shoot. Default 1.0m.
   */
  peekDistance?: number;
  eyeHeight?: number;
}

export interface EqsCustomTest extends EqsTestBase {
  kind: 'custom';
  /** Return 0..1 to score, or null to reject. */
  evaluate: (item: EqsItem, ctx: EqsContext) => number | null;
}

export type EqsTest =
  | EqsDistanceTest
  | EqsLineOfSightTest
  | EqsNavigableTest
  | EqsDotTest
  | EqsCoverTest
  | EqsCustomTest;

export interface EqsQuery {
  /** Candidate positions. Use {@link EqsGenerators} to build them. */
  items: THREE.Vector3[];
  tests: EqsTest[];
}

export interface EqsResult {
  items: EqsItem[];
  /** Highest-scoring surviving item, or null when everything was filtered out. */
  best: EqsItem | null;
  generated: number;
  survived: number;
}

/** Candidate-position generators. All output is WORLD space. */
export const EqsGenerators = {
  /** Axis-aligned grid of `spacing`-separated points covering ±extent around `center`. */
  grid(center: THREE.Vector3, extent: number, spacing: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const steps = Math.max(0, Math.floor(extent / Math.max(1e-3, spacing)));
    for (let iz = -steps; iz <= steps; iz++) {
      for (let ix = -steps; ix <= steps; ix++) {
        out.push(new THREE.Vector3(center.x + ix * spacing, center.y, center.z + iz * spacing));
      }
    }
    return out;
  },

  /** `count` points evenly spaced on a circle of `radius` around `center`. */
  ring(center: THREE.Vector3, radius: number, count: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const n = Math.max(1, Math.floor(count));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(new THREE.Vector3(center.x + Math.cos(a) * radius, center.y, center.z + Math.sin(a) * radius));
    }
    return out;
  },

  /** Concentric rings between `inner` and `outer` — the standard flanking generator. */
  donut(
    center: THREE.Vector3,
    inner: number,
    outer: number,
    rings: number,
    pointsPerRing: number,
  ): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const r = Math.max(1, Math.floor(rings));
    for (let i = 0; i < r; i++) {
      const t = r === 1 ? 0 : i / (r - 1);
      const radius = inner + (outer - inner) * t;
      // Stagger each ring so points don't line up into spokes.
      const offset = (i % 2) * (Math.PI / Math.max(1, pointsPerRing));
      for (let j = 0; j < pointsPerRing; j++) {
        const a = (j / pointsPerRing) * Math.PI * 2 + offset;
        out.push(new THREE.Vector3(center.x + Math.cos(a) * radius, center.y, center.z + Math.sin(a) * radius));
      }
    }
    return out;
  },

  /** Pass-through for hand-authored or gameplay-supplied points. */
  points(list: THREE.Vector3[]): THREE.Vector3[] {
    return list.map((p) => p.clone());
  },
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * EnvironmentQuery.ts — EQS: "where should I stand?"
 *
 * The AI stack could path to a point and steer along it, but nothing could CHOOSE a
 * point: no cover selection, no flanking, no line-of-sight scoring. Behaviour trees
 * were stuck with hardcoded destinations. This is the generator → test → score pipeline
 * that answers spatial questions:
 *
 *   const result = EnvironmentQuery.run({
 *     items: EqsGenerators.donut(enemyPos, 4, 12, 3, 12),
 *     tests: [
 *       { kind: 'navigable' },
 *       { kind: 'distance', from: 'target', min: 3, max: 15, prefer: 'far', weight: 1 },
 *       { kind: 'cover', weight: 3 },
 *     ],
 *   }, ctx);
 *   agent.navigateTo(result.best.position);
 *
 * Tests run in order and short-circuit: a filter rejection stops further work on that
 * item, so put cheap filters (distance, navigable) before expensive ones (raycasts).
 */
export class EnvironmentQuery {
  static run(query: EqsQuery, ctx: EqsContext): EqsResult {
    const items: EqsItem[] = query.items.map((p) => ({
      position: p.clone(),
      score: 0,
      breakdown: {},
    }));

    let totalWeight = 0;
    for (const test of query.tests) {
      if ((test.mode ?? 'score') === 'score') totalWeight += test.weight ?? 1;
    }

    for (const item of items) {
      let accumulated = 0;
      for (const test of query.tests) {
        const name = test.name ?? test.kind;
        const raw = EnvironmentQuery.evaluate(test, item, ctx);
        if (raw === null) {
          item.rejectedBy = name;
          item.score = -1;
          break;
        }
        item.breakdown[name] = raw;
        if ((test.mode ?? 'score') === 'score') accumulated += raw * (test.weight ?? 1);
      }
      if (item.rejectedBy) continue;
      item.score = totalWeight > 0 ? accumulated / totalWeight : 1;
    }

    const survived = items.filter((i) => !i.rejectedBy);
    survived.sort((a, b) => b.score - a.score);

    return {
      items: survived,
      best: survived.length > 0 ? survived[0] : null,
      generated: items.length,
      survived: survived.length,
    };
  }

  /** Convenience: run and return just the winning position. */
  static bestPosition(query: EqsQuery, ctx: EqsContext): THREE.Vector3 | null {
    return EnvironmentQuery.run(query, ctx).best?.position ?? null;
  }

  // --- test implementations -------------------------------------------------

  /** @returns 0..1 score, or null to reject the item. */
  private static evaluate(test: EqsTest, item: EqsItem, ctx: EqsContext): number | null {
    switch (test.kind) {
      case 'distance': return EnvironmentQuery.testDistance(test, item, ctx);
      case 'line_of_sight': return EnvironmentQuery.testLineOfSight(test, item, ctx);
      case 'navigable': return EnvironmentQuery.testNavigable(test, item, ctx);
      case 'dot': return EnvironmentQuery.testDot(test, item, ctx);
      case 'cover': return EnvironmentQuery.testCover(test, item, ctx);
      case 'custom': return test.evaluate(item, ctx);
    }
  }

  private static testDistance(test: EqsDistanceTest, item: EqsItem, ctx: EqsContext): number | null {
    const origin = test.from === 'target' ? ctx.target : ctx.querier;
    if (!origin) return null;
    const dist = item.position.distanceTo(origin);

    const isFilter = (test.mode ?? 'score') === 'filter' || test.min !== undefined || test.max !== undefined;
    if (isFilter) {
      if (test.min !== undefined && dist < test.min) return null;
      if (test.max !== undefined && dist > test.max) return null;
    }

    // Normalize into 0..1 across the declared band (or a 50m default span).
    const lo = test.min ?? 0;
    const hi = test.max ?? Math.max(lo + 1e-3, 50);
    const t = THREE.MathUtils.clamp((dist - lo) / (hi - lo), 0, 1);
    const preferFar = test.prefer === 'far';
    return EnvironmentQuery.applyCurve(preferFar ? t : 1 - t, test.curve);
  }

  private static testLineOfSight(test: EqsLineOfSightTest, item: EqsItem, ctx: EqsContext): number | null {
    if (!ctx.lineOfSight || !ctx.target) return null;
    const eye = test.eyeHeight ?? 1.6;
    _a.copy(item.position); _a.y += eye;
    _b.copy(ctx.target); _b.y += eye;

    const visible = ctx.lineOfSight(_a, _b);
    const wantVisible = (test.want ?? 'visible') === 'visible';
    const pass = visible === wantVisible;
    if ((test.mode ?? 'score') === 'filter' && !pass) return null;
    return pass ? 1 : 0;
  }

  private static testNavigable(test: EqsNavigableTest, item: EqsItem, ctx: EqsContext): number | null {
    if (!ctx.nav) return null;
    const walkable = ctx.nav.isWalkableAt(item.position.x, item.position.z);
    // Navigability is a hard fact: an unreachable spot is never a good answer, so this
    // test filters by default rather than merely scoring low.
    if (!walkable) return (test.mode ?? 'filter') === 'filter' ? null : 0;
    if (test.snapToFloor !== false) {
      const y = ctx.nav.heightAt(item.position.x, item.position.z);
      if (y !== null) item.position.y = y;
    }
    return 1;
  }

  private static testDot(test: EqsDotTest, item: EqsItem, ctx: EqsContext): number | null {
    let reference: THREE.Vector3 | undefined;
    if ((test.against ?? 'querier_forward') === 'querier_forward') {
      reference = ctx.querierForward;
    } else if (ctx.target) {
      reference = _b.subVectors(ctx.target, ctx.querier).normalize();
    }
    if (!reference) return null;

    _dir.subVectors(item.position, ctx.querier);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-8) return 1; // standing on the query origin
    _dir.normalize();

    const dot = _dir.dot(reference);
    if (test.min !== undefined && dot < test.min) return null;
    return THREE.MathUtils.clamp((dot + 1) / 2, 0, 1);
  }

  private static testCover(test: EqsCoverTest, item: EqsItem, ctx: EqsContext): number | null {
    if (!ctx.lineOfSight || !ctx.target) return null;
    const eye = test.eyeHeight ?? 1.6;
    const peek = test.peekDistance ?? 1.0;

    _a.copy(item.position); _a.y += eye;
    _b.copy(ctx.target); _b.y += eye;
    const exposedHere = ctx.lineOfSight(_a, _b);
    if (exposedHere) {
      // Standing in the open is not cover.
      return (test.mode ?? 'score') === 'filter' ? null : 0;
    }

    // Perpendicular peek offsets: cover you cannot shoot from is a dead end.
    _dir.subVectors(ctx.target, item.position);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-8) return 0.5;
    _dir.normalize();
    const px = -_dir.z, pz = _dir.x;

    let peeks = 0;
    for (const sign of [1, -1]) {
      _a.set(item.position.x + px * peek * sign, item.position.y + eye, item.position.z + pz * peek * sign);
      if (ctx.lineOfSight(_a, _b)) peeks++;
    }
    // 1.0 = hidden with a firing angle on both sides, 0.5 = one side, 0.25 = pure hiding.
    if (peeks === 2) return 1;
    if (peeks === 1) return 0.75;
    return 0.25;
  }

  private static applyCurve(t: number, curve: EqsScoreCurve = 'linear'): number {
    switch (curve) {
      case 'square': return t * t;
      case 'inverse': return 1 - t;
      case 'inverse_square': return (1 - t) * (1 - t);
      default: return t;
    }
  }
}
