import * as THREE from 'three';

export interface EntityNetSnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  entities: EntityNetSnapshot[];
}

export class NetworkSnapshotSync {
  private readonly snapshotBuffer: WorldSnapshot[] = [];
  private readonly maxBufferSize: number;

  constructor(maxBufferSize = 60) {
    this.maxBufferSize = maxBufferSize;
  }

  pushSnapshot(snapshot: WorldSnapshot): void {
    if (this.snapshotBuffer.length >= this.maxBufferSize) {
      this.snapshotBuffer.shift();
    }
    this.snapshotBuffer.push(snapshot);
  }

  getSnapshot(tick: number): WorldSnapshot | undefined {
    return this.snapshotBuffer.find((s) => s.tick === tick);
  }

  sampleInterpolatedState(
    renderTime: number,
    interpDelay = 0.05, // 50ms interpolation delay
  ): Map<number, { pos: THREE.Vector3; quat: THREE.Quaternion }> {
    const targetTime = renderTime - interpDelay;
    const result = new Map<number, { pos: THREE.Vector3; quat: THREE.Quaternion }>();

    if (this.snapshotBuffer.length === 0) return result;

    if (this.snapshotBuffer.length === 1 || targetTime <= this.snapshotBuffer[0].timestamp) {
      for (const e of this.snapshotBuffer[0].entities) {
        result.set(e.id, {
          pos: new THREE.Vector3(e.x, e.y, e.z),
          quat: new THREE.Quaternion(e.qx, e.qy, e.qz, e.qw),
        });
      }
      return result;
    }

    const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    if (targetTime >= latest.timestamp) {
      for (const e of latest.entities) {
        result.set(e.id, {
          pos: new THREE.Vector3(e.x, e.y, e.z),
          quat: new THREE.Quaternion(e.qx, e.qy, e.qz, e.qw),
        });
      }
      return result;
    }

    // Find bounding snapshots
    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      const sA = this.snapshotBuffer[i];
      const sB = this.snapshotBuffer[i + 1];

      if (targetTime >= sA.timestamp && targetTime <= sB.timestamp) {
        const span = sB.timestamp - sA.timestamp;
        const alpha = span > 0 ? (targetTime - sA.timestamp) / span : 0;

        const mapA = new Map(sA.entities.map((e) => [e.id, e]));

        for (const eB of sB.entities) {
          const eA = mapA.get(eB.id);
          if (eA) {
            const posA = new THREE.Vector3(eA.x, eA.y, eA.z);
            const posB = new THREE.Vector3(eB.x, eB.y, eB.z);
            const quatA = new THREE.Quaternion(eA.qx, eA.qy, eA.qz, eA.qw);
            const quatB = new THREE.Quaternion(eB.qx, eB.qy, eB.qz, eB.qw);

            result.set(eB.id, {
              pos: posA.lerp(posB, alpha),
              quat: quatA.slerp(quatB, alpha),
            });
          } else {
            result.set(eB.id, {
              pos: new THREE.Vector3(eB.x, eB.y, eB.z),
              quat: new THREE.Quaternion(eB.qx, eB.qy, eB.qz, eB.qw),
            });
          }
        }
        break;
      }
    }

    return result;
  }

  checkReconciliation(
    predictedPos: THREE.Vector3,
    serverSnapshot: EntityNetSnapshot,
    threshold = 0.05, // 5cm tolerance
  ): { needsCorrection: boolean; errorDistance: number } {
    const sPos = new THREE.Vector3(serverSnapshot.x, serverSnapshot.y, serverSnapshot.z);
    const dist = predictedPos.distanceTo(sPos);
    return {
      needsCorrection: dist > threshold,
      errorDistance: dist,
    };
  }
}
