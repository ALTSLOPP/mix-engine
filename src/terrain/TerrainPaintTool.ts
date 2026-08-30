import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EditorTool } from '../engine/ToolManager';
import type { BrushSettings } from './TerrainSystem';

export class TerrainPaintTool implements EditorTool {
  readonly id = 'terrain-paint';
  layer: number = 1;
  readonly settings: BrushSettings = { radius: 10, strength: 0.5, hardness: 0.5 };

  private painting = false;
  private readonly center = new THREE.Vector3();
  private readonly lastDab = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private px = 0; private py = 0;
  private cursor!: THREE.Mesh;
  private offs: Array<() => void> = [];

  constructor(private readonly engine: Engine) {
    this.buildCursor();
  }

  private buildCursor(): void {
    const geom = new THREE.TorusGeometry(0.5, 0.05, 16, 64);
    geom.rotateX(Math.PI / 2);
    // Greenish cursor to differentiate from sculpt brush
    const mat = new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.8, depthTest: false });
    this.cursor = new THREE.Mesh(geom, mat);
    this.cursor.renderOrder = 999;
    this.cursor.visible = false;
    this.engine.viewport.scene.add(this.cursor);
  }

  private get canvas() { return this.engine.viewport.renderer.domElement; }

  activate(): void {
    this.cursor.visible = true;
    
    const onPointerMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.px = e.clientX - rect.left;
      this.py = e.clientY - rect.top;
      this.ndc.set((this.px / rect.width) * 2 - 1, -(this.py / rect.height) * 2 + 1);
    };
    
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.offs.push(() => this.canvas.removeEventListener('pointermove', onPointerMove));

    const onPointerDown = (e: { button: number }) => {
      if (e.button === 0) this.beginStroke();
    };
    const onPointerUp = (e: { button: number }) => {
      if (e.button === 0) this.endStroke();
    };

    this.offs.push(
      this.engine.input.on('pointerdown', onPointerDown),
      this.engine.input.on('pointerup', onPointerUp)
    );
  }

  deactivate(): void {
    for (const off of this.offs) off();
    this.offs = [];
    if (this.painting) this.endStroke();
    this.cursor.visible = false;
  }

  private beginStroke(): void {
    this.painting = true;
    this.lastDab.set(0, 0, 0);
  }

  private endStroke(): void {
    if (!this.painting) return;
    this.painting = false;
    // Let the editor autosave the new splat weights (mirrors the sculpt tool's stroke-end).
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch { /* non-browser */ }
    }
  }

  tick(dt: number): void {
    const f = this.engine.terrain.firstField();
    if (!f) return;

    this.ray.setFromCamera(this.ndc, this.engine.viewport.camera);
    if (this.engine.terrain.raycastLocal(f, this.ray, this.center)) {
      const cw = this.center.clone();
      cw.y = f.hm.sampleLocal(cw.x, cw.z);
      this.cursor.position.copy(f.mesh.localToWorld(cw));
      const scale = this.settings.radius * 2;
      this.cursor.scale.set(scale, scale, scale);

      if (this.painting) {
        const spacing = 0.25;
        const moved = this.lastDab.lengthSq() === 0 ? Infinity : this.center.distanceTo(this.lastDab);
        if (moved >= this.settings.radius * spacing) {
          this.engine.terrain.paintLocal(f, this.layer, this.center.x, this.center.z, this.settings);
          this.lastDab.copy(this.center);
        }
      }
    }
  }
}
