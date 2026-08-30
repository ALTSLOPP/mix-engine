import * as THREE from 'three';

interface DebugLine {
  type: 'line';
  mesh: THREE.Line;
  expireAt: number;
  lifetime: number;
}

interface DebugBox {
  type: 'box';
  mesh: THREE.LineSegments;
  expireAt: number;
  lifetime: number;
}

interface DebugSphere {
  type: 'sphere';
  mesh: THREE.LineSegments;
  expireAt: number;
  lifetime: number;
}

interface DebugText {
  type: 'text';
  sprite: THREE.Sprite;
  expireAt: number;
  lifetime: number;
}

type DebugPrimitive = DebugLine | DebugBox | DebugSphere | DebugText;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

/**
 * DebugDraw — transient 3D debug primitives for AI visibility.
 *
 * Lines, boxes, spheres, and text sprites that auto-expire after a lifetime
 * (or persist until manually cleared). The IDE uses AIBridge commands like
 * `draw_debug_line`, `draw_debug_box`, `draw_debug_text` to visualise
 * pathfinding waypoints, velocity vectors, steering forces, raycast hits, etc.
 * so the AI can "see" its math in SENSORIUM recordings.
 */
export class DebugDraw {
  private readonly primitives: DebugPrimitive[] = [];
  private readonly scene: THREE.Scene;
  private enabled = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.clearAll();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // ── Line ────────────────────────────────────────────────────────────────

  drawLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: number | string = 0x00ff00,
    lifetime = 5,
  ): void {
    if (!this.enabled) return;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mesh = new THREE.Line(geo, mat);
    mesh.renderOrder = 9999;
    this.scene.add(mesh);
    this.primitives.push({ type: 'line', mesh, expireAt: performance.now() + lifetime * 1000, lifetime });
  }

  drawRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    color: number | string = 0xff4400,
    lifetime = 5,
  ): void {
    const to = _v.copy(origin).addScaledVector(direction, length);
    this.drawLine(origin, to, color, lifetime);
  }

  // ── Box ─────────────────────────────────────────────────────────────────

  drawBox(
    center: THREE.Vector3,
    size: THREE.Vector3,
    color: number | string = 0xffff00,
    lifetime = 5,
  ): void {
    if (!this.enabled) return;
    const half = _v.copy(size).multiplyScalar(0.5);
    const min = _center.copy(center).sub(half);
    const max = _size.copy(center).add(half);
    _box.set(min, max);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const geo = new THREE.BoxGeometry(_box.max.x - _box.min.x, _box.max.y - _box.min.y, _box.max.z - _box.min.z);
    const edges = new THREE.EdgesGeometry(geo);
    const mesh = new THREE.LineSegments(edges, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 9999;
    this.scene.add(mesh);
    this.primitives.push({ type: 'box', mesh, expireAt: performance.now() + lifetime * 1000, lifetime });
  }

  // ── Sphere ──────────────────────────────────────────────────────────────

  drawSphere(
    center: THREE.Vector3,
    radius: number,
    color: number | string = 0x00ffff,
    lifetime = 5,
  ): void {
    if (!this.enabled) return;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const geo = new THREE.SphereGeometry(radius, 16, 12);
    const edges = new THREE.EdgesGeometry(geo);
    const mesh = new THREE.LineSegments(edges, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 9999;
    this.scene.add(mesh);
    this.primitives.push({ type: 'sphere', mesh, expireAt: performance.now() + lifetime * 1000, lifetime });
  }

  // ── Text ────────────────────────────────────────────────────────────────

  drawText(
    position: THREE.Vector3,
    text: string,
    color: number | string = 0xffffff,
    size = 0.5,
    lifetime = 5,
  ): void {
    if (!this.enabled) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 512;
    canvas.height = 128;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hex = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
    ctx.font = 'Bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline for readability.
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = hex;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(position);
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(size * aspect, size, 1);
    sprite.renderOrder = 10000;
    this.scene.add(sprite);
    this.primitives.push({ type: 'text', sprite, expireAt: performance.now() + lifetime * 1000, lifetime });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Call each frame to fade + remove expired primitives. */
  update(dt: number): void {
    const now = performance.now();
    for (let i = this.primitives.length - 1; i >= 0; i--) {
      const p = this.primitives[i];
      const remaining = (p.expireAt - now) / 1000;
      if (remaining <= 0) {
        this.removePrimitive(i);
        continue;
      }
      // Fade out in the last 20% of lifetime.
      const lifespan = this.lifespanOf(p);
      if (lifespan > 0 && remaining < lifespan * 0.2) {
        const alpha = Math.max(0, remaining / (lifespan * 0.2));
        this.setOpacity(p, alpha);
      }
    }
  }

  private lifespanOf(p: DebugPrimitive): number {
    return p.lifetime;
  }

  private setOpacity(p: DebugPrimitive, alpha: number): void {
    switch (p.type) {
      case 'line':
      case 'box':
      case 'sphere':
        (p.mesh.material as THREE.LineBasicMaterial).opacity = alpha;
        break;
      case 'text':
        (p.sprite.material as THREE.SpriteMaterial).opacity = alpha;
        break;
    }
  }

  private removePrimitive(index: number): void {
    const p = this.primitives[index];
    this.primitives.splice(index, 1);
    switch (p.type) {
      case 'line':
      case 'box':
      case 'sphere':
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        break;
      case 'text':
        this.scene.remove(p.sprite);
        const mat = p.sprite.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
        break;
    }
  }

  /** Remove all primitives immediately. */
  clearAll(): void {
    for (let i = this.primitives.length - 1; i >= 0; i--) {
      this.removePrimitive(i);
    }
  }

  dispose(): void {
    this.clearAll();
  }
}
