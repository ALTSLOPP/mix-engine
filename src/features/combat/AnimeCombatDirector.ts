import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';

export type ImpactFrameStyle = 'invert' | 'black_white' | 'crimson' | 'gold' | 'neon_cyan';

export interface AnimeCombatDirectorConfig {
  enabled: boolean;
  hitStopDefaultScale: number;
  hitStopMaxDuration: number;
  impactFrameEnabled: boolean;
  defaultOutlineThickness: number;
  defaultOutlineColor: number;
  cameraPunchMultiplier: number;
}

export interface ImpactFrameState {
  active: boolean;
  style: ImpactFrameStyle;
  framesRemaining: number;
  colorHex: string;
}

export class AnimeCombatDirector {
  private config: AnimeCombatDirectorConfig;
  private impactState: ImpactFrameState = {
    active: false,
    style: 'black_white',
    framesRemaining: 0,
    colorHex: '#ffffff',
  };

  private hitStopTimer = 0;
  private originalTimeScale = 1.0;
  private inHitStop = false;
  private cameraPunchTimer = 0;
  private cameraOriginalFov = 60;
  private cameraTargetFov = 60;

  private overlayElement: HTMLDivElement | null = null;
  private readonly outlineMeshes = new Map<THREE.Mesh, THREE.Mesh>();

  constructor(
    private readonly engine: Engine,
    config: Partial<AnimeCombatDirectorConfig> = {}
  ) {
    this.config = {
      enabled: true,
      hitStopDefaultScale: 0.08,
      hitStopMaxDuration: 0.25,
      impactFrameEnabled: true,
      defaultOutlineThickness: 0.025,
      defaultOutlineColor: 0x0a0a0a,
      cameraPunchMultiplier: 1.0,
      ...config,
    };

    if (typeof document !== 'undefined') {
      this.initOverlay();
    }
  }

  getConfig(): Readonly<AnimeCombatDirectorConfig> {
    return { ...this.config };
  }

  setConfig(patch: Partial<AnimeCombatDirectorConfig>): void {
    Object.assign(this.config, patch);
  }

  private initOverlay(): void {
    if (typeof document === 'undefined') return;
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'anime-impact-frame-overlay';
    this.overlayElement.style.position = 'fixed';
    this.overlayElement.style.top = '0';
    this.overlayElement.style.left = '0';
    this.overlayElement.style.width = '100vw';
    this.overlayElement.style.height = '100vh';
    this.overlayElement.style.pointerEvents = 'none';
    this.overlayElement.style.zIndex = '9999';
    this.overlayElement.style.display = 'none';
    this.overlayElement.style.mixBlendMode = 'difference';
    document.body.appendChild(this.overlayElement);
  }

  /**
   * Triggers a classic anime impact frame (1-3 frame inverted silhouette flash).
   */
  triggerImpactFrame(style: ImpactFrameStyle = 'black_white', frames = 2): void {
    if (!this.config.enabled || !this.config.impactFrameEnabled) return;

    this.impactState.active = true;
    this.impactState.style = style;
    this.impactState.framesRemaining = Math.max(1, Math.min(6, frames));

    let bg = '#ffffff';
    let blend: any = 'difference';

    switch (style) {
      case 'invert':
        bg = '#ffffff';
        blend = 'difference';
        break;
      case 'black_white':
        bg = '#000000';
        blend = 'color-burn';
        break;
      case 'crimson':
        bg = '#ff0033';
        blend = 'screen';
        break;
      case 'gold':
        bg = '#ffcc00';
        blend = 'screen';
        break;
      case 'neon_cyan':
        bg = '#00ffff';
        blend = 'screen';
        break;
    }

    this.impactState.colorHex = bg;

    if (this.overlayElement) {
      this.overlayElement.style.backgroundColor = bg;
      this.overlayElement.style.mixBlendMode = blend;
      this.overlayElement.style.display = 'block';
    }

    this.engine.sceneManager.events.emit('anime_impact_frame_triggered', {
      style,
      frames,
    });
  }

  /**
   * Triggers a coordinated hit-stop timescale dip for tactile punch weight.
   */
  triggerHitStop(duration = 0.12, timeScale = this.config.hitStopDefaultScale): void {
    if (!this.config.enabled) return;

    const clampedDuration = Math.min(duration, this.config.hitStopMaxDuration);
    this.hitStopTimer = clampedDuration;

    if (!this.inHitStop) {
      this.originalTimeScale = (this.engine.time as any)?.timeScale ?? 1.0;
      this.inHitStop = true;
    }

    if (this.engine.time) {
      (this.engine.time as any).timeScale = Math.max(0.01, timeScale);
    }
  }

  /**
   * Triggers a fast camera FOV zoom punch.
   */
  triggerCameraPunch(fovPunch = -8.0, duration = 0.2): void {
    if (!this.config.enabled || !this.engine.viewport?.camera) return;

    const camera = this.engine.viewport.camera as THREE.PerspectiveCamera;
    if (!camera.isPerspectiveCamera) return;

    if (this.cameraPunchTimer <= 0) {
      this.cameraOriginalFov = camera.fov;
    }
    this.cameraTargetFov = this.cameraOriginalFov + fovPunch * this.config.cameraPunchMultiplier;
    this.cameraPunchTimer = duration;
    camera.fov = this.cameraTargetFov;
    camera.updateProjectionMatrix();
  }

  /**
   * Generates a dynamic inverted-hull ink outline around a 3D character mesh.
   */
  createInvertedHullOutline(
    mesh: THREE.Mesh,
    thickness = this.config.defaultOutlineThickness,
    color = this.config.defaultOutlineColor
  ): THREE.Mesh | null {
    if (!mesh.geometry) return null;

    // Clone geometry and extrude along vertex normals
    const outlineGeo = mesh.geometry.clone();
    const posAttr = outlineGeo.getAttribute('position');
    const normAttr = outlineGeo.getAttribute('normal');

    if (posAttr && normAttr) {
      const pos = posAttr.array as Float32Array;
      const norm = normAttr.array as Float32Array;
      for (let i = 0; i < posAttr.count; i++) {
        const idx = i * 3;
        pos[idx] += norm[idx] * thickness;
        pos[idx + 1] += norm[idx + 1] * thickness;
        pos[idx + 2] += norm[idx + 2] * thickness;
      }
      posAttr.needsUpdate = true;
    }

    const outlineMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide,
      depthWrite: true,
    });

    const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
    outlineMesh.name = `${mesh.name || 'Fighter'}_InvertedHullOutline`;
    mesh.add(outlineMesh);
    this.outlineMeshes.set(mesh, outlineMesh);

    return outlineMesh;
  }

  removeInvertedHullOutline(mesh: THREE.Mesh): void {
    const outline = this.outlineMeshes.get(mesh);
    if (outline) {
      mesh.remove(outline);
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      this.outlineMeshes.delete(mesh);
    }
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    // 1. Process impact frame countdown
    if (this.impactState.active) {
      this.impactState.framesRemaining--;
      if (this.impactState.framesRemaining <= 0) {
        this.impactState.active = false;
        if (this.overlayElement) {
          this.overlayElement.style.display = 'none';
        }
      }
    }

    // 2. Process Hit Stop
    if (this.inHitStop) {
      const realDt = dt > 0 ? dt : (this.engine.time?.wallClockDt ?? 0.016);
      this.hitStopTimer -= realDt;
      if (this.hitStopTimer <= 0) {
        this.inHitStop = false;
        if (this.engine.time) {
          (this.engine.time as any).timeScale = this.originalTimeScale;
        }
      }
    }

    // 3. Process Camera Punch Return
    if (this.cameraPunchTimer > 0 && this.engine.viewport?.camera) {
      this.cameraPunchTimer -= dt;
      const camera = this.engine.viewport.camera as THREE.PerspectiveCamera;
      if (camera.isPerspectiveCamera) {
        if (this.cameraPunchTimer <= 0) {
          camera.fov = this.cameraOriginalFov;
        } else {
          camera.fov = THREE.MathUtils.lerp(camera.fov, this.cameraOriginalFov, 0.25);
        }
        camera.updateProjectionMatrix();
      }
    }
  }

  getImpactState(): Readonly<ImpactFrameState> {
    return { ...this.impactState };
  }

  dispose(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
      this.overlayElement = null;
    }

    for (const [mesh, outline] of this.outlineMeshes) {
      mesh.remove(outline);
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
    }
    this.outlineMeshes.clear();
  }
}
