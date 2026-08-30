// World-space retargeting invariants, on synthetic rigs with known geometry.
//
// The load-bearing assertion here is POSITIONAL: when two rigs have identical bone
// offsets and differ only in their BIND ROTATIONS (A-pose vs T-pose), a correct 1:1
// retarget must place every target bone at exactly the source bone's world position
// for every frame. That single check catches bind-frame errors, roll errors,
// hierarchy-ordering errors and correction-cache collisions at once — none of which
// a name-mapping test can see.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { retargetClips, extractSkeletonGraph, type SkeletonNode } from '../src/animation/RetargetEngine';

// ── A synthetic humanoid, T-posed, in metres ────────────────────────────────
// Only bones the generic humanoid profile knows about, so every one of them maps.
const PARENT: Record<string, string | null> = {
  Hips: null,
  Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
  LeftArm: 'Spine2', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightArm: 'Spine2', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
};
const TPOSE_WORLD: Record<string, [number, number, number]> = {
  Hips: [0, 1.00, 0],
  Spine: [0, 1.15, 0], Spine1: [0, 1.30, 0], Spine2: [0, 1.45, 0],
  Neck: [0, 1.56, 0], Head: [0, 1.66, 0],
  LeftArm: [0.18, 1.45, 0], LeftForeArm: [0.45, 1.45, 0], LeftHand: [0.70, 1.45, 0],
  RightArm: [-0.18, 1.45, 0], RightForeArm: [-0.45, 1.45, 0], RightHand: [-0.70, 1.45, 0],
  LeftUpLeg: [0.10, 0.95, 0], LeftLeg: [0.10, 0.52, 0], LeftFoot: [0.10, 0.08, 0],
  RightUpLeg: [-0.10, 0.95, 0], RightLeg: [-0.10, 0.52, 0], RightFoot: [-0.10, 0.08, 0],
};
const BONES = Object.keys(PARENT);

/**
 * Same skeleton with a shorter SHIN, thigh untouched, feet still on the ground.
 *
 * Scaling a whole leg uniformly is not a proportion mismatch at all: matching every
 * bone rotation then places the ankle at exactly `scale ×` the source's ankle
 * displacement, so drift is identically zero. Changing the ratio BETWEEN the two
 * segments is what a rotation-only retarget genuinely cannot absorb.
 */
function poseFor(shinScale: number): Record<string, [number, number, number]> {
  const footY = TPOSE_WORLD.LeftFoot[1];
  const kneeY = TPOSE_WORLD.LeftLeg[1];
  const newKneeY = footY + (kneeY - footY) * shinScale;
  const delta = newKneeY - kneeY; // thigh and everything above it ride down with the knee
  const out: Record<string, [number, number, number]> = {};
  for (const [n, [x, y, z]] of Object.entries(TPOSE_WORLD)) {
    if (n === 'LeftFoot' || n === 'RightFoot') out[n] = [x, y, z];
    else if (n === 'LeftLeg' || n === 'RightLeg') out[n] = [x, newKneeY, z];
    else out[n] = [x, y + delta, z];
  }
  return out;
}

interface RigOpts {
  /** Bind rotations to bake in, i.e. what makes an "A-pose rig" an A-pose rig. */
  bindRot?: Record<string, THREE.Quaternion>;
  /** Shorten the shin relative to the thigh (1 = the default proportions). */
  shinScale?: number;
  /** Source unit scale: 100 for a centimetre rig. */
  unit?: number;
  /** Extra rotation on a container above the skeleton (a Z-up FBX axis node). */
  containerRot?: THREE.Quaternion;
  /** Insert an unnamed node above the hips (FBX axis-correction node). */
  unnamedAbove?: boolean;
  /** Insert a `root` bone above the hips that carries world travel (UE style). */
  rootBone?: boolean;
}

interface Rig {
  container: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
  graph: Map<string, SkeletonNode>;
  names: string[];
}

function buildRig(opts: RigOpts = {}): Rig {
  const unit = opts.unit ?? 1;
  const container = new THREE.Object3D();
  if (opts.containerRot) container.quaternion.copy(opts.containerRot);

  let attach: THREE.Object3D = container;
  if (opts.unnamedAbove) {
    const anon = new THREE.Object3D(); // name === '' on purpose
    anon.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    container.add(anon);
    attach = anon;
  }
  const bones = new Map<string, THREE.Bone>();
  if (opts.rootBone) {
    const rootB = new THREE.Bone();
    rootB.name = 'root';
    attach.add(rootB);
    bones.set('root', rootB);
    attach = rootB;
  }

  const pose = opts.shinScale != null ? poseFor(opts.shinScale) : TPOSE_WORLD;
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const parentName = PARENT[name];
    const w = pose[name];
    const pw = parentName ? pose[parentName] : [0, 0, 0];
    b.position.set((w[0] - pw[0]) * unit, (w[1] - pw[1]) * unit, (w[2] - pw[2]) * unit);
    const r = opts.bindRot?.[name];
    if (r) b.quaternion.copy(r);
    (parentName ? bones.get(parentName)! : attach).add(b);
    bones.set(name, b);
  }

  container.updateMatrixWorld(true);
  return { container, bones, graph: extractSkeletonGraph(container), names: [...bones.keys()] };
}

const axisAngle = (x: number, y: number, z: number, deg: number) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), THREE.MathUtils.degToRad(deg));

/**
 * A deliberately awkward A-pose: arms down AND swept forward AND rolled about their
 * own axis. The sweep is what separates a frame-based T-pose correction from a
 * shortest-arc one — a pure "arms straight down" A-pose is a special case where the
 * two happen to agree.
 */
function aPoseBind(): Record<string, THREE.Quaternion> {
  const l = axisAngle(0, 1, 0, -25).multiply(axisAngle(0, 0, 1, -50)).multiply(axisAngle(1, 0, 0, 30));
  const r = axisAngle(0, 1, 0, 25).multiply(axisAngle(0, 0, 1, 50)).multiply(axisAngle(1, 0, 0, -30));
  return { LeftArm: l, RightArm: r };
}

// ── Clip authoring + FK evaluation ──────────────────────────────────────────

/** Deterministic pseudo-random in [-1, 1]. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xffffffff) * 2 - 1; };
}

const TIMES = [0, 0.5, 1];

/** Animate a rig away from its bind pose: every bone gets a small extra rotation. */
function makeClip(rig: Rig, seed: number, hipsTravel = true): THREE.AnimationClip {
  const rnd = prng(seed);
  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  const extra = new THREE.Quaternion();

  for (const name of BONES) {
    const bone = rig.bones.get(name)!;
    const values: number[] = [];
    for (let i = 0; i < TIMES.length; i++) {
      extra.setFromAxisAngle(new THREE.Vector3(rnd(), rnd(), rnd()).normalize(), rnd() * 0.6);
      q.copy(bone.quaternion).multiply(extra);
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, TIMES, values));
  }
  if (hipsTravel) {
    const h = rig.bones.get('Hips')!;
    const p: number[] = [];
    for (let i = 0; i < TIMES.length; i++) p.push(h.position.x, h.position.y + 0.05 * i, h.position.z + 0.4 * i);
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', TIMES, p));
  }
  return new THREE.AnimationClip('synthetic', 1, tracks);
}

/** Drive a rig with a clip at time t (sampling between keys) and read world state. */
function pose(rig: Rig, clip: THREE.AnimationClip, t: number): void {
  const a = new THREE.Quaternion();
  const b = new THREE.Quaternion();
  for (const track of clip.tracks) {
    const [bone, prop] = track.name.split('.');
    const obj = rig.bones.get(bone);
    if (!obj) continue;
    const times = track.times;
    const v = track.values as unknown as number[];
    let i = 1;
    while (i < times.length && times[i] < t) i++;
    const lo = Math.max(0, i - 1);
    const hi = Math.min(times.length - 1, i);
    const span = times[hi] - times[lo];
    const f = span > 1e-9 ? (t - times[lo]) / span : 0;
    if (prop === 'quaternion') {
      a.fromArray(v, lo * 4); b.fromArray(v, hi * 4);
      if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w);
      obj.quaternion.copy(a).slerp(b, f).normalize();
    } else if (prop === 'position') {
      for (let k = 0; k < 3; k++) {
        obj.position.setComponent(k, v[lo * 3 + k] + (v[hi * 3 + k] - v[lo * 3 + k]) * f);
      }
    }
  }
  rig.container.updateMatrixWorld(true);
}

function fkWorld(rig: Rig, clip: THREE.AnimationClip, t: number): Map<string, THREE.Vector3> {
  pose(rig, clip, t);
  const out = new Map<string, THREE.Vector3>();
  for (const name of BONES) out.set(name, rig.bones.get(name)!.getWorldPosition(new THREE.Vector3()));
  return out;
}

function worldQuat(rig: Rig, clip: THREE.AnimationClip, t: number, bone: string): THREE.Quaternion {
  pose(rig, clip, t);
  return rig.bones.get(bone)!.getWorldQuaternion(new THREE.Quaternion());
}

/** A locomotion-ish clip: legs swing and knees bend over `n` frames. */
function makeWalkClip(rig: Rig, n = 13): { clip: THREE.AnimationClip; times: number[] } {
  const times = Array.from({ length: n }, (_, i) => i / (n - 1));
  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  for (const name of BONES) {
    const bone = rig.bones.get(name)!;
    const vals: number[] = [];
    for (let i = 0; i < n; i++) {
      const ph = times[i] * Math.PI * 2;
      q.copy(bone.quaternion);
      if (name === 'LeftUpLeg') q.multiply(axisAngle(1, 0, 0, 38 * Math.sin(ph)));
      else if (name === 'RightUpLeg') q.multiply(axisAngle(1, 0, 0, -38 * Math.sin(ph)));
      else if (name === 'LeftLeg') q.multiply(axisAngle(1, 0, 0, -30 * (1 - Math.cos(ph)) / 2));
      else if (name === 'RightLeg') q.multiply(axisAngle(1, 0, 0, -30 * (1 + Math.cos(ph)) / 2));
      else if (name === 'Spine1') q.multiply(axisAngle(0, 1, 0, 6 * Math.sin(ph)));
      vals.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, vals));
  }
  const h = rig.bones.get('Hips')!;
  const p: number[] = [];
  for (let i = 0; i < n; i++) p.push(h.position.x, h.position.y, h.position.z + 1.2 * times[i]);
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, p));
  return { clip: new THREE.AnimationClip('walk', 1, tracks), times };
}

function retarget(src: Rig, dst: Rig, clip: THREE.AnimationClip, extra = {}) {
  return retargetClips([clip], dst.names, {
    sourceBoneNames: src.names,
    sourceSkeleton: src.graph,
    targetSkeleton: dst.graph,
    ...extra,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('world-space retarget — structural invariants', () => {
  it('retargeting a rig onto an identical rig is the identity', () => {
    const src = buildRig();
    const dst = buildRig();
    const clip = makeClip(src, 7);

    const out = retarget(src, dst, clip).clips[0];

    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const got = out.tracks.find(t => t.name === track.name);
      expect(got, `missing output track ${track.name}`).toBeTruthy();
      const a = track.values;
      const b = got!.values;
      for (let i = 0; i < a.length; i += 4) {
        // Quaternion double cover: q and -q are the same rotation.
        const dot = a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3];
        expect(Math.abs(dot)).toBeCloseTo(1, 5);
      }
    }
    const hips = out.tracks.find(t => t.name === 'Hips.position')!;
    const srcHips = clip.tracks.find(t => t.name === 'Hips.position')!;
    for (let i = 0; i < srcHips.values.length; i++) {
      expect(hips.values[i]).toBeCloseTo(srcHips.values[i], 5);
    }
  });

  it('A-pose source drives a T-pose target to identical world positions', () => {
    // Same bone names on both rigs — this is exactly the case where a T-pose
    // correction cache keyed on bone name alone hands the target the SOURCE's
    // correction, silently cancelling the alignment down to a raw bind delta.
    const src = buildRig({ bindRot: aPoseBind() });
    const dst = buildRig();
    const clip = makeClip(src, 11);

    const out = retarget(src, dst, clip).clips[0];

    for (const t of TIMES) {
      const want = fkWorld(src, clip, t);
      const got = fkWorld(dst, out, t);
      for (const name of BONES) {
        const d = want.get(name)!.distanceTo(got.get(name)!);
        expect(d, `${name} @ t=${t} off by ${d.toFixed(4)}m`).toBeLessThan(2e-3);
      }
    }
  });

  it('preserves the elbow hinge plane rather than letting it roll sideways', () => {
    const src = buildRig({ bindRot: aPoseBind() });
    const dst = buildRig();
    const clip = makeClip(src, 23);
    const out = retarget(src, dst, clip).clips[0];

    for (const t of TIMES) {
      const a = fkWorld(src, clip, t);
      const b = fkWorld(dst, out, t);
      for (const side of ['Left', 'Right']) {
        const nrm = (m: Map<string, THREE.Vector3>) => new THREE.Vector3()
          .crossVectors(
            new THREE.Vector3().subVectors(m.get(`${side}ForeArm`)!, m.get(`${side}Arm`)!),
            new THREE.Vector3().subVectors(m.get(`${side}Hand`)!, m.get(`${side}ForeArm`)!),
          ).normalize();
        expect(nrm(a).dot(nrm(b)), `${side} elbow plane @ t=${t}`).toBeGreaterThan(0.999);
      }
    }
  });
});

describe('world-space retarget — extra source links', () => {
  /** Splice an unmappable `Neck2` between Neck and Head, as UE rigs have. */
  function withExtraNeck(rig: Rig): Rig {
    const neck = rig.bones.get('Neck')!;
    const head = rig.bones.get('Head')!;
    const n2 = new THREE.Bone();
    n2.name = 'Neck2';
    n2.position.copy(head.position).multiplyScalar(0.5);
    neck.remove(head);
    neck.add(n2);
    n2.add(head);
    head.position.sub(n2.position);
    rig.container.updateMatrixWorld(true);
    return {
      container: rig.container,
      bones: new Map([...rig.bones, ['Neck2', n2]]),
      graph: extractSkeletonGraph(rig.container),
      names: [...rig.names, 'Neck2'],
    };
  }

  it('folds an unmapped animated link into the next mapped bone', () => {
    // UE's Neck1/Neck2 against Mixamo's single Neck. Carrying only Neck2's REST
    // transform drops its motion outright and the head under-rotates.
    const src = withExtraNeck(buildRig());
    const dst = buildRig();
    const clip = makeClip(src, 53, false);
    const bend = axisAngle(1, 0, 0, 40);
    const q0 = new THREE.Quaternion();
    clip.tracks.push(new THREE.QuaternionKeyframeTrack(
      'Neck2.quaternion', [TIMES[0], TIMES[2]],
      [q0.x, q0.y, q0.z, q0.w, bend.x, bend.y, bend.z, bend.w],
    ));

    const res = retarget(src, dst, clip);
    expect(res.warnings.join('\n')).toMatch(/Neck2/);

    for (const t of TIMES) {
      const want = worldQuat(src, clip, t, 'Head');
      const got = worldQuat(dst, res.clips[0], t, 'Head');
      expect(THREE.MathUtils.radToDeg(want.angleTo(got)), `head @ t=${t}`).toBeLessThan(0.5);
    }
    // And the bend is real — otherwise the test would pass on a no-op.
    const swept = worldQuat(src, clip, TIMES[0], 'Head').angleTo(worldQuat(src, clip, TIMES[2], 'Head'));
    expect(THREE.MathUtils.radToDeg(swept)).toBeGreaterThan(20);
  });
});

describe('world-space retarget — root motion', () => {
  it('composes a UE-style `root` travel track with the hips bob', () => {
    const src = buildRig({ rootBone: true });
    const dst = buildRig();
    const clip = makeClip(src, 3);
    // Root carries 2 m of forward travel; hips already carry 0.4 m of their own.
    clip.tracks.push(new THREE.VectorKeyframeTrack(
      'root.position', TIMES, [0, 0, 0, 0, 0, 1, 0, 0, 2],
    ));

    const res = retarget(src, dst, clip);
    expect(res.hasRootTrack[0]).toBe(true);
    const hips = res.clips[0].tracks.find(t => t.name === 'Hips.position')!;
    expect(hips).toBeTruthy();
    // Reading only the pelvis track would yield 0.8 m of travel and lose the root's 2 m.
    const zStart = hips.values[2];
    const zEnd = hips.values[hips.values.length - 1];
    expect(zEnd - zStart).toBeCloseTo(2.8, 3);
  });

  it('rotates root motion into the target frame across an axis-correction node', () => {
    // Source lives under an unnamed Z-up→Y-up node; the target does not. Copying
    // the raw position values across would turn "walk forward" into "walk up".
    const src = buildRig({ unnamedAbove: true });
    const dst = buildRig();
    const clip = makeClip(src, 5);

    const res = retarget(src, dst, clip);
    const hips = res.clips[0].tracks.find(t => t.name === 'Hips.position')!;
    const d = new THREE.Vector3(
      hips.values[hips.values.length - 3] - hips.values[0],
      hips.values[hips.values.length - 2] - hips.values[1],
      hips.values[hips.values.length - 1] - hips.values[2],
    );
    // The source's 0.4 m of +Z travel is rotated to -Y by the axis node; the
    // retarget must undo that and hand the target travel back on +Z.
    expect(d.z).toBeGreaterThan(0.3);
    expect(Math.abs(d.y)).toBeLessThan(0.15);
  });

  it('drops the root track when keepRootMotion is false', () => {
    const src = buildRig();
    const dst = buildRig();
    const res = retarget(src, dst, makeClip(src, 9), { keepRootMotion: false });
    expect(res.hasRootTrack[0]).toBe(false);
    expect(res.clips[0].tracks.some(t => t.name.endsWith('.position'))).toBe(false);
  });
});

describe('world-space retarget — unmapped root bone', () => {
  it('folds UE root-bone yaw into the target hips rotation', () => {
    // `root` has no Mixamo counterpart, so it is never mapped. Leaving its chain at
    // rest drops turn-in-place yaw from every rotation — while the root-motion FK
    // still uses it for translation, giving a character that slides around a curve
    // it never turns into.
    const src = buildRig({ rootBone: true });
    const dst = buildRig();
    const clip = makeClip(src, 31, false);
    const yaw = 70;
    const q0 = new THREE.Quaternion();
    const q1 = axisAngle(0, 1, 0, yaw);
    clip.tracks.push(new THREE.QuaternionKeyframeTrack(
      'root.quaternion', [TIMES[0], TIMES[2]],
      [q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w],
    ));

    const out = retarget(src, dst, clip).clips[0];
    const before = worldQuat(dst, out, TIMES[0], 'Hips');
    const after = worldQuat(dst, out, TIMES[2], 'Hips');
    const srcBefore = worldQuat(src, clip, TIMES[0], 'Hips');
    const srcAfter = worldQuat(src, clip, TIMES[2], 'Hips');

    const swept = (a: THREE.Quaternion, b: THREE.Quaternion) =>
      THREE.MathUtils.radToDeg(a.angleTo(b));
    // The target's hips must sweep through the same total rotation the source's did.
    expect(swept(before, after)).toBeCloseTo(swept(srcBefore, srcAfter), 1);
    expect(swept(before, after)).toBeGreaterThan(yaw * 0.5);
  });
});

describe('world-space retarget — end-effector drift', () => {
  /** Bind-pose world positions — read BEFORE anything poses the rig. */
  const restOf = (rig: Rig, bone: string) =>
    rig.bones.get(bone)!.getWorldPosition(new THREE.Vector3());

  it('warns about the drift it cannot fix without footLock', () => {
    const src = buildRig();
    const dst = buildRig({ shinScale: 0.65 });
    const { clip } = makeWalkClip(src);

    const res = retarget(src, dst, clip);
    expect(res.warnings.join('\n')).toMatch(/feet drift up to .* footLock:true/);
  });

  it('footLock drives the target ankles onto the source path', () => {
    const src = buildRig();
    const dst = buildRig({ shinScale: 0.65 });
    const { clip, times } = makeWalkClip(src);

    const srcRest = new Map(['LeftFoot', 'RightFoot'].map(b => [b, restOf(src, b)]));
    const dstRest = new Map(['LeftFoot', 'RightFoot'].map(b => [b, restOf(dst, b)]));

    const loose = retarget(src, dst, clip);
    const locked = retarget(src, dst, clip, { footLock: true });
    expect(locked.warnings.join('\n')).toMatch(/footLock applied/);

    const scale = loose.scales[0];
    const worstOf = (out: THREE.AnimationClip) => {
      let worst = 0;
      for (const t of times) {
        const want = new Map(['LeftFoot', 'RightFoot'].map(b => {
          const s = fkWorld(src, clip, t).get(b)!.clone();
          return [b, s.sub(srcRest.get(b)!).multiplyScalar(scale).add(dstRest.get(b)!)];
        }));
        const got = fkWorld(dst, out, t);
        for (const bone of ['LeftFoot', 'RightFoot']) {
          worst = Math.max(worst, want.get(bone)!.distanceTo(got.get(bone)!));
        }
      }
      return worst;
    };

    const before = worstOf(loose.clips[0]);
    const after = worstOf(locked.clips[0]);
    // Rotation-only retargeting genuinely cannot hit these positions...
    expect(before).toBeGreaterThan(0.02);
    // ...and the IK solve should land within a centimetre of them.
    expect(after).toBeLessThan(0.01);
    expect(after).toBeLessThan(before * 0.3);
  });

  it('leaves a matched-proportion retarget alone', () => {
    const src = buildRig();
    const dst = buildRig();
    const { clip, times } = makeWalkClip(src);

    const plain = retarget(src, dst, clip).clips[0];
    const locked = retarget(src, dst, clip, { footLock: true }).clips[0];

    for (const t of times) {
      const a = fkWorld(dst, plain, t);
      const b = fkWorld(dst, locked, t);
      for (const bone of BONES) {
        expect(a.get(bone)!.distanceTo(b.get(bone)!), `${bone} @ ${t}`).toBeLessThan(5e-3);
      }
    }
  });

  it('never emits NaN from the IK solve', () => {
    const src = buildRig();
    const dst = buildRig({ shinScale: 0.02 }); // a shin with essentially no length
    const { clip } = makeWalkClip(src);
    const out = retarget(src, dst, clip, { footLock: true }).clips[0];
    for (const track of out.tracks) {
      for (const v of track.values) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('world-space retarget — scale', () => {
  it('derives cm→m from the bind poses, not from the animated hips height', () => {
    const src = buildRig({ unit: 100 });
    const dst = buildRig();
    // A crouch: hips parked at a third of standing height for the whole clip. The
    // old median-animated-height heuristic reads this as a much shorter character.
    const clip = makeClip(src, 13, false);
    const h = src.bones.get('Hips')!;
    clip.tracks.push(new THREE.VectorKeyframeTrack(
      'Hips.position', TIMES,
      [h.position.x, h.position.y / 3, h.position.z, h.position.x, h.position.y / 3, h.position.z,
       h.position.x, h.position.y / 3, h.position.z],
    ));

    const res = retarget(src, dst, clip);
    expect(res.scales[0]).toBeCloseTo(0.01, 4);
  });

  it('ignores the bind ratio when the target rig is not authored at metre scale', () => {
    // Real case: a character GLB authored at ~1/160 node scale and scaled up at
    // runtime, driven by clips emitted in metres. The bind ratio is geometrically
    // correct and useless — root motion downstream is metres, not rig units.
    const src = buildRig();
    const dst = buildRig({ unit: 0.006 });
    const clip = makeClip(src, 41);

    const res = retarget(src, dst, clip);
    expect(res.warnings.join('\n')).toMatch(/not authored at metre scale/);
    // Falls back to the per-clip metre heuristic rather than the 0.006 ratio.
    expect(res.scales[0]).toBeGreaterThan(0.5);
  });
});

describe('world-space retarget — mismatched unit systems', () => {
  it('refuses footLock instead of dragging feet to meaningless coordinates', () => {
    const src = buildRig();
    const dst = buildRig({ unit: 0.006 });
    const { clip } = makeWalkClip(src);

    const res = retarget(src, dst, clip, { footLock: true });
    expect(res.warnings.join('\n')).toMatch(/not in a common scale, so footLock is skipped/);
    expect(res.warnings.join('\n')).not.toMatch(/footLock applied/);
  });
});

describe('world-space retarget — degenerate input', () => {
  it('never emits NaN when bones coincide', () => {
    // Collapse the arms onto their parents: zero-length bones give no direction.
    const src = buildRig({ bindRot: aPoseBind() });
    for (const n of ['LeftForeArm', 'RightForeArm']) src.bones.get(n)!.position.set(0, 0, 0);
    src.container.updateMatrixWorld(true);
    const collapsed = { ...src, graph: extractSkeletonGraph(src.container) };
    const dst = buildRig();

    const out = retarget(collapsed, dst, makeClip(src, 17)).clips[0];
    for (const track of out.tracks) {
      for (const v of track.values) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('world-space retarget — world-frame alignment', () => {
  it('corrects a genuine axis-convention mismatch, snapped to an exact quarter turn', () => {
    const src = buildRig({ containerRot: axisAngle(1, 0, 0, 88) }); // a Z-up-ish export
    const dst = buildRig();
    const res = retarget(src, dst, makeClip(src, 61, false));
    // Measured 88°, applied as exactly 90° — the measurement carries the same
    // estimation noise as the threshold, so applying it raw would leave the rig off true.
    expect(res.warnings.join('\n')).toMatch(/axis-convention mismatch and rotating the animation 90°/);
  });

  it('ignores a small frame difference rather than tipping every clip', () => {
    // Anatomical frames are geometric estimates good to roughly 20°. The Motifect pack
    // reported 10.6-24.3° across forty clips that all share ONE source rig — noise, not
    // convention. Under-correcting a rare genuinely-tilted asset beats tipping everything.
    const src = buildRig({ containerRot: axisAngle(0, 1, 0, 18) });
    const dst = buildRig();
    const res = retarget(src, dst, makeClip(src, 63, false));
    expect(res.warnings.join('\n')).not.toMatch(/world frames differ/);
  });
});

describe('world-space retarget — implausible frame measurements', () => {
  it('refuses a rotation that fits no axis convention', () => {
    // 73° is large but 17° from any quarter turn. In the real Motifect pack exactly one
    // clip of forty measured this, because that FBX's node transforms were saved
    // mid-pose — rotating it 90° would lay the character on its side.
    const src = buildRig({ containerRot: axisAngle(0.4, 1, 0.2, 73) });
    const dst = buildRig();
    const res = retarget(src, dst, makeClip(src, 67, false));
    expect(res.warnings.join('\n')).toMatch(/fits no axis convention — leaving the animation unrotated/);
    expect(res.warnings.join('\n')).not.toMatch(/rotating the animation/);
  });
});
