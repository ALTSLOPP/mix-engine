import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  DirectionalMixer,
  MotionGraph,
  MotionMask,
  STANDARD_MASKS,
  SequenceState,
  ClipState,
} from '../src/motion';
import {
  PropertyTree,
  ValidatorRegistry,
  SerializationEngine,
  defineInspector,
} from '../src/inspector';

function createMockClip(name: string, duration = 1.0): THREE.AnimationClip {
  const times = [0, duration * 0.5, duration];
  const values = [0, 0, 0, 0, 0, 1.0, 0, 0, 2.0];
  const rootTrack = new THREE.VectorKeyframeTrack('Hips.position', times, values);
  const clip = new THREE.AnimationClip(name, duration, [rootTrack]);
  (clip as any).__rootTrack = rootTrack;
  return clip;
}

describe('MIX Motion Director & Inspector Studio E2E Workflows', () => {
  let root: THREE.Object3D;
  let graph: MotionGraph;

  beforeEach(() => {
    root = new THREE.Object3D();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    root.add(hips);
    graph = new MotionGraph(root);
  });

  it('Scenario 1: AAA Locomotion with directional blending and foot-step events', () => {
    const fwdClip = createMockClip('walk_fwd', 1.0);
    const backClip = createMockClip('walk_back', 1.0);
    const leftClip = createMockClip('walk_left', 1.0);
    const rightClip = createMockClip('walk_right', 1.0);

    const fwdState = new ClipState('fwd', 'walk_fwd', graph.mixer, fwdClip, {
      events: [
        { name: 'footstep_l', time: 0.25 },
        { name: 'footstep_r', time: 0.75 },
      ],
    });
    const backState = new ClipState('back', 'walk_back', graph.mixer, backClip);
    const leftState = new ClipState('left', 'walk_left', graph.mixer, leftClip);
    const rightState = new ClipState('right', 'walk_right', graph.mixer, rightClip);

    let footstepCount = 0;
    fwdState.eventTrack.on('footstep_l', () => footstepCount++);
    fwdState.eventTrack.on('footstep_r', () => footstepCount++);

    const mixer = new DirectionalMixer('locomotion', 'DirectionalLocomotion', {
      forward: fwdState,
      backward: backState,
      left: leftState,
      right: rightState,
    });

    const baseLayer = graph.getLayer(0)!;
    baseLayer.addState(mixer);
    baseLayer.play('locomotion');

    // Strafe diagonally forward-right
    mixer.setDirection(0.5, 0.5);
    graph.update(0.3);

    expect(footstepCount).toBe(1); // Left footstep fired at 0.25s
    expect(mixer.extractRootDelta(new THREE.Vector3()).length()).toBeGreaterThan(0);
  });

  it('Scenario 2: Layered combat with upper-body mask, hit windows, and root motion', async () => {
    // Base locomotion
    const idleClip = createMockClip('idle', 2.0);
    graph.registerClip('idle', idleClip);
    graph.play('idle', { layer: 'base' });

    // Upper body attack layer with weighted mask
    const upperMask = new MotionMask(STANDARD_MASKS.upperBody);
    const combatLayer = graph.createLayer('combat', 1, 'override', upperMask);

    const attackClip = createMockClip('muay_thai_punch', 0.8);
    const attackState = new ClipState('punch', 'muay_thai_punch', graph.mixer, attackClip, {
      loop: false,
      events: [{ name: 'hit', time: 0.35 }],
    });
    combatLayer.addState(attackState);

    let hitFired = false;
    attackState.eventTrack.on('hit', () => {
      hitFired = true;
    });

    combatLayer.play('punch', 0.1);

    // Initial update
    graph.update(0.2);
    expect(hitFired).toBe(false);

    // Update through hit frame
    graph.update(0.2);
    expect(hitFired).toBe(true);

    // Verify root motion extraction during attack
    const rootDelta = graph.getRootMotionDelta();
    expect(rootDelta).toBeDefined();
  });

  it('Scenario 3: Inspector-authored enemy configuration with validation and serialization', () => {
    const EnemySchema = defineInspector('BossEnemyConfig', {
      title: 'Boss Enemy Configuration',
      groups: {
        stats: { type: 'tab', label: 'Stats' },
        combat: { type: 'tab', label: 'Combat' },
      },
      properties: {
        maxHealth: { type: 'number', range: [100, 5000], group: 'stats' },
        phaseCount: { type: 'number', range: [1, 5], group: 'stats' },
        enrageThreshold: { type: 'number', validate: 'enrageThreshold > 0 && enrageThreshold < 1' },
        attackPack: { type: 'asset', assetType: 'animation' },
      },
      actions: {
        triggerEnrage: {
          label: 'Test Enrage',
          command: 'combat_enrage_preview',
        },
      },
    });

    expect(EnemySchema).toBeDefined();

    const bossInstance = {
      maxHealth: 2500,
      phaseCount: 3,
      enrageThreshold: 0.3,
      attackPack: 'brawler_boss_pack',
    };

    // 1. Reflect through PropertyTree
    const tree = new PropertyTree(bossInstance, EnemySchema);
    expect(tree.readValue('maxHealth')).toBe(2500);

    // 2. Validate configuration
    const validReport = ValidatorRegistry.validateTarget(bossInstance, tree);
    expect(validReport.valid).toBe(true);

    // 3. Test invalid configuration detection
    bossInstance.maxHealth = 10000; // Out of range [100, 5000]
    const invalidReport = ValidatorRegistry.validateTarget(bossInstance, tree);
    expect(invalidReport.valid).toBe(false);
    expect(invalidReport.errors.length).toBe(1);

    // 4. Auto-fix clamps value
    ValidatorRegistry.validateTarget(bossInstance, tree, { autoFix: true });
    expect(bossInstance.maxHealth).toBe(5000);

    // 5. Serialize
    const serialized = SerializationEngine.serialize(bossInstance);
    const restored = SerializationEngine.deserialize<typeof bossInstance>(serialized);
    expect(restored.maxHealth).toBe(5000);
    expect(restored.enrageThreshold).toBe(0.3);
  });
});
