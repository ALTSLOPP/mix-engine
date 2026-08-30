import * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { detectSkeletonProfile } from './SkeletonProfile';

/**
 * Minimal Mixamo bone preset (full body; extend with fingers as needed). Used when an
 * asset provides no explicit boneMapping.
 */
const MIXAMO_PRESET: Record<string, string> = {
  'mixamorigHips': 'Hips',
  'mixamorigSpine': 'Spine',
  'mixamorigSpine1': 'Spine1',
  'mixamorigSpine2': 'Spine2',
  'mixamorigNeck': 'Neck',
  'mixamorigHead': 'Head',
  'mixamorigLeftArm': 'LeftArm',
  'mixamorigLeftForeArm': 'LeftForeArm',
  'mixamorigLeftHand': 'LeftHand',
  'mixamorigRightArm': 'RightArm',
  'mixamorigRightForeArm': 'RightForeArm',
  'mixamorigRightHand': 'RightHand',
  'mixamorigLeftUpLeg': 'LeftUpLeg',
  'mixamorigLeftLeg': 'LeftLeg',
  'mixamorigLeftFoot': 'LeftFoot',
  'mixamorigRightUpLeg': 'RightUpLeg',
  'mixamorigRightLeg': 'RightLeg',
  'mixamorigRightFoot': 'RightFoot',
};

interface AnimEntry {
  name: string;
  action: THREE.AnimationAction;
  /** The root bone's position track, captured before removal from the bone's pose. */
  rootTrack: THREE.VectorKeyframeTrack | null;
  /** Loop flag from pack metadata; non-looping clips stop at the end for hit/death. */
  loop: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sample a Vector3 keyframe track (LINEAR) at time `t`. */
function sampleVec3(track: THREE.VectorKeyframeTrack, t: number, out: THREE.Vector3): THREE.Vector3 {
  const times = track.times;
  const values = track.values;
  const n = times.length;
  if (n === 0) return out.set(0, 0, 0);
  if (t <= times[0]) return out.fromArray(values, 0);
  if (t >= times[n - 1]) return out.fromArray(values, (n - 1) * 3);
  let i = 1;
  while (i < n && times[i] < t) i += 1;
  const t0 = times[i - 1];
  const t1 = times[i];
  const a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  const i0 = (i - 1) * 3;
  const i1 = i * 3;
  return out.set(
    lerp(values[i0], values[i1], a),
    lerp(values[i0 + 1], values[i1 + 1], a),
    lerp(values[i0 + 2], values[i1 + 2], a),
  );
}

/**
 * AnimationStateMachine.ts — Retargeting & blending.
 *
 * Bone resolution order: per-asset override → Mixamo preset → passthrough + warn.
 * The mixer advances per frame for a smooth pose, but the ROOT translation track is
 * removed from the bone (physics owns the root) and instead sampled to extract a per-frame
 * root delta, which is handed to RigidBodyComponent.accumulateRootMotion — never applied as
 * a physics target here (that happens per fixed substep in the engine loop).
 */
export class AnimationStateMachine {
  private readonly mixer: THREE.AnimationMixer;
  private readonly anims = new Map<string, AnimEntry>();
  private current: AnimEntry | null = null;

  private readonly boneMapping: Record<string, string>;
  private readonly rootBoneName: string;

  private paused = false;
  private lastRootSample = new THREE.Vector3();
  private lastActionTime = 0;
  private readonly _curr = new THREE.Vector3();
  private readonly _delta = new THREE.Vector3();
  /** Incoming clip's root delta for the current frame. Kept SEPARATE from `_delta`
   *  (which holds the outgoing clip's delta) so the crossfade combine step doesn't
   *  read an overwritten value — reusing one temp for both lost the incoming motion. */
  private readonly _incomingDelta = new THREE.Vector3();
  private readonly _frameDelta = new THREE.Vector3();
  /** Stable copy returned to callers so they can hold the reference safely. */
  private readonly _lastRootDelta = new THREE.Vector3();
  /** During a crossfade, the OUTGOING clip's root track + the remaining fade weight
   *  (1.0 → 0.0 over `fade` seconds). Used to blend the outgoing root motion out so a
   *  walk→idle transition doesn't cause an instant velocity drop. */
  private prevRootTrack: THREE.VectorKeyframeTrack | null = null;
  private prevRootTime = 0;
  private prevRootWeight = 0;
  private prevFadeSeconds = 0;
  private prevRootDelta = new THREE.Vector3();
  private prevRootSample = new THREE.Vector3();

  /** packId → Set<state> (for UI: "which pack does this state belong to"). */
  private packStates = new Map<string, Set<string>>();
  /** combatTrigger → list of state names (random pick when triggered). */
  private triggerMap = new Map<string, string[]>();
  /** Ordered list of applied pack ids (first is the source the rest layer on top of). */
  private appliedPacks: string[] = [];

  constructor(
    private readonly rb: RigidBodyComponent,
    root: THREE.Object3D,
    options: { boneMapping?: Record<string, string>; rootBone?: string } = {},
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    this.boneMapping = options.boneMapping ?? MIXAMO_PRESET;
    this.rootBoneName = options.rootBone ?? 'Hips';
  }

  private resolveBone(sourceName: string): string {
    const node = sourceName.split('.')[0];
    if (this.boneMapping[node]) return sourceName.replace(node, this.boneMapping[node]);
    if (MIXAMO_PRESET[node]) return sourceName.replace(node, MIXAMO_PRESET[node]);
    const detected = detectSkeletonProfile([node]);
    const canon = detected.sourceToCanonical.get(node);
    if (canon) {
      const target = this.boneMapping[canon] ?? canon;
      return sourceName.replace(node, target);
    }
    console.warn(`[AnimationStateMachine] no bone mapping for '${node}' — passthrough`);
    return sourceName;
  }

  /** Retarget once (cached) and split off the root-motion track. */
  addAnimation(name: string, clip: THREE.AnimationClip, opts: { rootTrack?: THREE.VectorKeyframeTrack | null; loop?: boolean } = {}): void {
    // Packs already retargeted via RetargetEngine and may hand us the rootTrack directly.
    // If opts.rootTrack is supplied (or clip carries __rootTrack), use it instead of scanning.
    const preRootTrack = (opts.rootTrack !== undefined ? opts.rootTrack
      : (clip as unknown as { __rootTrack?: THREE.VectorKeyframeTrack | null }).__rootTrack) ?? null;

    let rootTrack: THREE.VectorKeyframeTrack | null = preRootTrack;
    let clipToUse: THREE.AnimationClip;

    if (preRootTrack !== null || (opts as unknown as { __skipRemap?: boolean }).__skipRemap) {
      // Already retargeted by AnimationPackManager — avoid double-remapping which would
      // treat canonical names as source names and mis-route them.
      clipToUse = clip;
    } else {
      const retargeted = clip.clone();
      const kept: THREE.KeyframeTrack[] = [];
      for (const track of retargeted.tracks) {
        track.name = this.resolveBone(track.name);
        const [bone, prop] = track.name.split('.');
        const isRoot =
          (bone === this.rootBoneName || bone.endsWith(this.rootBoneName)) && prop === 'position';
        if (isRoot) {
          rootTrack = track as THREE.VectorKeyframeTrack; // captured, then NOT kept → physics owns root.
        } else {
          kept.push(track);
        }
      }
      retargeted.tracks = kept;
      clipToUse = retargeted;
    }

    const action = this.mixer.clipAction(clipToUse);
    // Honour loop flag (false for hit/death so they don't loop)
    const shouldLoop = opts.loop ?? true;
    if (!shouldLoop) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    this.anims.set(name, { name, action, rootTrack, loop: shouldLoop });
  }

  /** Back-compat overload: addAnimation(name, clip, rootTrack) like RetargetEngine path. */
  addAnimationWithRoot(name: string, clip: THREE.AnimationClip, rootTrack: THREE.VectorKeyframeTrack | null): void {
    this.addAnimation(name, clip, { rootTrack });
  }

  // ── Pack API (Animation Retarget Pro style) ───────────────────────────────

  /** Bulk-add clips from a retargeted pack. `packId` tags them for UI + removal. */
  addPackClips(
    packId: string,
    clips: Map<string, THREE.AnimationClip>,
    rootTracks: Map<string, THREE.VectorKeyframeTrack | null>,
    combatTriggers?: Map<string, string[]>,
  ): void {
    if (!this.appliedPacks.includes(packId)) this.appliedPacks.push(packId);
    const set = this.packStates.get(packId) ?? new Set<string>();
    for (const [id, clip] of clips) {
      const rt = rootTracks.get(id) ?? null;
      const isLoop = (clip as unknown as { loop?: number }).loop !== undefined
        ? (clip as unknown as { loop: number }).loop === THREE.LoopRepeat
        : !/die|dying|death|hit|hurt/i.test(id);
      this.addAnimation(id, clip, { rootTrack: rt, loop: isLoop } as unknown as { rootTrack: THREE.VectorKeyframeTrack | null; loop?: boolean });
      (this.anims.get(id) as unknown as Record<string, unknown>).__packId = packId;
      set.add(id);
    }
    this.packStates.set(packId, set);
    // Merge trigger bindings
    if (combatTriggers) {
      for (const [trig, states] of combatTriggers) {
        const cur = this.triggerMap.get(trig) ?? [];
        for (const s of states) if (!cur.includes(s)) cur.push(s);
        this.triggerMap.set(trig, cur);
      }
    }
  }

  /** Remove every state that came from the pack (for swapping packs). */
  removePack(packId: string): void {
    const set = this.packStates.get(packId);
    if (!set) return;
    for (const name of set) {
      const entry = this.anims.get(name);
      if (entry) {
        if (this.current === entry) this.current = null;
        entry.action.stop();
        this.anims.delete(name);
      }
    }
    this.packStates.delete(packId);
    this.appliedPacks = this.appliedPacks.filter((p) => p !== packId);
    // Prune triggers pointing at removed states
    for (const [trig, list] of [...this.triggerMap.entries()]) {
      const kept = list.filter((s) => this.anims.has(s));
      if (kept.length === 0) this.triggerMap.delete(trig);
      else this.triggerMap.set(trig, kept);
    }
    // Fall back to idle if we removed the current state
    if (!this.current && this.anims.has('idle')) this.transition('idle', 0.15);
  }

  /** All pack ids currently applied (ordered). */
  get appliedPackIds(): string[] { return [...this.appliedPacks]; }

  /** Map of combat trigger → states (for inspector display). */
  getTriggerMap(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [k, v] of this.triggerMap) out[k] = [...v];
    return out;
  }

  /** Bind a trigger to a state (IDE or data-driven combat). Multiple states = random pick. */
  bindTrigger(trigger: string, state: string): void {
    const list = this.triggerMap.get(trigger) ?? [];
    if (!list.includes(state)) list.push(state);
    this.triggerMap.set(trigger, list);
  }

  unbindTrigger(trigger: string, state?: string): void {
    if (state === undefined) { this.triggerMap.delete(trigger); return; }
    const list = this.triggerMap.get(trigger);
    if (!list) return;
    const idx = list.indexOf(state);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.triggerMap.delete(trigger);
  }

  /** Fire a combat trigger — picks a random bound state and transitions (or no-op if unbound). */
  playTrigger(trigger: string, fade = 0.18): boolean {
    const list = this.triggerMap.get(trigger);
    if (!list || list.length === 0) return false;
    const pick = list[Math.floor(Math.random() * list.length)];
    if (!this.anims.has(pick)) return false;
    this.transition(pick, fade);
    return true;
  }

  /** All known trigger names (for completing UI). */
  listTriggers(): string[] { return [...this.triggerMap.keys()]; }

  /** True if a clip has been registered under `name`. */
  hasAnimation(name: string): boolean {
    return this.anims.has(name);
  }

  /** All registered state names. */
  listAnimations(): string[] {
    return [...this.anims.keys()];
  }

  /** Current state name, if any. */
  get currentState(): string | null {
    return this.current?.name ?? null;
  }

  get currentNormalizedTime(): number | null {
    if (!this.current) return null;
    const duration = this.current.action.getClip().duration;
    if (duration <= 0) return 0;
    return THREE.MathUtils.clamp(this.current.action.time / duration, 0, 1);
  }

  transition(state: string, fade = 0.3): void {
    const next = this.anims.get(state);
    if (!next || next === this.current) return;
    // Capture the OUTGOING clip's root track so we can blend its motion out over the
    // fade — otherwise the instant `this.current = next` swap kills root motion and
    // the character's body stops moving while the visual mesh is still mid-fade.
    if (this.current) {
      this.prevRootTrack = this.current.rootTrack;
      this.prevRootTime = this.current.action.time;
      this.prevRootWeight = 1.0;
      this.prevFadeSeconds = Math.max(1e-3, fade);
      // Sample the outgoing clip's CURRENT position so its delta this frame starts
      // from where it actually is (not from time 0 → no instant jump on transition).
      if (this.prevRootTrack) {
        sampleVec3(this.prevRootTrack, this.prevRootTime, this.prevRootSample);
      } else {
        this.prevRootSample.set(0, 0, 0);
      }
      this.prevRootDelta.set(0, 0, 0);
    }
    next.action.reset().play();
    if (this.current) this.current.action.crossFadeTo(next.action, fade, false);
    else next.action.fadeIn(fade);
    this.current = next;
    this.resampleBaseline();
  }

  pause(): void {
    this.paused = true;
  }

  /** Resume and rebase root motion against the CURRENT pose, so no jump is accumulated. */
  resume(): void {
    this.paused = false;
    this.resampleBaseline();
  }

  resampleBaseline(): void {
    if (this.current?.rootTrack) {
      sampleVec3(this.current.rootTrack, this.current.action.time, this.lastRootSample);
      this.lastActionTime = this.current.action.time;
    } else {
      this.lastRootSample.set(0, 0, 0);
      this.lastActionTime = 0;
    }
  }

  update(dt: number): void {
    // While paused (e.g. a gizmo drag) there is no motion to report — clear the cached
    // delta so getRootMotionDelta() never hands callers a stale value.
    if (this.paused) { this._lastRootDelta.set(0, 0, 0); return; }
    this.mixer.update(dt);

    const entry = this.current;
    // 1) Sample the incoming clip's root track (if any) — this is the primary motion
    //    source, and is zero for stationary clips (idle, hit-reaction root-locked).
    let incomingDelta: THREE.Vector3 | null = null;
    if (entry?.rootTrack) {
      const currentTime = entry.action.time;
      sampleVec3(entry.rootTrack, currentTime, this._curr);
      
      if (currentTime < this.lastActionTime) {
        // Animation looped!
        // Delta to end of clip
        const endPos = new THREE.Vector3();
        sampleVec3(entry.rootTrack, Number.MAX_VALUE, endPos);
        const delta1 = endPos.sub(this.lastRootSample);
        
        // Delta from start of clip to current
        const startPos = new THREE.Vector3();
        sampleVec3(entry.rootTrack, 0, startPos);
        const delta2 = this._curr.clone().sub(startPos);
        
        this._incomingDelta.copy(delta1).add(delta2);
      } else {
        this._incomingDelta.copy(this._curr).sub(this.lastRootSample);
      }

      incomingDelta = this._incomingDelta;

      this.lastRootSample.copy(this._curr);
      this.lastActionTime = currentTime;
    } else {
      this._lastRootDelta.set(0, 0, 0);
      this.lastActionTime = 0;
    }

    // 2) Sample the OUTGOING clip's root track during the crossfade, and fade its
    //    contribution out over `prevFadeSeconds`. This is what fixes the walk→idle
    //    foot-slide: the outgoing walk's motion keeps contributing (scaled by the
    //    fading weight) until the visual blend completes.
    let outgoingDelta: THREE.Vector3 | null = null;
    if (this.prevRootTrack && this.prevRootWeight > 0) {
      this.prevRootTime += dt;
      sampleVec3(this.prevRootTrack, this.prevRootTime, this._curr);
      this._delta.copy(this._curr).sub(this.prevRootSample);
      if (this._delta.lengthSq() < 25) outgoingDelta = this._delta;
      this.prevRootSample.copy(this._curr);
      // Linearly ramp the outgoing weight from 1 → 0 over the fade.
      this.prevRootWeight = Math.max(0, this.prevRootWeight - dt / this.prevFadeSeconds);
    } else if (this.prevRootWeight > 0) {
      // Fade expired — clear the outgoing channel.
      this.prevRootTrack = null;
      this.prevRootWeight = 0;
    }

    // 3) Combine: total = incoming + outgoing * weight (or just incoming if no fade).
    if (incomingDelta && outgoingDelta) {
      this._frameDelta.copy(incomingDelta).addScaledVector(outgoingDelta, this.prevRootWeight);
    } else if (incomingDelta) {
      this._frameDelta.copy(incomingDelta);
    } else if (outgoingDelta) {
      this._frameDelta.copy(outgoingDelta).multiplyScalar(this.prevRootWeight);
    } else {
      this._frameDelta.set(0, 0, 0);
    }

    // 4) Convert root-local motion into world space via the entity's current facing.
    if (this._frameDelta.lengthSq() > 0) {
      this._frameDelta.applyQuaternion(this.rb.mesh.quaternion);
      this.rb.accumulateRootMotion(this._frameDelta, dt);
    }
    this._lastRootDelta.copy(this._frameDelta);
  }

  getRootMotionDelta(): THREE.Vector3 {
    return this._lastRootDelta;
  }

  /** The rigid body this machine drives (used to match a machine to an entity). */
  get rigidBody(): RigidBodyComponent {
    return this.rb;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.anims.clear();
    this.current = null;
  }
}
