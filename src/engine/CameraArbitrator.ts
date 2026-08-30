import * as THREE from 'three';

export type CameraMode = 'first_person' | 'third_person' | 'cinematic' | 'dialogue' | 'spectator' | 'photo';

export interface CameraOverrideRequest {
  id: string;
  mode: CameraMode;
  priority: number;
  fov?: number;
  position?: THREE.Vector3;
  target?: THREE.Vector3;
  onUpdate?: (dt: number, camera: THREE.Camera) => boolean;
}

/**
 * CameraArbitrator arbitrates camera ownership across first-person, third-person,
 * cinematic directors, dialogue systems, cutscenes, and photo mode.
 */
export class CameraArbitrator {
  private baseMode: CameraMode = 'third_person';
  private readonly overrides = new Map<string, CameraOverrideRequest>();
  private activeOverride: CameraOverrideRequest | null = null;

  constructor(defaultMode: CameraMode = 'third_person') {
    this.baseMode = defaultMode;
  }

  setBaseMode(mode: CameraMode): void {
    this.baseMode = mode;
  }

  getBaseMode(): CameraMode {
    return this.baseMode;
  }

  getActiveMode(): CameraMode {
    if (this.activeOverride) {
      return this.activeOverride.mode;
    }
    return this.baseMode;
  }

  isFirstPerson(): boolean {
    return this.getActiveMode() === 'first_person';
  }

  isThirdPerson(): boolean {
    return this.getActiveMode() === 'third_person';
  }

  isCinematic(): boolean {
    return this.getActiveMode() === 'cinematic';
  }

  requestOverride(request: CameraOverrideRequest): void {
    this.overrides.set(request.id, request);
    this.recalculateActive();
  }

  releaseOverride(id: string): void {
    if (this.overrides.delete(id)) {
      this.recalculateActive();
    }
  }

  clearAllOverrides(): void {
    this.overrides.clear();
    this.activeOverride = null;
  }

  private recalculateActive(): void {
    if (this.overrides.size === 0) {
      this.activeOverride = null;
      return;
    }

    let highest: CameraOverrideRequest | null = null;
    for (const req of this.overrides.values()) {
      if (!highest || req.priority > highest.priority) {
        highest = req;
      }
    }
    this.activeOverride = highest;
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.activeOverride && this.activeOverride.onUpdate) {
      const keepActive = this.activeOverride.onUpdate(dt, camera);
      if (!keepActive) {
        this.releaseOverride(this.activeOverride.id);
      }
    }
  }
}
