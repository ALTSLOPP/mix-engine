import * as THREE from 'three';

/**
 * InstancedEffectPool.ts — allocation-free, ring-buffered instanced VFX pools.
 *
 * Ported from the GTA prototype's `WeaponSystem.tsx` effect pools. The engine's
 * `ParticleEmitter` (spawn_vfx) is great for soft cinematic clouds, but high-frequency
 * gameplay effects — bullet tracers, muzzle flashes, hit sparks — want a different
 * profile: hundreds per second, zero per-spawn allocation, one draw call per visual.
 *
 * This module keeps three fixed-size `InstancedMesh` pools (tracer / flash / spark) and a
 * ring-buffer cursor per pool. Spawning writes into the next slot (overwriting the oldest
 * if saturated) — never allocates. Each frame, `update(dt)` ages live slots, rewrites their
 * instance matrices, hides dead ones (off-screen scale-0 matrix), and flips a single
 * `instanceMatrix.needsUpdate` per dirtied pool. All positions are SCENE/ENGINE space (the
 * pools are added as root scene children, so they ride the floating-origin shift like any
 * other Object3D).
 *
 * Usage:
 *   const fx = new InstancedEffectPool(viewport.scene);
 *   fx.tracer(startEngine, endEngine, { color: 0xffd98a });
 *   fx.flash(posEngine, 1.2);
 *   fx.spark(posEngine, 6, 1);
 *   // once per frame:
 *   fx.update(dt);
 */

export interface InstancedEffectPoolOptions {
  maxTracers?: number;
  maxFlashes?: number;
  maxSparks?: number;
  tracerLifetime?: number;
  flashLifetime?: number;
  sparkLifetime?: number;
  tracerColor?: THREE.ColorRepresentation;
  flashColor?: THREE.ColorRepresentation;
  sparkColor?: THREE.ColorRepresentation;
}

interface TracerSlot {
  active: boolean;
  age: number;
  life: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
}

interface PointSlot {
  active: boolean;
  age: number;
  life: number;
  position: THREE.Vector3;
  scale: number;
}

const HIDDEN = (() => {
  const m = new THREE.Matrix4();
  m.makeScale(0.0001, 0.0001, 0.0001);
  m.setPosition(0, -100000, 0);
  return m;
})();

export class InstancedEffectPool {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();

  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly flashMesh: THREE.InstancedMesh;
  private readonly sparkMesh: THREE.InstancedMesh;

  private readonly tracers: TracerSlot[];
  private readonly flashes: PointSlot[];
  private readonly sparks: PointSlot[];

  private tracerCursor = 0;
  private flashCursor = 0;
  private sparkCursor = 0;

  private readonly maxTracers: number;
  private readonly maxFlashes: number;
  private readonly maxSparks: number;
  private readonly tracerLifetime: number;
  private readonly flashLifetime: number;
  private readonly sparkLifetime: number;

  private dirtyTracers = false;
  private dirtyFlashes = false;
  private dirtySparks = false;

  // Reusable scratch (no per-frame allocation in the hot path).
  private readonly _dummy = new THREE.Object3D();
  private readonly _yAxis = new THREE.Vector3(0, 1, 0);
  private readonly _mid = new THREE.Vector3();

  constructor(scene: THREE.Scene, opts: InstancedEffectPoolOptions = {}) {
    this.scene = scene;
    this.maxTracers = opts.maxTracers ?? 96;
    this.maxFlashes = opts.maxFlashes ?? 48;
    this.maxSparks = opts.maxSparks ?? 192;
    this.tracerLifetime = opts.tracerLifetime ?? 0.12;
    this.flashLifetime = opts.flashLifetime ?? 0.06;
    this.sparkLifetime = opts.sparkLifetime ?? 0.35;

    this.tracers = Array.from({ length: this.maxTracers }, () => ({
      active: false, age: 0, life: this.tracerLifetime,
      start: new THREE.Vector3(), end: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), radius: 0.04,
    }));
    this.flashes = Array.from({ length: this.maxFlashes }, () => ({
      active: false, age: 0, life: this.flashLifetime, position: new THREE.Vector3(), scale: 1,
    }));
    this.sparks = Array.from({ length: this.maxSparks }, () => ({
      active: false, age: 0, life: this.sparkLifetime, position: new THREE.Vector3(), scale: 1,
    }));

    const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: opts.tracerColor ?? 0xffd98a, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, this.maxTracers);

    const flashGeo = new THREE.SphereGeometry(0.24, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: opts.flashColor ?? 0xffd98a, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.flashMesh = new THREE.InstancedMesh(flashGeo, flashMat, this.maxFlashes);

    const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: opts.sparkColor ?? 0xff9c3d, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, this.maxSparks);

    for (const m of [this.tracerMesh, this.flashMesh, this.sparkMesh]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Bullet/utility raycasts and editor picks should ignore these ephemeral effects.
      m.userData.ignoreRaycastIndex = true;
      m.userData.ignoreBulletRaycast = true;
      this.group.add(m);
    }
    // Start fully hidden.
    for (let i = 0; i < this.maxTracers; i++) this.tracerMesh.setMatrixAt(i, HIDDEN);
    for (let i = 0; i < this.maxFlashes; i++) this.flashMesh.setMatrixAt(i, HIDDEN);
    for (let i = 0; i < this.maxSparks; i++) this.sparkMesh.setMatrixAt(i, HIDDEN);
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    this.flashMesh.instanceMatrix.needsUpdate = true;
    this.sparkMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.group);
  }

  /** Spawn a tracer streak between two ENGINE-space points. */
  tracer(start: THREE.Vector3, end: THREE.Vector3, opts: { radius?: number; life?: number } = {}): void {
    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.maxTracers;
    slot.active = true;
    slot.age = 0;
    slot.life = opts.life ?? this.tracerLifetime;
    slot.start.copy(start);
    slot.end.copy(end);
    slot.direction.copy(end).sub(start);
    if (slot.direction.lengthSq() <= 1e-8) slot.direction.set(0, 0, -1); else slot.direction.normalize();
    slot.radius = opts.radius ?? 0.04;
    this.dirtyTracers = true;
  }

  /** Spawn a muzzle/impact flash at an ENGINE-space point. */
  flash(position: THREE.Vector3, scale = 1): void {
    const slot = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.maxFlashes;
    slot.active = true;
    slot.age = 0;
    slot.position.copy(position);
    slot.scale = scale;
    this.dirtyFlashes = true;
  }

  /** Spawn `count` sparks scattered around an ENGINE-space point. */
  spark(position: THREE.Vector3, count = 5, scale = 1): void {
    for (let i = 0; i < count; i++) {
      const slot = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.maxSparks;
      slot.active = true;
      slot.age = 0;
      slot.position.set(
        position.x + (Math.random() - 0.5) * 0.55,
        position.y + (Math.random() - 0.5) * 0.4,
        position.z + (Math.random() - 0.5) * 0.55,
      );
      slot.scale = scale * (0.7 + Math.random() * 0.6);
    }
    this.dirtySparks = true;
  }

  /** Age all live slots and rewrite instance matrices. Call once per frame. */
  update(dt: number): void {
    const d = this._dummy;

    // Tracers (oriented cylinders spanning start→end, shrinking as they age).
    for (let i = 0; i < this.maxTracers; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      t.age += dt;
      if (t.age >= t.life) {
        t.active = false;
        this.tracerMesh.setMatrixAt(i, HIDDEN);
        this.dirtyTracers = true;
        continue;
      }
      const len = t.start.distanceTo(t.end);
      this._mid.lerpVectors(t.start, t.end, 0.5);
      d.position.copy(this._mid);
      d.quaternion.setFromUnitVectors(this._yAxis, t.direction);
      d.scale.set(t.radius, Math.max(0.001, len), t.radius);
      d.updateMatrix();
      this.tracerMesh.setMatrixAt(i, d.matrix);
      this.dirtyTracers = true;
    }

    // Flashes (expanding/fading spheres).
    for (let i = 0; i < this.maxFlashes; i++) {
      const f = this.flashes[i];
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= f.life) {
        f.active = false;
        this.flashMesh.setMatrixAt(i, HIDDEN);
        this.dirtyFlashes = true;
        continue;
      }
      const s = f.scale * (1.15 - f.age / f.life);
      d.position.copy(f.position);
      d.quaternion.identity();
      d.scale.setScalar(Math.max(0.2, s));
      d.updateMatrix();
      this.flashMesh.setMatrixAt(i, d.matrix);
      this.dirtyFlashes = true;
    }

    // Sparks (shrinking spheres).
    for (let i = 0; i < this.maxSparks; i++) {
      const sp = this.sparks[i];
      if (!sp.active) continue;
      sp.age += dt;
      if (sp.age >= sp.life) {
        sp.active = false;
        this.sparkMesh.setMatrixAt(i, HIDDEN);
        this.dirtySparks = true;
        continue;
      }
      const s = sp.scale * (1 - sp.age / sp.life);
      d.position.copy(sp.position);
      d.quaternion.identity();
      d.scale.setScalar(Math.max(0.12, s));
      d.updateMatrix();
      this.sparkMesh.setMatrixAt(i, d.matrix);
      this.dirtySparks = true;
    }

    if (this.dirtyTracers) { this.tracerMesh.instanceMatrix.needsUpdate = true; this.dirtyTracers = false; }
    if (this.dirtyFlashes) { this.flashMesh.instanceMatrix.needsUpdate = true; this.dirtyFlashes = false; }
    if (this.dirtySparks) { this.sparkMesh.instanceMatrix.needsUpdate = true; this.dirtySparks = false; }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const m of [this.tracerMesh, this.flashMesh, this.sparkMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
