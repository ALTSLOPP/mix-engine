import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EditorTool } from '../engine/ToolManager';

/**
 * Viewport spline tool: click on the terrain to drop control points, then Apply to conform the
 * terrain to the path (road/rail = flatten, river = carve). Self-wires pointer events like the
 * brush/paint tools — a CLICK (no drag) places a point, so camera orbiting doesn't add stray points.
 */
export class TerrainSplineTool implements EditorTool {
  readonly id = 'terrain-spline';
  points: THREE.Vector3[] = [];          // world-space control points
  radius = 5;
  hardness = 0.5;
  mode: 'flatten' | 'carve' = 'flatten';

  private readonly ndc = new THREE.Vector2();
  private readonly downNdc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private offs: Array<() => void> = [];

  private markers: THREE.Mesh[] = [];
  private lineHelper: THREE.Line | null = null;
  private readonly markerGeom = new THREE.SphereGeometry(0.6, 10, 10);
  private readonly markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false });

  constructor(private readonly engine: Engine) {}

  private get canvas() { return this.engine.viewport.renderer.domElement; }

  activate(): void {
    const onMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    this.canvas.addEventListener('pointermove', onMove);
    this.offs.push(() => this.canvas.removeEventListener('pointermove', onMove));

    const onDown = (e: { button: number }) => { if (e.button === 0) this.downNdc.copy(this.ndc); };
    const onUp = (e: { button: number }) => {
      if (e.button !== 0) return;
      // Treat as a point-placement click only if the pointer barely moved (else it was a camera drag).
      if (this.ndc.distanceTo(this.downNdc) < 0.02) this.placePoint();
    };
    this.offs.push(this.engine.input.on('pointerdown', onDown), this.engine.input.on('pointerup', onUp));
    this.updateVisuals();
  }

  deactivate(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.clearVisuals();
  }

  private placePoint(): void {
    const f = this.engine.terrain.firstField();
    if (!f) return;
    this.ray.setFromCamera(this.ndc, this.engine.viewport.camera);
    const localHit = new THREE.Vector3();
    if (!this.engine.terrain.raycastLocal(f, this.ray, localHit)) return;
    const enginePt = localHit.applyMatrix4(f.mesh.matrixWorld);      // local → engine
    const worldPt = this.engine.worldOrigin.toWorldSpace(enginePt);  // engine → world
    this.points.push(worldPt);
    this.updateVisuals();
  }

  /** Conform the terrain to the current control points, then clear them. */
  apply(): void {
    if (this.points.length < 2) return;
    const f = this.engine.terrain.firstField();
    if (f) this.engine.terrain.splineConformWorld(f, this.points, this.radius, this.hardness, { mode: this.mode });
    this.points = [];
    this.updateVisuals();
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch { /* non-browser */ }
    }
  }

  clear(): void {
    this.points = [];
    this.updateVisuals();
  }

  private updateVisuals(): void {
    this.clearVisuals();
    if (this.points.length === 0) return;
    for (const pt of this.points) {
      const mesh = new THREE.Mesh(this.markerGeom, this.markerMat);
      mesh.position.copy(this.engine.worldOrigin.toEngineSpace(pt.clone()));
      mesh.renderOrder = 999;
      this.engine.viewport.scene.add(mesh);
      this.markers.push(mesh);
    }
    if (this.points.length > 1) {
      const enginePoints = this.points.map(p => this.engine.worldOrigin.toEngineSpace(p.clone()));
      const lineGeom = new THREE.BufferGeometry().setFromPoints(enginePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false });
      this.lineHelper = new THREE.Line(lineGeom, lineMat);
      this.lineHelper.renderOrder = 999;
      this.engine.viewport.scene.add(this.lineHelper);
    }
  }

  private clearVisuals(): void {
    for (const m of this.markers) this.engine.viewport.scene.remove(m);
    this.markers = [];
    if (this.lineHelper) {
      this.engine.viewport.scene.remove(this.lineHelper);
      this.lineHelper.geometry.dispose();
      (this.lineHelper.material as THREE.Material).dispose();
      this.lineHelper = null;
    }
  }
}
