import { describe, it, expect } from 'vitest';
import { AIDirector } from '../src/ai/AIDirector';
import { EventBus } from '../src/ecs/EventBus';

describe('Autonomous AI Director & Dynamic Difficulty (S13)', () => {
  it('modulates player stress and progresses through pacing phases', () => {
    const eventBus = new EventBus();
    const supplyDrops: any[] = [];
    eventBus.on('director_supply_drop', (p) => supplyDrops.push(p));

    const director = new AIDirector(eventBus, {
      relaxDuration: 2.0,
      buildUpDuration: 3.0,
      peakStressThreshold: 0.7,
    });

    expect(director.phase).toBe('relax');

    // 1. Advance through relax phase (2.0s) -> triggers build_up
    director.update(2.1);
    expect(director.phase).toBe('build_up');

    // 2. Player takes heavy damage -> stress spikes past threshold (0.7) -> enters peak
    eventBus.emit('player_damaged', { amount: 40 });
    director.update(0.1);
    expect(director.playerStress).toBeGreaterThan(0.7);
    expect(director.phase).toBe('peak');

    // 3. Player survives peak for 15s -> stress drops -> enters relax and drops supplies
    director.playerStress = 0.2; // recovered
    director.update(16.0);
    expect(director.phase).toBe('relax');
    expect(supplyDrops.length).toBe(1);
    expect(supplyDrops[0].reason).toBe('peak_survived');
  });
});
