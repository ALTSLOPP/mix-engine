import type {
  TestScript,
  TestAction,
  ScenarioProfile,
  ScenarioOptions,
  RecordSettings,
  AssertionPredicate,
  FeelIntent,
} from './types';

/**
 * SENSORIUM — ScenarioLibrary.
 *
 * Turns a high-level intent ("test the driving mechanics") into a concrete, runnable
 * TestScript: a timeline of synthetic input with the right kinesthetic `intent`
 * markers so the FeelAnalyzer measures the right thing, plus profile-appropriate
 * assertions and a vision prompt grounded in what this scenario is exercising.
 *
 * This is the bridge from "an agent asked for X" to "the engine drove the real
 * PlayerController through X" — no hand-authored JSON required.
 */

/** A tiny timeline builder so scenarios read top-to-bottom in wall-clock order. */
class Timeline {
  private clock = 0;
  readonly actions: TestAction[] = [];

  /** Advance the clock without doing anything (a pause). */
  wait(seconds: number, label?: string): this {
    this.actions.push({ at: this.clock, type: 'wait', duration: seconds, label });
    this.clock += seconds;
    return this;
  }
  at(): number { return this.clock; }
  /** Push an action at the current clock without advancing it. */
  now(a: TestAction): this { this.actions.push({ ...a, at: this.clock }); return this; }
  /** Declare the kinesthetic intent for the inputs that follow. */
  intent(intent: FeelIntent, label?: string): this {
    this.actions.push({ at: this.clock, type: 'intent', intent, label });
    return this;
  }
  marker(name: string, label?: string): this {
    this.actions.push({ at: this.clock, type: 'marker', name, label });
    return this;
  }
  /** Hold a set of keys for `dur` seconds, then advance the clock past the hold. */
  hold(down: string[], dur: number, label?: string): this {
    this.actions.push({ at: this.clock, type: 'press', down, duration: dur, label });
    this.clock += dur;
    return this;
  }
  move(direction: [number, number], dur: number, label?: string): this {
    this.actions.push({ at: this.clock, type: 'move', direction, duration: dur, label });
    this.clock += dur;
    return this;
  }
  jump(label?: string): this { this.actions.push({ at: this.clock, type: 'jump', label }); return this; }
  attack(label?: string): this { this.actions.push({ at: this.clock, type: 'attack', label }); return this; }
  lookAt(target: [number, number, number], label?: string): this {
    this.actions.push({ at: this.clock, type: 'lookAt', target, label });
    return this;
  }
  possess(entityName: string | undefined, entityId: number | undefined): this {
    this.actions.push({ at: this.clock, type: 'possess', entityName, entityId });
    return this;
  }
  assert(name: string, predicate: AssertionPredicate): this {
    this.actions.push({ at: this.clock, type: 'assert', name, predicate });
    return this;
  }
}

const DEFAULT_DURATION: Record<ScenarioProfile, number> = {
  locomotion: 13,
  driving: 16,
  jump: 12,
  combat: 12,
  camera: 12,
  stress: 14,
  free: 8,
};

export function buildScenario(profile: ScenarioProfile, opts: ScenarioOptions = {}): TestScript {
  const name = `${profile}_${stamp()}`;
  const record: RecordSettings = {
    fps: 30,
    extractKeyframesEvery: 0.5,
    contactSheet: true,
    contactSheetCells: 12,
    video: true,
    maxDuration: (opts.duration ?? DEFAULT_DURATION[profile]) + 4,
    ...opts.record,
  };
  const common = { name, profile, record, baseline: opts.baseline } as const;
  const tl = new Timeline();
  tl.wait(0.5, 'settle').possess(opts.entityName, opts.entityId).wait(0.4, 'acquire');

  switch (profile) {
    case 'driving': return driving(tl, opts, common);
    case 'jump': return jump(tl, opts, common);
    case 'combat': return combat(tl, opts, common);
    case 'camera': return camera(tl, opts, common);
    case 'stress': return stress(tl, opts, common);
    case 'free': return free(tl, opts, common);
    case 'locomotion':
    default: return locomotion(tl, opts, common);
  }
}

type Common = { name: string; profile: ScenarioProfile; record: RecordSettings; baseline?: string };

function locomotion(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.intent('look').lookAt([5, 1.5, 5], 'frame area').wait(0.4);
  tl.intent('throttle').marker('walk-forward').move([0, -1], 2.0, 'walk forward');
  tl.intent('strafe').marker('strafe-right').move([1, 0], 1.5, 'strafe right');
  tl.intent('strafe').move([-1, 0], 1.5, 'strafe left');
  tl.intent('throttle').marker('run').hold(['KeyW', 'ShiftLeft'], 2.0, 'run forward');
  tl.intent('turn').lookAt([-6, 1.5, -6], 'turn around').wait(0.3);
  tl.intent('throttle').move([0, -1], 1.5, 'walk back');
  tl.wait(0.8, 'rest');
  tl.assert('did_move', { kind: 'velocity_gt', entityRef: { possessed: true }, magnitude: 0.5 });
  tl.assert('no_dead_input', { kind: 'no_anomaly', anomaly: 'never_moved' });
  tl.assert('responsive', { kind: 'responsiveness_lt_ms', value: 220 });
  return finalize(tl, c, opts,
    'Locomotion test: walking, strafing, running and turning. Judge ground contact, foot sliding, ' +
    'turn responsiveness, and whether the character starts/stops where the input says.');
}

function driving(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.intent('look').lookAt([0, 1.5, 20], 'look down the road').wait(0.3);
  tl.intent('throttle').marker('launch').hold(['KeyW'], 2.8, 'full throttle');
  tl.intent('turn').marker('corner-right').hold(['KeyW', 'KeyD'], 1.6, 'throttle + steer right');
  tl.intent('turn').marker('corner-left').hold(['KeyW', 'KeyA'], 1.6, 'throttle + steer left');
  tl.intent('throttle').hold(['KeyW'], 1.2, 'straighten out');
  tl.intent('brake').marker('braking').hold(['KeyS'], 1.2, 'hard brake');
  tl.intent('throttle').marker('reverse').hold(['KeyS'], 1.4, 'reverse');
  tl.wait(0.6, 'settle');
  tl.assert('reached_speed', { kind: 'velocity_gt', entityRef: { possessed: true }, magnitude: 2.0 });
  tl.assert('throttle_responsive', { kind: 'responsiveness_lt_ms', value: 250 });
  tl.assert('has_grip', { kind: 'feel_score_gte', metric: 'grip', value: 35 });
  tl.assert('no_dead_input', { kind: 'no_anomaly', anomaly: 'never_moved' });
  return finalize(tl, c, opts,
    'Driving test: launch, corner right, corner left, hard brake, reverse. Judge throttle response, ' +
    'cornering grip vs slide, weight transfer, braking distance, and whether the camera conveys speed.');
}

function jump(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.intent('throttle').marker('approach').move([0, -1], 1.2, 'run up');
  tl.intent('jump').marker('jump-1').jump('jump').wait(1.2, 'air + land');
  tl.intent('throttle').move([0, -1], 1.0, 'keep moving');
  tl.intent('jump').marker('jump-2').jump('jump again').wait(1.2, 'air + land');
  tl.intent('jump').marker('standing-jump').jump('standing jump').wait(1.2, 'air + land');
  tl.wait(0.6, 'rest');
  tl.assert('left_ground', { kind: 'position_gt', entityRef: { possessed: true }, axis: 'y', value: 0.2 });
  tl.assert('no_fall_through', { kind: 'no_anomaly', anomaly: 'fall_through' });
  return finalize(tl, c, opts,
    'Jump test: running jumps and a standing jump. Judge jump responsiveness, arc/gravity feel, ' +
    'apex hang time, and landing (snap vs squash, any clipping into the floor).');
}

function combat(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.intent('look').lookAt([0, 1.5, 5], 'face forward').wait(0.3);
  tl.intent('jump').marker('combo').attack('attack 1').wait(0.5).attack('attack 2').wait(0.5).attack('attack 3').wait(0.8);
  tl.intent('throttle').marker('move-attack').move([0, -1], 0.8, 'close distance');
  tl.intent('jump').attack('attack while moving').wait(0.8);
  tl.wait(0.6, 'recover');
  tl.assert('no_anim_lock', { kind: 'no_anomaly', anomaly: 'animation_stuck' });
  return finalize(tl, c, opts,
    'Combat test: a 3-hit combo then an attack while moving. Judge attack responsiveness, cadence, ' +
    'hit feedback (juice — shake/particles/sound), and whether the camera stays readable during action.');
}

function camera(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.intent('look').marker('orbit');
  for (const target of [[10, 1.5, 0], [0, 1.5, 10], [-10, 1.5, 0], [0, 1.5, -10], [10, 3, 10]] as [number, number, number][]) {
    tl.lookAt(target, 'pan').wait(0.9);
  }
  tl.intent('strafe').marker('move-look').move([1, 0], 1.5, 'strafe while panning');
  tl.lookAt([0, 1.5, 0], 'recenter').wait(0.6);
  tl.assert('camera_smooth', { kind: 'feel_score_gte', metric: 'cameraSmooth', value: 50 });
  return finalize(tl, c, opts,
    'Camera test: orbit the subject through cardinal angles, then strafe while panning. Judge ' +
    'smoothness (no snap-cuts), clipping through geometry, framing, and motion sickness risk.');
}

function stress(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.marker('rapid-input');
  for (let i = 0; i < 6; i++) {
    tl.intent('strafe').move([i % 2 === 0 ? 1 : -1, i % 3 === 0 ? -1 : 1], 0.4, `dir ${i}`);
    if (i % 2 === 0) tl.intent('jump').jump('hop');
  }
  tl.intent('throttle').hold(['KeyW', 'ShiftLeft'], 2.0, 'sprint');
  tl.wait(0.6, 'rest');
  tl.assert('held_fps', { kind: 'fps_gt', value: 30 });
  tl.assert('paced', { kind: 'feel_score_gte', metric: 'framePacing', value: 45 });
  return finalize(tl, c, opts,
    'Stress test: rapid direction changes, hops, then a sprint. Judge frame pacing under load, ' +
    'input buffering/dropping, and whether the controller stays stable through fast reversals.');
}

function free(tl: Timeline, opts: ScenarioOptions, c: Common): TestScript {
  tl.wait(2.0, 'observe');
  return finalize(tl, c, opts,
    'Free observation: the scene is recorded with no scripted input. Describe what you see.');
}

function finalize(tl: Timeline, c: Common, opts: ScenarioOptions, visionContext: string): TestScript {
  const gameLine = opts.game ? `Game under test: ${opts.game}. ` : '';
  return {
    name: c.name,
    profile: c.profile,
    record: c.record,
    baseline: c.baseline,
    description: `Auto-generated ${c.profile} scenario.`,
    visionContext: gameLine + visionContext,
    actions: tl.actions,
  };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
