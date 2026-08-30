import * as THREE from 'three';
import { TweenPool } from './TweenPool';

export type PathType = 'linear' | 'catmullrom' | 'bezier';

export interface WaypointMarker {
  name: string;
  distanceRatio: number; // 0 to 1
}

export interface PathOptions {
  type?: PathType;
  closed?: boolean;
  lutSamples?: number;
  banking?: boolean;
  maxBankAngle?: number; // radians
  lookAhead?: number; // delta t for tangent calculation (e.g. 0.01)
  curveTension?: number; // for catmull-rom
}

export class TweenPath {
  readonly points: THREE.Vector3[] = [];
  readonly type: PathType;
  readonly closed: boolean;
  readonly banking: boolean;
  readonly maxBankAngle: number;
  readonly lookAhead: number;

  private curve: THREE.Curve<THREE.Vector3> | null = null;
  private lutDistances: number[] = [];
  private totalLength = 0;
  readonly markers: WaypointMarker[] = [];

  constructor(points: THREE.Vector3[] | number[][], options: PathOptions = {}) {
    this.type = options.type ?? 'catmullrom';
    this.closed = options.closed ?? false;
    this.banking = options.banking ?? false;
    this.maxBankAngle = options.maxBankAngle ?? (Math.PI / 6);
    this.lookAhead = options.lookAhead ?? 0.02;

    this.points = points.map((p) => {
      if (p instanceof THREE.Vector3) return p.clone();
      return new THREE.Vector3(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
    });

    this.buildCurve(options.lutSamples ?? 100, options.curveTension ?? 0.5);
  }

  private buildCurve(samples: number, tension: number): void {
    if (this.points.length < 2) {
      this.totalLength = 0;
      return;
    }

    if (this.type === 'catmullrom') {
      this.curve = new THREE.CatmullRomCurve3(this.points, this.closed, 'catmullrom', tension);
    } else if (this.type === 'bezier' && this.points.length >= 4) {
      this.curve = new THREE.CubicBezierCurve3(
        this.points[0],
        this.points[1],
        this.points[2],
        this.points[3],
      );
    } else {
      // Linear path composed of segments
      const curvePath = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < this.points.length - 1; i++) {
        curvePath.add(new THREE.LineCurve3(this.points[i], this.points[i + 1]));
      }
      if (this.closed && this.points.length > 2) {
        curvePath.add(new THREE.LineCurve3(this.points[this.points.length - 1], this.points[0]));
      }
      this.curve = curvePath;
    }

    this.totalLength = this.curve.getLength();

    // Build Arc-Length LUT for constant-speed parameterization
    this.lutDistances = [0];
    this.curve.arcLengthDivisions = Math.max(samples, 100);
    this.curve.updateArcLengths();

    for (let i = 1; i <= samples; i++) {
      const u = i / samples;
      this.lutDistances.push(u * this.totalLength);
    }
  }

  get length(): number {
    return this.totalLength;
  }

  addMarker(name: string, distanceRatio: number): this {
    this.markers.push({ name, distanceRatio: Math.min(Math.max(distanceRatio, 0), 1) });
    return this;
  }

  /**
   * Convert normalized arc-length distance s [0, 1] to curve parameter u [0, 1] using LUT
   */
  getUFromDistanceRatio(s: number): number {
    if (s <= 0) return 0;
    if (s >= 1) return 1;
    if (!this.curve || this.totalLength === 0) return s;
    return this.curve.getUtoTmapping(s, 0);
  }

  /**
   * Sample position at normalized arc length s in [0, 1]
   */
  samplePosition(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.curve || this.points.length === 0) return out.set(0, 0, 0);
    if (this.points.length === 1) return out.copy(this.points[0]);

    const clampedS = Math.min(Math.max(s, 0), 1);
    return this.curve.getPointAt(clampedS, out);
  }

  /**
   * Sample forward tangent vector at normalized arc length s in [0, 1]
   */
  sampleTangent(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.curve || this.points.length < 2) return out.set(0, 0, 1);

    const clampedS = Math.min(Math.max(s, 0), 1);
    if ('getTangentAt' in this.curve && typeof (this.curve as any).getTangentAt === 'function') {
      return (this.curve as any).getTangentAt(clampedS, out).normalize();
    }

    // Numerical forward finite difference fallback
    const s2 = Math.min(clampedS + this.lookAhead, 1);
    const scratch1 = TweenPool.acquireVector3();
    const scratch2 = TweenPool.acquireVector3();
    const p1 = this.curve.getPointAt(clampedS, scratch1);
    const p2 = this.curve.getPointAt(s2, scratch2);
    out.subVectors(p2, p1).normalize();
    TweenPool.releaseVector3(scratch1);
    TweenPool.releaseVector3(scratch2);
    return out;
  }

  /**
   * Sample orientation quaternion looking along the path tangent with optional banking on turns.
   */
  sampleOrientation(s: number, out = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)): THREE.Quaternion {
    const tangent = this.sampleTangent(s, TweenPool.acquireVector3());
    if (tangent.lengthSq() < 1e-6) {
      TweenPool.releaseVector3(tangent);
      return out.identity();
    }

    // Construct look rotation
    const m = new THREE.Matrix4();
    const right = TweenPool.acquireVector3().crossVectors(up, tangent).normalize();
    const correctedUp = TweenPool.acquireVector3().crossVectors(tangent, right).normalize();

    m.makeBasis(right, correctedUp, tangent);
    out.setFromRotationMatrix(m);

    // Apply banking based on rate of tangent turning
    if (this.banking && s < 0.98) {
      const futureTangent = this.sampleTangent(Math.min(s + this.lookAhead, 1), TweenPool.acquireVector3());
      const cross = TweenPool.acquireVector3().crossVectors(tangent, futureTangent);
      const curvature = cross.y;
      const bankAngle = Math.max(-this.maxBankAngle, Math.min(this.maxBankAngle, curvature * 10));

      const bankQuat = TweenPool.acquireQuaternion().setFromAxisAngle(tangent, bankAngle);
      out.multiply(bankQuat);
      TweenPool.releaseQuaternion(bankQuat);
      TweenPool.releaseVector3(cross);
      TweenPool.releaseVector3(futureTangent);
    }

    TweenPool.releaseVector3(correctedUp);
    TweenPool.releaseVector3(right);
    TweenPool.releaseVector3(tangent);
    return out;
  }
}
