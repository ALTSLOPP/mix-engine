import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EditorTool } from '../engine/ToolManager';
import type { TerrainField } from './TerrainField';
import type { BrushOp, BrushSettings } from './TerrainSystem';

export class TerrainBrushTool implements EditorTool {
  readonly id = 'terrain-brush';
  brushOp: BrushOp = 'raise';
  readonly settings: BrushSettings = { radius: 20, strength: 0.5, hardness: 0.5 };

  private painting = false;
  private readonly center = new THREE.Vector3();
  private readonly lastDab = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private px = 0; private py = 0;
  private cursor!: THREE.Mesh;
  private offs: Array<() => void> = [];
  
  private anchorA: THREE.Vector3 | null = null;

  constructor(private readonly engine: Engine) {
    this.buildCursor();
  }

  private buildCursor(): void {
    const geom = new THREE.TorusGeometry(0.5, 0.05, 16, 64);
    geom.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false });
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
    this.anchorA = null;
  }

  private beginStroke(): void {
    this.painting = true;
    this.lastDab.set(0, 0, 0);
    
    const f = this.engine.terrain.firstField();
    if (!f || !this.engine.terrain.raycastLocal(f, this.ray, this.center)) {
      this.painting = false;
      return;
    }
    
    this.engine.terrain.history.beginStroke(f);

    if (this.brushOp === 'flatten') {
      this.settings.targetHeight = f.hm.sampleLocal(this.center.x, this.center.z);
    }
    
    if (this.brushOp === 'ramp') {
      if (!this.anchorA) {
        this.anchorA = this.center.clone();
        this.anchorA.y = f.hm.sampleLocal(this.anchorA.x, this.anchorA.z);
      } else {
        const anchorB = this.center.clone();
        anchorB.y = f.hm.sampleLocal(anchorB.x, anchorB.z);
        this.engine.terrain.rampLocal(f, this.anchorA, anchorB, this.settings.radius, this.settings.hardness);
        this.anchorA = null;
        this.endStroke();
        this.painting = false;
      }
    }
  }

  private endStroke(): void {
    this.painting = false;
    const f = this.engine.terrain.firstField();
    if (f) {
      f.markColliderDirty();   // background rebuild (debounced in TerrainSystem) — no stroke-end hitch
      this.engine.terrain.history.commitIfNeeded(f);
    }
    // dispatch mix:scene-changed
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch {}
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

      if (this.painting && this.brushOp !== 'ramp') {
        const spacing = 0.25;
        const moved = this.lastDab.lengthSq() === 0 ? Infinity : this.center.distanceTo(this.lastDab);
        if (moved >= this.settings.radius * spacing) {
          if (this.brushOp === 'noise') {
            this.engine.terrain.noiseLocal(f, this.center.x, this.center.z, this.settings.radius, this.settings.amplitude ?? 3, this.settings.frequency ?? 0.02, this.settings.seed ?? 1, this.settings.octaves ?? 5, this.settings.hardness);
          } else if (this.brushOp === 'erode') {
            const half = Math.ceil(this.settings.radius / f.hm.step);
            const cx = f.hm.toI(this.center.x);
            const cz = f.hm.toJ(this.center.z);
            this.engine.terrain.erode(f, {
              i0: Math.max(0, cx - half),
              i1: Math.min(f.hm.res - 1, cx + half),
              j0: Math.max(0, cz - half),
              j1: Math.min(f.hm.res - 1, cz + half)
            }, this.settings.erodeKind || 'hydraulic', { iterations: Math.floor(this.settings.strength * 5000), ...this.settings });
          } else {
            this.engine.terrain.sculptLocal(
              f,
              this.brushOp,
              this.center.x,
              this.center.z,
              this.settings.strength * 20 * dt,
              this.settings
            );
          }
          this.lastDab.copy(this.center);
        }
      }
    }
  }
}
