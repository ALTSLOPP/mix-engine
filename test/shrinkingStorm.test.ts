import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMockEngine } from './helpers/gameplayEngine';
import { ShrinkingStormSystem } from '../src/features/gameplay/ShrinkingStormSystem';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';

describe('ShrinkingStormSystem', () => {
  it('registers shrinking_storm in GameplayFeatureRegistry', () => {
    const desc = GameplayFeatureRegistry.get('shrinking_storm');
    expect(desc).toBeDefined();
    expect(desc?.category).toBe('encounter');
    expect(desc?.name).toContain('Shrinking Storm');
  });

  it('contracts safe zone radius across multi-phase schedule', () => {
    const engine = createMockEngine() as any;
    const defaults = GameplayFeatureRegistry.getDefaults<any>('shrinking_storm');
    const storm = new ShrinkingStormSystem(engine, {
      ...defaults,
      initialRadius: 100,
      phases: [
        { phase: 1, waitDuration: 2, shrinkDuration: 2, targetRadius: 50, damagePerSec: 5, centerShiftMaxDistance: 0 },
      ],
    });

    expect(storm.getState().currentRadius).toBe(100);
    expect(storm.getState().state).toBe('waiting');

    // Wait phase
    storm.update(1.0);
    expect(storm.getState().state).toBe('waiting');

    // Advance to shrink phase
    storm.update(1.5);
    expect(storm.getState().state).toBe('shrinking');

    // Midway shrink
    storm.update(1.0); // 1.0 / 2.0 = 50%
    expect(storm.getState().currentRadius).toBeCloseTo(75, 1);

    // Complete shrink
    storm.update(1.0);
    expect(storm.getState().currentRadius).toBe(50);
    expect(storm.getState().state).toBe('final');

    storm.dispose();
  });

  it('determines safe zone containment and ticks out-of-zone damage', () => {
    const engine = createMockEngine() as any;
    const defaults = GameplayFeatureRegistry.getDefaults<any>('shrinking_storm');
    const storm = new ShrinkingStormSystem(engine, {
      ...defaults,
      initialRadius: 50,
      phases: [
        { phase: 1, waitDuration: 10, shrinkDuration: 10, targetRadius: 20, damagePerSec: 10, centerShiftMaxDistance: 0 },
      ],
    });

    const insidePos = new THREE.Vector3(10, 0, 10); // dist ~14.14 <= 50
    expect(storm.isInsideSafeZone(insidePos.x, insidePos.z)).toBe(true);

    const outsidePos = new THREE.Vector3(80, 0, 0); // dist = 80 > 50
    expect(storm.isInsideSafeZone(outsidePos.x, outsidePos.z)).toBe(false);
    expect(storm.getDistanceToSafeEdge(outsidePos.x, outsidePos.z)).toBe(30);

    let damageTicked = 0;
    engine.sceneManager.events.on('storm_damage_tick', (payload: any) => {
      damageTicked += payload.damage;
    });

    // Update with outside player position for 1 second (10 dmg/s)
    storm.update(1.0, outsidePos);
    expect(damageTicked).toBeGreaterThanOrEqual(10);

    storm.dispose();
  });
});
