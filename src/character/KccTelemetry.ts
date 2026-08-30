import * as THREE from 'three';

export interface KccTelemetrySnapshot {
  groundContactRatio: number;
  slopeSlipEvents: number;
  wallHitCount: number;
  jitter: number;
  airTime: number;
  landingImpactG: number;
  currentSpeed: number;
}

export class KccTelemetry {
  private readonly posHistory: THREE.Vector3[] = [];
  private readonly historyCapacity = 30;

  groundSubsteps = 0;
  totalSubsteps = 0;
  slopeSlipEvents = 0;
  wallHitCount = 0;
  lastImpactG = 0;

  recordStep(pos: THREE.Vector3, grounded: boolean, sliding: boolean, wallHit: boolean, prevVy: number, currVy: number, fixedDt: number): void {
    this.totalSubsteps++;
    if (grounded) this.groundSubsteps++;
    if (sliding) this.slopeSlipEvents++;
    if (wallHit) this.wallHitCount++;

    if (prevVy < -2 && currVy >= 0) {
      this.lastImpactG = Math.abs(prevVy) / (9.81 * Math.max(fixedDt, 0.001));
    }

    if (this.posHistory.length >= this.historyCapacity) {
      this.posHistory.shift();
    }
    this.posHistory.push(pos.clone());
  }

  computeJitter(): number {
    if (this.posHistory.length < 3) return 0;
    const diffs: number[] = [];
    for (let i = 1; i < this.posHistory.length; i++) {
      diffs.push(this.posHistory[i].distanceTo(this.posHistory[i - 1]));
    }
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length;
    return Math.sqrt(variance);
  }

  getSnapshot(airTime: number, currentSpeed: number): KccTelemetrySnapshot {
    return {
      groundContactRatio: this.totalSubsteps > 0 ? this.groundSubsteps / this.totalSubsteps : 1,
      slopeSlipEvents: this.slopeSlipEvents,
      wallHitCount: this.wallHitCount,
      jitter: this.computeJitter(),
      airTime,
      landingImpactG: this.lastImpactG,
      currentSpeed,
    };
  }

  reset(): void {
    this.groundSubsteps = 0;
    this.totalSubsteps = 0;
    this.slopeSlipEvents = 0;
    this.wallHitCount = 0;
    this.lastImpactG = 0;
    this.posHistory.length = 0;
  }
}
