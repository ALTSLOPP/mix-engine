import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandHistory } from '../src/authoring/CommandHistory';

describe('CommandHistory and Viewport Undo/Redo', () => {
  it('records actions and handles single-step undo and redo', async () => {
    const history = new CommandHistory();
    let state = 10;

    history.record({
      id: 'step1',
      name: 'Set State to 20',
      timestamp: Date.now(),
      undo: () => { state = 10; },
      redo: () => { state = 20; },
    });

    state = 20;
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    const undone = await history.undo();
    expect(undone).toBe(true);
    expect(state).toBe(10);
    expect(history.canRedo()).toBe(true);

    const redone = await history.redo();
    expect(redone).toBe(true);
    expect(state).toBe(20);
  });

  it('correctly coalesces rapid successive changes with the same coalesceKey', async () => {
    const history = new CommandHistory();
    let value = 0;

    const t0 = 100000;
    history.record({
      id: 'drag1',
      name: 'Drag Slider',
      timestamp: t0,
      coalesceKey: 'slider_drag',
      undo: () => { value = 0; },
      redo: () => { value = 5; },
    });

    history.record({
      id: 'drag2',
      name: 'Drag Slider',
      timestamp: t0 + 100, // within 500ms
      coalesceKey: 'slider_drag',
      undo: () => { value = 5; },
      redo: () => { value = 10; },
    });

    const entries = history.getEntries();
    expect(entries.length).toBe(1);

    // Undoing should restore all the way to 0 (initial undo preserved)
    await history.undo();
    expect(value).toBe(0);

    // Redoing should advance to 10 (latest redo preserved)
    await history.redo();
    expect(value).toBe(10);
  });

  it('restores entity transform state through undo and redo closures', async () => {
    const history = new CommandHistory();
    const mockMesh = new THREE.Object3D();
    mockMesh.position.set(0, 0, 0);

    const oldPos = new THREE.Vector3(0, 0, 0);
    const newPos = new THREE.Vector3(5, 2, -3);

    // Simulate gizmo drag commit
    history.record({
      id: 'gizmo_move_1',
      name: 'Move Entity #1',
      timestamp: Date.now(),
      undo: () => {
        mockMesh.position.copy(oldPos);
      },
      redo: () => {
        mockMesh.position.copy(newPos);
      },
    });

    mockMesh.position.copy(newPos);
    expect(mockMesh.position.x).toBe(5);

    await history.undo();
    expect(mockMesh.position.x).toBe(0);
    expect(mockMesh.position.y).toBe(0);
    expect(mockMesh.position.z).toBe(0);

    await history.redo();
    expect(mockMesh.position.x).toBe(5);
    expect(mockMesh.position.y).toBe(2);
    expect(mockMesh.position.z).toBe(-3);
  });
});
