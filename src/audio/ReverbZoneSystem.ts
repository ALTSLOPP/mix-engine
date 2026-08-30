import * as THREE from 'three';
import { IRGenerator, type IRParams } from './IRGenerator';

export interface ReverbZone {
  id: string;
  name: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  params: IRParams;
  wet: number;
}

export class ReverbZoneSystem {
  private readonly zones = new Map<string, ReverbZone>();
  private activeZoneId: string | null = null;
  private currentWet = 0;
  private targetWet = 0;

  private convolver: ConvolverNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  constructor(
    private readonly audioContext?: BaseAudioContext,
    input?: AudioNode,
    output?: AudioNode,
  ) {
    if (this.audioContext && 'createConvolver' in this.audioContext) {
      try {
        this.convolver = this.audioContext.createConvolver();
        this.wetGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();

        this.wetGain.gain.value = 0;
        this.dryGain.gain.value = 1;

        // Global parallel wet/dry graph:
        // master -> dry -> destination
        //        -> convolver -> wet -> destination
        if (input && output) {
          input.disconnect();
          input.connect(this.dryGain);
          this.dryGain.connect(output);
          input.connect(this.convolver);
          this.convolver.connect(this.wetGain);
          this.wetGain.connect(output);
        }
      } catch {
        // Headless audio context
      }
    }
  }

  addZone(zone: ReverbZone): void {
    this.zones.set(zone.id, zone);
  }

  removeZone(id: string): boolean {
    if (this.activeZoneId === id) {
      this.activeZoneId = null;
      this.targetWet = 0;
    }
    return this.zones.delete(id);
  }

  getZone(id: string): ReverbZone | undefined {
    return this.zones.get(id);
  }

  allZones(): ReverbZone[] {
    return Array.from(this.zones.values());
  }

  update(listenerPos: THREE.Vector3, dt: number): void {
    let containingZone: ReverbZone | null = null;

    for (const zone of this.zones.values()) {
      if (
        listenerPos.x >= zone.min.x &&
        listenerPos.x <= zone.max.x &&
        listenerPos.y >= zone.min.y &&
        listenerPos.y <= zone.max.y &&
        listenerPos.z >= zone.min.z &&
        listenerPos.z <= zone.max.z
      ) {
        containingZone = zone;
        break;
      }
    }

    if (containingZone) {
      if (this.activeZoneId !== containingZone.id) {
        this.activeZoneId = containingZone.id;
        if (this.audioContext && this.convolver) {
          try {
            this.convolver.buffer = IRGenerator.generate(this.audioContext, containingZone.params);
          } catch {
            // Ignore in mock contexts
          }
        }
      }
      this.targetWet = containingZone.wet;
    } else {
      this.activeZoneId = null;
      this.targetWet = 0;
    }

    // Smooth wet/dry transition
    this.currentWet = THREE.MathUtils.lerp(this.currentWet, this.targetWet, Math.min(5.0 * dt, 1));
    if (this.wetGain && this.dryGain) {
      this.wetGain.gain.value = this.currentWet;
      this.dryGain.gain.value = 1.0 - this.currentWet * 0.5;
    }
  }

  getActiveZone(): ReverbZone | null {
    return this.activeZoneId ? this.zones.get(this.activeZoneId) ?? null : null;
  }

  getCurrentWet(): number {
    return this.currentWet;
  }

  dispose(): void {
    try { this.convolver?.disconnect(); } catch { /* already disconnected */ }
    try { this.wetGain?.disconnect(); } catch { /* already disconnected */ }
    try { this.dryGain?.disconnect(); } catch { /* already disconnected */ }
    this.zones.clear();
    this.activeZoneId = null;
  }
}
