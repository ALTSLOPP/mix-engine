import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { ShrinkingStormConfig, ShrinkingStormState } from './types';

export const DEFAULT_STORM_CONFIG: ShrinkingStormConfig = {
  enabled: true,
  initialRadius: 200.0,
  minRadius: 15.0,
  tickInterval: 1.0,
  barrierColor: '#7c3aed', // Anime violet storm
  barrierHeight: 80.0,
  enableVisualBarrier: true,
  phases: [
    { phase: 1, waitDuration: 30, shrinkDuration: 25, targetRadius: 120, damagePerSec: 2, centerShiftMaxDistance: 20 },
    { phase: 2, waitDuration: 25, shrinkDuration: 20, targetRadius: 70, damagePerSec: 5, centerShiftMaxDistance: 15 },
    { phase: 3, waitDuration: 20, shrinkDuration: 15, targetRadius: 35, damagePerSec: 10, centerShiftMaxDistance: 10 },
    { phase: 4, waitDuration: 15, shrinkDuration: 15, targetRadius: 15, damagePerSec: 20, centerShiftMaxDistance: 5 },
  ],
};

export class ShrinkingStormSystem {
  private readonly unsubscribe: Array<() => void> = [];
  private config: ShrinkingStormConfig;
  private state: ShrinkingStormState;

  // 3D Visual barrier mesh
  private barrierMesh: THREE.Mesh | null = null;
  private groundRingMesh: THREE.LineLoop | null = null;

  dispose(): void {
    this.removeVisualBarrier();
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  constructor(private readonly engine: Engine, initialConfig: ShrinkingStormConfig) {
    this.config = { ...initialConfig };
    this.state = {
      currentPhaseIndex: 0,
      state: 'waiting',
      currentCenter: { x: 0, z: 0 },
      targetCenter: { x: 0, z: 0 },
      currentRadius: this.config.initialRadius,
      targetRadius: this.config.initialRadius,
      phaseTimer: this.config.phases[0]?.waitDuration ?? 30,
      totalElapsed: 0,
      isPlayerInSafeZone: true,
      damageAccumulator: 0,
    };

    if (this.config.enableVisualBarrier) {
      this.createVisualBarrier();
    }
  }

  setConfig(patch: Partial<ShrinkingStormConfig>): void {
    this.config = { ...this.config, ...patch };
    if (!this.config.enabled) {
      this.removeVisualBarrier();
    } else if (this.config.enableVisualBarrier && !this.barrierMesh) {
      this.createVisualBarrier();
    }
  }

  getConfig(): Readonly<ShrinkingStormConfig> {
    return this.config;
  }

  getState(): Readonly<ShrinkingStormState> {
    return this.state;
  }

  isInsideSafeZone(worldX: number, worldZ: number): boolean {
    const dx = worldX - this.state.currentCenter.x;
    const dz = worldZ - this.state.currentCenter.z;
    return Math.hypot(dx, dz) <= this.state.currentRadius;
  }

  getDistanceToSafeEdge(worldX: number, worldZ: number): number {
    const dx = worldX - this.state.currentCenter.x;
    const dz = worldZ - this.state.currentCenter.z;
    const distToCenter = Math.hypot(dx, dz);
    return distToCenter - this.state.currentRadius;
  }

  update(dt: number, playerPos?: THREE.Vector3): void {
    if (!this.config.enabled) return;

    this.state.totalElapsed += dt;
    const currentPhase = this.config.phases[this.state.currentPhaseIndex];
    if (!currentPhase) {
      this.state.state = 'final';
      return;
    }

    // Advance Phase State Machine
    if (this.state.state === 'waiting') {
      this.state.phaseTimer -= dt;
      if (this.state.phaseTimer <= 0) {
        // Start Shrinking
        this.state.state = 'shrinking';
        this.state.phaseTimer = currentPhase.shrinkDuration;
        this.state.targetRadius = currentPhase.targetRadius;

        // Shift center slightly within bounded range
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * currentPhase.centerShiftMaxDistance;
        this.state.targetCenter = {
          x: this.state.currentCenter.x + Math.cos(angle) * dist,
          z: this.state.currentCenter.z + Math.sin(angle) * dist,
        };

        this.engine.sceneManager.events.emit('storm_shrink_started', {
          phase: currentPhase.phase,
          targetRadius: currentPhase.targetRadius,
        });
      }
    } else if (this.state.state === 'shrinking') {
      this.state.phaseTimer -= dt;
      const progress = 1.0 - Math.max(0, this.state.phaseTimer) / currentPhase.shrinkDuration;

      // Interpolate radius and center
      const prevRadius = this.state.currentPhaseIndex === 0
        ? this.config.initialRadius
        : this.config.phases[this.state.currentPhaseIndex - 1].targetRadius;

      this.state.currentRadius = THREE.MathUtils.lerp(prevRadius, currentPhase.targetRadius, progress);
      this.state.currentCenter.x = THREE.MathUtils.lerp(this.state.currentCenter.x, this.state.targetCenter.x, progress);
      this.state.currentCenter.z = THREE.MathUtils.lerp(this.state.currentCenter.z, this.state.targetCenter.z, progress);

      if (this.state.phaseTimer <= 0) {
        // Phase Shrink Complete -> Advance to next phase
        this.state.currentPhaseIndex++;
        const nextPhase = this.config.phases[this.state.currentPhaseIndex];
        if (nextPhase) {
          this.state.state = 'waiting';
          this.state.phaseTimer = nextPhase.waitDuration;
        } else {
          this.state.state = 'final';
        }
        this.engine.sceneManager.events.emit('storm_phase_completed', { phase: currentPhase.phase });
      }
    }

    // Check Player Safe Zone Status & Apply Damage
    if (playerPos) {
      const inZone = this.isInsideSafeZone(playerPos.x, playerPos.z);
      this.state.isPlayerInSafeZone = inZone;

      if (!inZone) {
        this.state.damageAccumulator += currentPhase.damagePerSec * dt;
        if (this.state.damageAccumulator >= 1.0) {
          const damageToDeal = Math.floor(this.state.damageAccumulator);
          this.state.damageAccumulator -= damageToDeal;
          this.engine.sceneManager.events.emit('storm_damage_tick', { damage: damageToDeal });
        }
      } else {
        this.state.damageAccumulator = 0;
      }
    }

    // Update 3D visual barrier
    this.updateVisualBarrier();
  }

  private createVisualBarrier(): void {
    if (typeof document === 'undefined' || !this.engine.viewport?.scene) return;

    const geometry = new THREE.CylinderGeometry(1, 1, this.config.barrierHeight, 48, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color: this.config.barrierColor,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.barrierMesh = new THREE.Mesh(geometry, material);
    this.barrierMesh.position.set(this.state.currentCenter.x, this.config.barrierHeight / 2, this.state.currentCenter.z);
    this.barrierMesh.scale.set(this.state.currentRadius, 1, this.state.currentRadius);
    this.engine.viewport.scene.add(this.barrierMesh);
  }

  private updateVisualBarrier(): void {
    if (!this.barrierMesh) return;
    this.barrierMesh.position.set(this.state.currentCenter.x, this.config.barrierHeight / 2, this.state.currentCenter.z);
    this.barrierMesh.scale.set(this.state.currentRadius, 1, this.state.currentRadius);
  }

  private removeVisualBarrier(): void {
    if (this.barrierMesh) {
      this.engine.viewport?.scene?.remove(this.barrierMesh);
      this.barrierMesh.geometry.dispose();
      (this.barrierMesh.material as THREE.Material).dispose();
      this.barrierMesh = null;
    }
  }
}
