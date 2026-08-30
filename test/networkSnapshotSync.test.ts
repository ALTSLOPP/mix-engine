import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NetworkSnapshotSync } from '../src/network/NetworkSnapshotSync';

describe('Multiplayer Snapshot Replication & Rollback Sync (S11)', () => {
  it('interpolates remote entity positions across snapshots with fixed delay', () => {
    const netSync = new NetworkSnapshotSync(10);

    // Snapshot 1 at t=1.0s, Entity 1 at (0, 0, 0)
    netSync.pushSnapshot({
      tick: 60,
      timestamp: 1.0,
      entities: [
        { id: 1, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      ],
    });

    // Snapshot 2 at t=1.1s, Entity 1 at (10, 0, 0)
    netSync.pushSnapshot({
      tick: 66,
      timestamp: 1.1,
      entities: [
        { id: 1, x: 10, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      ],
    });

    // Render at t=1.1s with 50ms interpolation delay (targetTime = 1.05s, exact midpoint)
    const state = netSync.sampleInterpolatedState(1.1, 0.05);

    expect(state.has(1)).toBe(true);
    const entityState = state.get(1)!;
    expect(entityState.pos.x).toBeCloseTo(5.0, 2);
  });

  it('detects prediction error exceeding tolerance during reconciliation', () => {
    const netSync = new NetworkSnapshotSync();

    const predictedPos = new THREE.Vector3(10.0, 0, 0);

    // Minor drift (< 5cm) -> No correction needed
    const minorServerSnap = { id: 1, x: 10.02, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    const check1 = netSync.checkReconciliation(predictedPos, minorServerSnap, 0.05);
    expect(check1.needsCorrection).toBe(false);

    // Major desync (> 5cm) -> Requires reconciliation rollback
    const majorServerSnap = { id: 1, x: 10.3, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    const check2 = netSync.checkReconciliation(predictedPos, majorServerSnap, 0.05);
    expect(check2.needsCorrection).toBe(true);
    expect(check2.errorDistance).toBeCloseTo(0.3, 2);
  });
});
