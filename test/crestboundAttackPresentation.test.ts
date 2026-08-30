import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  getAdaptiveHitZonePosition,
  getCreatureHitZonePositions,
} from '../src/features/combat/CreatureHitZones';
import {
  resolveAttackAimSolution,
  AttackAimSolution,
} from '../src/features/combat/AttackDefinition';
import {
  BattleCameraShotPlanner,
} from '../src/features/combat/BattleCameraShotPlanner';
import { BattleCameraDirector } from '../src/features/combat/BattleCameraDirector';
import { CombatImpactFeedback } from '../src/features/combat/CombatImpactFeedback';
import { CameraArbitrator } from '../src/engine/CameraArbitrator';

describe('Crestbound Attack Presentation & Cinematic Camera', () => {
  it('calculates adaptive hit zone positions proportionally based on creature height', () => {
    const base = new THREE.Vector3(10, 0, 10);
    const height = 2.0;

    const head = getAdaptiveHitZonePosition(base, height, 'head');
    expect(head.y).toBeCloseTo(1.76, 2); // 2.0 * 0.88

    const chest = getAdaptiveHitZonePosition(base, height, 'chest');
    expect(chest.y).toBeCloseTo(1.3, 2); // 2.0 * 0.65

    const core = getAdaptiveHitZonePosition(base, height, 'core');
    expect(core.y).toBeCloseTo(1.0, 2); // 2.0 * 0.5

    const allZones = getCreatureHitZonePositions(base, height);
    expect(allZones.head.y).toBeGreaterThan(allZones.chest.y);
    expect(allZones.chest.y).toBeGreaterThan(allZones.core.y);
    expect(allZones.core.y).toBeGreaterThan(allZones.left_leg.y);
  });

  it('evaluates Quadratic Bézier trajectory and tangents for attack aim solutions', () => {
    const attackerPos = new THREE.Vector3(0, 0, 0);
    const targetPos = new THREE.Vector3(10, 0, 0);

    const solution = resolveAttackAimSolution(
      attackerPos,
      1.8,
      targetPos,
      2.0,
      'chest',
      'arcing'
    );

    expect(solution.source.y).toBeCloseTo(1.08, 2);
    expect(solution.target.x).toBe(10);
    expect(solution.control.y).toBeGreaterThan(solution.source.y);

    // Evaluate at t=0 (start)
    const p0 = solution.evaluate(0);
    expect(p0.distanceTo(solution.source)).toBeCloseTo(0, 4);

    // Evaluate at t=1 (target hit)
    const p1 = solution.evaluate(1);
    expect(p1.distanceTo(solution.target)).toBeCloseTo(0, 4);

    // Evaluate at t=0.5 (crest of arc)
    const pMid = solution.evaluate(0.5);
    expect(pMid.x).toBeCloseTo(5, 1);
    expect(pMid.y).toBeGreaterThan(solution.source.y);

    // Tangent direction should point forward along curve
    const tangent = solution.evaluateTangent(0.5);
    expect(tangent.x).toBeGreaterThan(0.5);
  });

  it('classifies size matchups and plans battle camera shots deterministically', () => {
    expect(BattleCameraShotPlanner.classifyMatchup(2.0, 2.0)).toBe('balanced');
    expect(BattleCameraShotPlanner.classifyMatchup(4.5, 1.8)).toBe('extreme_ally_taller');
    expect(BattleCameraShotPlanner.classifyMatchup(1.5, 3.5)).toBe('extreme_opponent_taller');
    expect(BattleCameraShotPlanner.classifyMatchup(2.8, 1.8)).toBe('ally_taller');

    // Entry phase is always establish
    expect(BattleCameraShotPlanner.selectShot(0, 'entry')).toBe('establish');
    expect(BattleCameraShotPlanner.selectShot(5, 'entry')).toBe('establish');

    // Victory phase is victory_hero
    expect(BattleCameraShotPlanner.selectShot(2, 'victory')).toBe('victory_hero');

    // Action shots cycle deterministically
    const shot0 = BattleCameraShotPlanner.selectShot(0, 'action');
    const shot1 = BattleCameraShotPlanner.selectShot(1, 'action');
    const shot2 = BattleCameraShotPlanner.selectShot(2, 'action');
    const shot4 = BattleCameraShotPlanner.selectShot(4, 'action');

    expect(shot0).toBe('ally_shoulder');
    expect(shot1).toBe('side_action');
    expect(shot2).toBe('opponent_shoulder');
    expect(shot4).toBe(shot0); // repeats cycle
  });

  it('coordinates cinematic cutscenes via BattleCameraDirector and CameraArbitrator', () => {
    const arbitrator = new CameraArbitrator('first_person');
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);

    const mockEngine: any = {
      viewport: { camera },
      player: { cameraArbitrator: arbitrator },
    };

    const director = new BattleCameraDirector(mockEngine);
    expect(director.isActive()).toBe(false);

    director.startCutsceneShot('side_action', 2.0);
    expect(director.isActive()).toBe(true);
    expect(arbitrator.getActiveMode()).toBe('cinematic');

    // Step director update past duration
    director.update(2.5);
    expect(director.isActive()).toBe(false);
    expect(arbitrator.getActiveMode()).toBe('first_person'); // cleanly restored
  });

  it('triggers impact feedback, presentation hit-stop, and callout events', () => {
    const emit = vi.fn();
    const mockEngine: any = {
      burstVfx: vi.fn(),
      audio: { play: vi.fn() },
      effects: { shake: vi.fn(), flash: vi.fn() },
      sceneManager: {
        events: { emit },
        getRigidBody: () => null,
      },
      time: { timeScale: 1.0 },
    };

    const feedback = new CombatImpactFeedback(mockEngine);

    feedback.triggerImpact({
      attackerId: 1,
      targetId: 2,
      hitPosition: new THREE.Vector3(5, 1, 5),
      damage: 75,
      isCritical: true,
    });

    expect(mockEngine.burstVfx).toHaveBeenCalledWith('fire', expect.any(THREE.Vector3), 24);
    expect(mockEngine.effects.shake).toHaveBeenCalled();
    expect(mockEngine.time.timeScale).toBeLessThan(0.1); // hit-stop active
    expect(emit).toHaveBeenCalledWith('combat_callout', expect.objectContaining({
      targetId: 2,
      damage: 75,
      isCritical: true,
    }));

    // Step update to end hit-stop
    feedback.update(0.1);
    expect(mockEngine.time.timeScale).toBe(1.0); // restored
  });
});
