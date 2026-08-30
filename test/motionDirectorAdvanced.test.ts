import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  BlendTree1D,
  BlendTree2D,
  ClipState,
  DirectionalMixer,
  MotionFSM,
  MotionGraph,
  SequenceState,
  TransitionLibrary,
} from '../src/motion';

function createMockClip(name: string, duration = 1.0): THREE.AnimationClip {
  const times = [0, duration];
  const values = [0, 0, 0, 0, 1, 0];
  const rootTrack = new THREE.VectorKeyframeTrack('Hips.position', times, values);
  const clip = new THREE.AnimationClip(name, duration, [rootTrack]);
  (clip as any).__rootTrack = rootTrack;
  return clip;
}

describe('MIX Motion Director Advanced Mixers & Tools', () => {
  let root: THREE.Object3D;
  let mixer: THREE.AnimationMixer;
  let graph: MotionGraph;

  beforeEach(() => {
    root = new THREE.Object3D();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    root.add(hips);
    mixer = new THREE.AnimationMixer(root);
    graph = new MotionGraph(root);
  });

  it('interpolates 1D blend tree weights correctly', () => {
    const idleClip = createMockClip('idle', 1.0);
    const walkClip = createMockClip('walk', 1.0);
    const runClip = createMockClip('run', 1.0);

    const idleState = new ClipState('idle_s', 'idle', mixer, idleClip);
    const walkState = new ClipState('walk_s', 'walk', mixer, walkClip);
    const runState = new ClipState('run_s', 'run', mixer, runClip);

    const tree = new BlendTree1D('locomotion', 'Locomotion1D', 'speed');
    tree.addEntry(0, idleState);
    tree.addEntry(2, walkState);
    tree.addEntry(6, runState);

    tree.play();
    tree.weight = 1.0;

    // At speed 0 -> 100% idle
    tree.setParameterValue(0);
    expect(idleState.weight).toBe(0); // Before update
    tree.update(0.1);
    expect(idleState.fadeGroup.weight).toBeCloseTo(1.0, 2);
    expect(walkState.fadeGroup.weight).toBe(0);

    // At speed 1 (halfway between 0 and 2) -> 50% idle, 50% walk
    tree.setParameterValue(1);
    tree.update(0.1);
    expect(idleState.fadeGroup.weight).toBeCloseTo(0.5, 2);
    expect(walkState.fadeGroup.weight).toBeCloseTo(0.5, 2);
    expect(runState.fadeGroup.weight).toBe(0);

    // At speed 6 -> 100% run
    tree.setParameterValue(6);
    tree.update(0.1);
    expect(idleState.fadeGroup.weight).toBe(0);
    expect(walkState.fadeGroup.weight).toBe(0);
    expect(runState.fadeGroup.weight).toBeCloseTo(1.0, 2);
  });

  it('interpolates 2D blend tree across coordinates', () => {
    const idleState = new ClipState('idle', 'idle', mixer, createMockClip('idle'));
    const fwdState = new ClipState('fwd', 'fwd', mixer, createMockClip('fwd'));
    const rightState = new ClipState('right', 'right', mixer, createMockClip('right'));

    const tree = new BlendTree2D('strafe2d', 'Strafe2D', 'moveX', 'moveY');
    tree.addEntry(0, 0, idleState);
    tree.addEntry(0, 1, fwdState);
    tree.addEntry(1, 0, rightState);

    tree.play();
    tree.weight = 1.0;

    tree.setParameterValues(0, 1);
    tree.update(0.1);
    expect(fwdState.fadeGroup.weight).toBeCloseTo(1.0, 2);
  });

  it('manages transition library with aliases and groups', () => {
    const lib = new TransitionLibrary();
    lib.register({
      id: 'atk_heavy_01',
      clipName: 'heavy_punch',
      fadeDuration: 0.18,
      group: 'combat',
      aliases: ['heavy1', 'roundhouse'],
    });

    expect(lib.has('atk_heavy_01')).toBe(true);
    expect(lib.has('heavy1')).toBe(true);
    expect(lib.has('roundhouse')).toBe(true);

    const trans = lib.get('heavy1');
    expect(trans).toBeDefined();
    expect(trans?.clipName).toBe('heavy_punch');

    const combatGroup = lib.getGroup('combat');
    expect(combatGroup.length).toBe(1);
  });

  it('evaluates sequence state combo triggers', () => {
    const jab = new ClipState('jab', 'jab', mixer, createMockClip('jab', 0.5), { loop: false });
    const cross = new ClipState('cross', 'cross', mixer, createMockClip('cross', 0.5), { loop: false });

    const seq = new SequenceState('combo_1', 'JabCrossCombo');
    seq.addStage({
      name: 'jab',
      state: jab,
      comboWindow: [0.3, 0.8],
    });
    seq.addStage({
      name: 'cross',
      state: cross,
    });

    seq.play();
    seq.weight = 1.0;

    // Inside jab before combo window
    seq.update(0.1);
    expect(seq.triggerCombo()).toBe(false);

    // Enter combo window
    seq.update(0.2); // ~0.3s
    expect(seq.triggerCombo()).toBe(true);

    // Finish jab -> advances to cross
    seq.update(0.3);
    expect(seq.currentStage?.name).toBe('cross');
  });

  it('evaluates MotionFSM transitions and guards', () => {
    graph.registerClip('idle', createMockClip('idle'));
    graph.registerClip('walk', createMockClip('walk'));

    const fsm = new MotionFSM(graph, {
      initialState: 'idle',
      states: {
        idle: {
          name: 'idle',
          clipName: 'idle',
          transitions: [
            {
              targetState: 'walk',
              condition: (p) => (p.speed as number) > 1.0,
            },
          ],
        },
        walk: {
          name: 'walk',
          clipName: 'walk',
          transitions: [
            {
              targetState: 'idle',
              condition: (p) => (p.speed as number) <= 1.0,
            },
          ],
        },
      },
    });

    expect(fsm.currentState).toBe('idle');

    // Update with speed = 0 (no transition)
    graph.parameters.set('speed', 0);
    fsm.update(0.1);
    expect(fsm.currentState).toBe('idle');

    // Update with speed = 3.0 -> triggers transition to walk
    graph.parameters.set('speed', 3.0);
    fsm.update(0.1);
    expect(fsm.currentState).toBe('walk');
  });
});
