import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TimelineSequencer } from '../src/cinematic/TimelineSequencer';
import { EventBus } from '../src/ecs/EventBus';

describe('Multi-Track Cinematic Timeline Sequencer (S11)', () => {
  it('interpolates entity transforms and emits events on timeline playback', () => {
    const objectMap = new Map<number, THREE.Object3D>();
    const testObj = new THREE.Object3D();
    objectMap.set(10, testObj);

    const eventBus = new EventBus();
    const emittedEvents: string[] = [];
    eventBus.on('cutscene_blast', () => emittedEvents.push('cutscene_blast'));

    const sequencer = new TimelineSequencer((id) => objectMap.get(id) ?? null, eventBus);

    sequencer.addTimeline({
      id: 'intro_cutscene',
      duration: 2.0,
      tracks: [
        {
          id: 'camera_move',
          type: 'transform',
          targetEntityId: 10,
          transformKeys: [
            { time: 0.0, position: [0, 0, 0] },
            { time: 1.0, position: [0, 10, 0] },
            { time: 2.0, position: [0, 20, 0] },
          ],
        },
        {
          id: 'vfx_event',
          type: 'event',
          eventKeys: [
            { time: 0.5, eventName: 'cutscene_blast' },
          ],
        },
      ],
    });

    // 1. Play timeline
    sequencer.play('intro_cutscene');
    expect(sequencer.getActivePlayback('intro_cutscene')?.playing).toBe(true);

    // 2. Advance 0.5s -> should hit midway position [0, 5, 0] and trigger event
    sequencer.update(0.5);
    expect(testObj.position.y).toBeCloseTo(5.0, 2);
    expect(emittedEvents).toEqual(['cutscene_blast']);

    // 3. Advance to 1.5s -> position [0, 15, 0]
    sequencer.update(1.0);
    expect(testObj.position.y).toBeCloseTo(15.0, 2);

    // 4. Advance to end (2.0s) -> position [0, 20, 0], stops playing
    sequencer.update(0.5);
    expect(testObj.position.y).toBeCloseTo(20.0, 2);
    expect(sequencer.getActivePlayback('intro_cutscene')?.playing).toBe(false);
  });

  it('supports timeline scrubbing', () => {
    const objectMap = new Map<number, THREE.Object3D>();
    const testObj = new THREE.Object3D();
    objectMap.set(1, testObj);

    const sequencer = new TimelineSequencer((id) => objectMap.get(id) ?? null);

    sequencer.addTimeline({
      id: 'scrub_test',
      duration: 4.0,
      tracks: [
        {
          id: 't1',
          type: 'transform',
          targetEntityId: 1,
          transformKeys: [
            { time: 0.0, position: [0, 0, 0] },
            { time: 4.0, position: [40, 0, 0] },
          ],
        },
      ],
    });

    sequencer.scrub('scrub_test', 2.0);
    expect(testObj.position.x).toBeCloseTo(20.0, 2);

    sequencer.scrub('scrub_test', 1.0);
    expect(testObj.position.x).toBeCloseTo(10.0, 2);
  });

  it('resolves world-space positions at evaluation time and publishes physics updates', () => {
    const object = new THREE.Object3D();
    let originOffset = 100;
    const applied: THREE.Vector3[] = [];
    const sequencer = new TimelineSequencer(
      () => object,
      undefined,
      (world, out) => out.copy(world).addScalar(-originOffset),
      (_id, target) => { applied.push(target.position.clone()); },
    );
    sequencer.addTimeline({
      id: 'world-space',
      duration: 1,
      tracks: [{
        id: 'move',
        type: 'transform',
        targetEntityId: 1,
        transformKeys: [
          { time: 0, position: [100, 100, 100] },
          { time: 1, position: [110, 100, 100] },
        ],
      }],
    });

    sequencer.scrub('world-space', 0.5);
    expect(object.position.toArray()).toEqual([5, 0, 0]);
    originOffset = 105;
    sequencer.scrub('world-space', 0.5);
    expect(object.position.toArray()).toEqual([0, -5, -5]);
    expect(applied).toHaveLength(2);
  });
});
