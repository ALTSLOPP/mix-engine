import * as THREE from 'three';

/**
 * Path.ts — a world-space Catmull-Rom spline used by both the CinematicCamera
 * (dolly / crane shots) and the AI `follow_path` command (entities & cameras that
 * travel along a curve). Control points are stored in WORLD space so a floating-
 * origin shift never corrupts the authored curve; callers sample in world space
 * and convert to engine space at the moment of application (same contract as
 * AIBridge spawn/teleport coords).
 *
 * Sampling is arc-length reparameterised so `t ∈ [0,1]` maps to uniform distance
 * along the curve — a dolly moving at constant `t`-speed travels at constant
 * metres/second, regardless of control-point spacing.
 */
export class Path {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly lengths: number[] = [];
  private readonly cumLengths: number[] = [];
  private totalLength = 0;

  constructor(points: THREE.Vector3[], closed = false) {
    if (points.length < 2) throw new Error('Path requires at least 2 control points');
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), closed, 'catmullrom', 0.5);

    // Build a lookup table for arc-length reparameterisation. 200 samples is smooth
    // enough for metre-scale camera moves without per-frame allocation.
    const N = 200;
    let cum = 0;
    let prev = this.curve.getPoint(0);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = this.curve.getPoint(t);
      const seg = i === 0 ? 0 : prev.distanceTo(p);
      this.lengths.push(seg);
      cum += seg;
      this.cumLengths.push(cum);
      prev = p;
    }
    this.totalLength = Math.max(cum, 1e-6);
  }

  get length(): number {
    return this.totalLength;
  }

  get closed(): boolean {
    return this.curve.closed;
  }

  /** Uniform-distance sample. `t ∈ [0,1]`; wraps on closed paths. */
  sampleUniform(t: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.curve.closed) t = t - Math.floor(t);
    else t = THREE.MathUtils.clamp(t, 0, 1);
    const targetDist = t * this.totalLength;
    // Binary search the cumulative-length table for the segment containing targetDist.
    let lo = 0;
    let hi = this.cumLengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumLengths[mid] < targetDist) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const segStart = this.cumLengths[i - 1];
    const segLen = Math.max(this.lengths[i], 1e-6);
    const localT = (targetDist - segStart) / segLen;
    // `globalT` is already a NATIVE curve parameter (the lookup table was built from
    // getPoint(i/N)), so sample with getPoint — NOT getPointAt, which would re-apply
    // three.js's own arc-length reparameterization on top and destroy uniform spacing.
    const globalT = (i - 1 + localT) / (this.cumLengths.length - 1);
    return this.curve.getPoint(THREE.MathUtils.clamp(globalT, 0, 1), out);
  }

  /** Tangent (forward direction) at uniform parameter t. Writes the unit tangent
   *  into `out` and returns it. At the open-path endpoints the forward difference
   *  would be zero (both samples clamp to the same point), so we fall back to a
   *  backward difference there to avoid a NaN from normalising a zero vector. */
  tangentUniform(t: number, out: THREE.Vector3): THREE.Vector3 {
    const closed = this.curve.closed;
    const t1 = closed ? t + 1e-3 : THREE.MathUtils.clamp(t + 1e-3, 0, 1);
    if (!closed && t1 >= 1) {
      // Backward difference at the end of an open path.
      this.sampleUniform(THREE.MathUtils.clamp(t - 1e-3, 0, 1), _tmpB); // _tmpB = a
      this.sampleUniform(t, out);                                       // out = b
      return out.sub(_tmpB).normalize();                                // out = b - a
    }
    this.sampleUniform(t, _tmpB);  // _tmpB = a (position at t)
    this.sampleUniform(t1, out);   // out = b (position at t+ε)
    return out.sub(_tmpB).normalize(); // out = b - a (the tangent)
  }
}

const _tmpB = new THREE.Vector3();
