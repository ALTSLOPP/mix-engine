import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/ecs/EventBus';
import { StateMachineEventBridge } from '../src/animation/StateMachineEventBridge';

describe('StateMachineEventBridge & Animation Event Markers (S7)', () => {
  it('dispatches events when animation state reaches normalized time marker', () => {
    const eventBus = new EventBus();
    const bridge = new StateMachineEventBridge(eventBus);

    const receivedEvents: any[] = [];
    eventBus.on('footstep_left', (payload) => receivedEvents.push(payload));

    bridge.addMarker({
      stateName: 'run',
      normalizedTime: 0.3,
      eventName: 'footstep_left',
      payload: { surface: 'stone' },
    });

    const entityId = 42;

    // Timeline at 0.1: no trigger
    bridge.processState(entityId, 'run', 0.1);
    expect(receivedEvents.length).toBe(0);

    // Timeline advances past 0.3 to 0.4: should trigger event
    bridge.processState(entityId, 'run', 0.4);
    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].entityId).toBe(42);
    expect(receivedEvents[0].stateName).toBe('run');
    expect(receivedEvents[0].surface).toBe('stone');

    // Timeline advances to 0.5: no duplicate trigger
    bridge.processState(entityId, 'run', 0.5);
    expect(receivedEvents.length).toBe(1);

    // Timeline loops back from 0.9 to 0.35 (crossing 0.3): triggers again
    bridge.processState(entityId, 'run', 0.9);
    bridge.processState(entityId, 'run', 0.35);
    expect(receivedEvents.length).toBe(2);
  });
});
