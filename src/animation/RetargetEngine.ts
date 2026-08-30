import * as THREE from 'three';
import {
  detectSkeletonProfile,
  buildRetargetNameMap,
  collectBoneNamesFromClips,
  suggestScaleFactor,
  normalizeBoneName,
  type SkeletonProfileMatch,
  type CanonicalBone,
} from './SkeletonProfile';

/**
 * RetargetEngine.ts — the heart of MIX Animation Retarget Pro.
 *
 * Two retargeting strategies, selected automatically:
 *
 *  1. WORLD-SPACE REST-POSE DELTA (used when both a source and a target skeleton
 *     are supplied). For each bone we compute the delta between the source rig's
 *     rest orientation and the target rig's rest orientation, and re-express every
 *     animated rotation through that delta. This is what lets a UE A-pose rig
 *     (Spine1/Chest/Neck1/Neck2, legs named Leg/Shin) drive a Mixamo T-pose rig
 *     without the character exploding or twisting.
 *
 *  2. RENAME + SCALE (fallback when no target skeleton object is provided) — the
 *     lightweight path used for same-rig GLB clips (Mixamo→Mixamo).
 *
 * ── The math, stated once ──────────────────────────────────────────────────
 *
 *   A_s(t) = source animated world rotation      B = bind world rotation
 *   C_s    = bind alignment, source→target       T_s = C_s · B_s,  T_t = B_t
 *   L      = alignQ, source-world → target-world (see anatomicalFrame)
 *
 *   R_t(t) = L · A_s(t) · M_axes,   M_axes = T_s⁻¹ · L⁻¹ · T_t
 *
 * Because quaternion multiplication is associative this is *identically* the
 * classic world-space delta retarget, `(L·A_s·T_s⁻¹·L⁻¹) · T_t` — "apply the
 * source's world-space change-from-reference to the target's reference". The
 * right-multiplied form only works because M_axes is constant in time.
 *
 * `M_axes = B_s⁻¹·B_t` alone is a pure axis-convention map ONLY when both rigs sit in
 * the same anatomical pose at bind. C_s is what makes that true: it rotates the source's
 * measured bind direction onto the target's, per bone, across the WHOLE skeleton. The
 * target is the reference, so there is no C_t. Correcting only the limbs — an earlier
 * design — left two reference poses inside one skeleton and measured 31.7° of shoulder
 * error against 1.9° at the arms.
 *
 * Sanity checks the code must keep satisfying:
 *   • Both rigs bound in the same pose (C_s = I, L = I) ⇒ R_t = D · B_t.
 *   • Source parked at its own A-pose bind (A_s = B_s)  ⇒ R_t = C_s⁻¹ B_t, so every
 *     target bone POINTS where the source's bone points: the target displays the
 *     source's A-pose, not its own T-pose.
 *   • Retargeting a rig onto itself is the identity. (See the round-trip test.)
 *   • Per-bone direction error against the real UE→Mixamo pack stays near zero.
 *     (See the fidelity test — it is the one that catches "close, but not quite".)
 */

const REFERENCE_HIPS_HEIGHT_M = 1.04;
const ROOT_HINTS = ['hips', 'pelvis', 'root', 'mixamorighips', 'mixamorig1hips'];

/**
 * World alignment only ever corrects an AXIS CONVENTION mismatch — a Z-up FBX, or a rig
 * authored facing -Z. Those are quarter turns about a cardinal axis.
 *
 * Anything smaller is bind-pose variation between two rigs (one rig's neck sits further
 * forward of its hips than the other's), which the per-bone T-pose correction already
 * handles and which the anatomical frame cannot measure to better than ~20° anyway. An
 * earlier 10° threshold let that noise through: the Motifect pack reported alignments of
 * 10.6°, 12.5°, 17.2°, 24.3° … across forty clips that all share ONE source rig, and every
 * one of those would have tipped the whole animation over by that much.
 */
const ALIGN_MIN_RAD = THREE.MathUtils.degToRad(45);

/** Plausible hip→ankle bind length for a humanoid authored in metres. */
const HUMANOID_LEG_M: readonly [number, number] = [0.2, 2.0];

/** Above this fraction of leg length, "drift" is a unit/space mismatch between the
 *  two rigs rather than a proportion difference, and IK is the wrong tool. */
const DRIFT_SANITY = 0.5;

const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _WORLD_FWD = new THREE.Vector3(0, 0, 1);
const IDENT = new THREE.Quaternion();

export interface SkeletonNode {
  name: string;
  /** Nearest NAMED ancestor — unnamed FBX axis-correction nodes are walked past. */
  parent: string | null;
  /** Rest LOCAL transform, consistent with `worldMatrix` below. */
  quat: THREE.Quaternion;
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  /** Rest WORLD rotation (normalized), including any unnamed intermediate nodes. */
  worldQuat: THREE.Quaternion;
  /** Rest WORLD matrix. */
  worldMatrix: THREE.Matrix4;
  /** The live Object3D — kept for callers that need scene identity. */
  object: THREE.Object3D;
}

/**
 * Extract a name→node graph (with rest transforms) from a loaded scene.
 *
 * Rest transforms come from `Skeleton.boneInverses` when the asset ships skinning
 * data: `boneInverses[i]` is the inverse of the bone's world matrix *at bind time*,
 * so inverting it recovers the true rest pose even when the file ships a posed
 * skeleton — which FBX very often does, and which would otherwise silently define
 * "rest" as whatever frame the artist last saved.
 */
export function extractSkeletonGraph(root: THREE.Object3D): Map<string, SkeletonNode> {
  root.updateMatrixWorld(true);

  const bindWorld = new Map<string, THREE.Matrix4>();
  root.traverse(o => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.skeleton) return;
    const bones = sm.skeleton.bones;
    const inverses = sm.skeleton.boneInverses;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      const inv = inverses[i];
      if (!b || !b.name || !inv || bindWorld.has(b.name)) continue;
      bindWorld.set(b.name, inv.clone().invert());
    }
  });

  const m = new Map<string, SkeletonNode>();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();

  root.traverse(o => {
    if (!o.name) return;
    // FBX scenes routinely reuse a name across a mesh and a bone. Let a real Bone
    // win; otherwise first-seen wins as before.
    const existing = m.get(o.name);
    if (existing) {
      const upgrading = (o as THREE.Bone).isBone && !(existing.object as THREE.Bone).isBone;
      if (!upgrading) return;
    }

    // Walk PAST unnamed ancestors. Treating a nameless node as "no parent" would
    // root the bone at the top of the hierarchy, breaking both the parent-before-
    // child ordering and the FK chain — the exact case FBX axis-correction nodes
    // create.
    let p: THREE.Object3D | null = o.parent;
    while (p && !p.name) p = p.parent;

    const worldMatrix = (bindWorld.get(o.name) ?? o.matrixWorld).clone();
    const worldQuat = new THREE.Quaternion();
    worldMatrix.decompose(_p, worldQuat, _s);
    worldQuat.normalize();

    // Derive the rest LOCAL from the rest WORLD so locals and worlds can never
    // disagree (mixing a bind-pose world with a posed local is a silent killer).
    const parentWorld = p ? (bindWorld.get(p.name) ?? p.matrixWorld) : null;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    if (parentWorld) {
      new THREE.Matrix4().copy(parentWorld).invert().multiply(worldMatrix).decompose(pos, quat, scale);
    } else {
      pos.copy(o.position); quat.copy(o.quaternion); scale.copy(o.scale);
    }

    m.set(o.name, {
      name: o.name,
      parent: p && p.name ? p.name : null,
      quat, pos, scale,
      worldQuat,
      worldMatrix,
      object: o,
    });
  });
  return m;
}

/**
 * FBXLoader can emit model names as an FBX property path, for example
 * `Hips|Hips|Take1|BaseLayer`. The first segment is the actual model/bone name.
 */
function trackBoneName(trackName: string): string {
  const dot = trackName.indexOf('.');
  const modelPath = dot >= 0 ? trackName.slice(0, dot) : trackName;
  return modelPath.split('|')[0].trim();
}

function trackProperty(trackName: string): string {
  const dot = trackName.indexOf('.');
  return dot >= 0 ? trackName.slice(dot + 1) : '';
}

export interface RetargetOptions {
  translationScale?: number;
  keepRootMotion?: boolean;
  preserveBoneTranslations?: boolean;
  rootBone?: string;
  sourceBoneNames?: string[];
  targetBoneNames?: string[];
  /** Source skeleton graph (from the loaded FBX/GLB scene). Enables world-space retargeting. */
  sourceSkeleton?: Map<string, SkeletonNode>;
  /** Target skeleton graph (from the character checkout). Enables world-space retargeting. */
  targetSkeleton?: Map<string, SkeletonNode>;
  /** Rotate the source's animation into the target's world frame when the two rigs
   *  are authored with different up/forward axes (Z-up FBX, character facing -Z).
   *  Default true; rotations under ALIGN_SNAP_RAD are ignored as measurement noise. */
  alignWorldFrames?: boolean;
  /** Auto T-pose alignment for A-pose→T-pose rigs. Default true. */
  autoTPose?: boolean;
  /**
   * Correct end-effector drift with foot-plant detection + two-bone leg IK.
   *
   * Default FALSE: it rewrites the leg and hips tracks, so it is opt-in rather than
   * something that silently changes a pipeline that already looks right. The engine
   * always MEASURES the drift and warns when it exceeds 2% of leg length, so you
   * find out when you need it. Turn it on for targets whose proportions differ
   * meaningfully from the source's.
   */
  footLock?: boolean | FootLockOptions;
  verbose?: boolean;
}

export interface RetargetResult {
  clips: THREE.AnimationClip[];
  sourceMatch: SkeletonProfileMatch;
  targetMatch: SkeletonProfileMatch;
  nameMap: Map<string, string>;
  translationScale: number;
  scales: number[];
  hasRootTrack: boolean[];
  warnings: string[];
  droppedTracks: string[];
}

// ─── Sampling helpers ──────────────────────────────────────────────────────
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

function sampleQuatRaw(times: ArrayLike<number>, values: ArrayLike<number>, t: number, out: THREE.Quaternion): void {
  const n = times.length;
  if (n === 0) { out.set(0, 0, 0, 1); return; }
  if (t <= times[0]) { out.fromArray(values as number[], 0); return; }
  if (t >= times[n - 1]) { out.fromArray(values as number[], (n - 1) * 4); return; }
  let i = 1;
  while (i < n && times[i] < t) i += 1;
  const t0 = times[i - 1];
  const t1 = times[i];
  const a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  _qa.fromArray(values as number[], (i - 1) * 4);
  _qb.fromArray(values as number[], i * 4);
  if (_qa.dot(_qb) < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w; }
  out.copy(_qa).slerp(_qb, a).normalize();
}

function sampleQuatAt(track: THREE.QuaternionKeyframeTrack, t: number, out: THREE.Quaternion): void {
  sampleQuatRaw(track.times, track.values, t, out);
}

function sampleVec3Raw(times: ArrayLike<number>, values: ArrayLike<number>, t: number, out: THREE.Vector3): void {
  const n = times.length;
  if (n === 0) { out.set(0, 0, 0); return; }
  if (t <= times[0]) { out.fromArray(values as number[], 0); return; }
  if (t >= times[n - 1]) { out.fromArray(values as number[], (n - 1) * 3); return; }
  let i = 1;
  while (i < n && times[i] < t) i += 1;
  const t0 = times[i - 1];
  const t1 = times[i];
  const a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  const i0 = (i - 1) * 3;
  const i1 = i * 3;
  out.set(
    values[i0] + (values[i1] - values[i0]) * a,
    values[i0 + 1] + (values[i1 + 1] - values[i0 + 1]) * a,
    values[i0 + 2] + (values[i1 + 2] - values[i0 + 2]) * a,
  );
}

/** Estimate a clip's translation scale from its hips position track median Y. */
function measureTranslationScale(clip: THREE.AnimationClip): number | null {
  for (const track of clip.tracks) {
    const bone = normalizeBoneName(trackBoneName(track.name));
    const prop = trackProperty(track.name);
    if (prop !== 'position') continue;
    if (!ROOT_HINTS.includes(bone)) continue;
    const v = (track as THREE.VectorKeyframeTrack).values;
    if (!v || v.length < 3) continue;
    const ys: number[] = [];
    for (let i = 1; i < v.length; i += 3) ys.push(v[i]);
    ys.sort((a, b) => a - b);
    const medianY = ys[Math.floor(ys.length / 2)];
    if (!Number.isFinite(medianY) || medianY < 0.15 || medianY > 1e6) continue;
    const scale = REFERENCE_HIPS_HEIGHT_M / medianY;
    if (!Number.isFinite(scale) || scale <= 1e-4 || scale > 100) continue;
    return scale;
  }
  return null;
}

// ─── Bind-pose geometry ────────────────────────────────────────────────────

function canonWorldPos(
  graph: Map<string, SkeletonNode>,
  match: SkeletonProfileMatch,
  canon: CanonicalBone,
): THREE.Vector3 | null {
  const raw = match.canonicalToSource.get(canon);
  const node = raw ? graph.get(raw) : undefined;
  if (!node) return null;
  const v = new THREE.Vector3().setFromMatrixPosition(node.worldMatrix);
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) ? v : null;
}

/**
 * Summed hip→knee→ankle bind length. Preferred over hips height as the translation
 * scale reference because it is independent of where the rig puts the floor, and
 * because stride length and hip height both scale with the leg, not with the torso.
 */
function legLength(graph: Map<string, SkeletonNode>, match: SkeletonProfileMatch): number | null {
  for (const side of ['Left', 'Right'] as const) {
    const hip = canonWorldPos(graph, match, `${side}UpLeg` as CanonicalBone);
    const knee = canonWorldPos(graph, match, `${side}Leg` as CanonicalBone);
    const ankle = canonWorldPos(graph, match, `${side}Foot` as CanonicalBone);
    if (!hip || !knee || !ankle) continue;
    const total = hip.distanceTo(knee) + knee.distanceTo(ankle);
    if (total > 1e-9) return total;
  }
  return null;
}

/**
 * Warn when a rig's bind pose is mirrored or non-uniformly scaled, which makes the
 * quaternion half of every `Matrix4.decompose` meaningless.
 */
function validateBindScale(
  graph: Map<string, SkeletonNode>,
  match: SkeletonProfileMatch,
  label: string,
  warnings: string[],
): void {
  const mirrored: string[] = [];
  const nonUniform: string[] = [];
  for (const raw of match.canonicalToSource.values()) {
    const node = graph.get(raw);
    if (!node) continue;
    if (node.worldMatrix.determinant() < 0) mirrored.push(raw);
    const { x, y, z } = node.scale;
    const max = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    const min = Math.min(Math.abs(x), Math.abs(y), Math.abs(z));
    if (max > 1e-9 && (max - min) / max > 0.01) nonUniform.push(raw);
  }
  if (mirrored.length > 0) {
    warnings.push(`[retarget] ${label}: ${mirrored.length} bone(s) have a MIRRORED bind pose (negative determinant, e.g. ${mirrored.slice(0, 3).join(', ')}) — their extracted rotations are unreliable. Re-export with mirroring baked into the geometry.`);
  }
  if (nonUniform.length > 0) {
    warnings.push(`[retarget] ${label}: ${nonUniform.length} bone(s) carry non-uniform bind scale (e.g. ${nonUniform.slice(0, 3).join(', ')}) — rotations may be skewed.`);
  }
}

function hipsHeight(graph: Map<string, SkeletonNode>, match: SkeletonProfileMatch): number | null {
  const p = canonWorldPos(graph, match, 'Hips');
  return p && Math.abs(p.y) > 1e-9 ? Math.abs(p.y) : null;
}

// ─── Auto T-pose alignment ─────────────────────────────────────────────────

interface AnatomicalFrame {
  up: THREE.Vector3;
  down: THREE.Vector3;
  left: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
  /** Rotation taking canonical axes (X=left, Y=up, Z=forward) into this rig's world. */
  basis: THREE.Quaternion;
}

/**
 * The CANONICAL child whose bind position defines each bone's direction, with
 * fallbacks for rigs that lack the preferred one (ayo has no middle finger, so a hand's
 * direction comes from its index instead).
 *
 * Using `object.children[0]` instead would make the measured direction depend on FBX
 * export ordering at every multi-child joint — a hip has three children, a chest three,
 * a hand five.
 *
 * This covers the WHOLE skeleton on purpose. An earlier version corrected only the eight
 * limb bones, which left two different reference poses inside one skeleton: limbs matched
 * the source 1:1 while every other bone kept its own bind orientation. Measured against
 * the real UE→Mixamo pack that showed up as arms accurate to 1.9° and shoulders out by
 * 31.7° — "close to 1:1, but not quite".
 */
const DIRECTION_CHILD: Partial<Record<CanonicalBone, readonly CanonicalBone[]>> = {
  Hips: ['Spine'], Spine: ['Spine1', 'Spine2', 'Neck'], Spine1: ['Spine2', 'Neck'],
  Spine2: ['Neck'], Neck: ['Head'],
  LeftShoulder: ['LeftArm'], LeftArm: ['LeftForeArm'], LeftForeArm: ['LeftHand'],
  LeftHand: ['LeftHandMiddle1', 'LeftHandIndex1', 'LeftHandRing1'],
  RightShoulder: ['RightArm'], RightArm: ['RightForeArm'], RightForeArm: ['RightHand'],
  RightHand: ['RightHandMiddle1', 'RightHandIndex1', 'RightHandRing1'],
  LeftUpLeg: ['LeftLeg'], LeftLeg: ['LeftFoot'], LeftFoot: ['LeftToeBase'],
  RightUpLeg: ['RightLeg'], RightLeg: ['RightFoot'], RightFoot: ['RightToeBase'],
  LeftHandThumb1: ['LeftHandThumb2'], LeftHandThumb2: ['LeftHandThumb3'],
  LeftHandIndex1: ['LeftHandIndex2'], LeftHandIndex2: ['LeftHandIndex3'],
  LeftHandMiddle1: ['LeftHandMiddle2'], LeftHandMiddle2: ['LeftHandMiddle3'],
  LeftHandRing1: ['LeftHandRing2'], LeftHandRing2: ['LeftHandRing3'],
  LeftHandPinky1: ['LeftHandPinky2'], LeftHandPinky2: ['LeftHandPinky3'],
  RightHandThumb1: ['RightHandThumb2'], RightHandThumb2: ['RightHandThumb3'],
  RightHandIndex1: ['RightHandIndex2'], RightHandIndex2: ['RightHandIndex3'],
  RightHandMiddle1: ['RightHandMiddle2'], RightHandMiddle2: ['RightHandMiddle3'],
  RightHandRing1: ['RightHandRing2'], RightHandRing2: ['RightHandRing3'],
  RightHandPinky1: ['RightHandPinky2'], RightHandPinky2: ['RightHandPinky3'],
};

/**
 * Build a right-handed orthonormal rotation whose X axis is `primary`, using `ref`
 * to pin the roll. Feeding the SAME `ref` on both rigs is what makes the T-pose
 * correction reproducible rather than arbitrary.
 */
/** How far a measurement may sit from an exact quarter turn about an exact cardinal
 *  axis and still be believed to BE one. */
const AXIS_FIT_RAD = THREE.MathUtils.degToRad(15);

/**
 * Round a rotation to the nearest quarter turn about the nearest cardinal axis, in place.
 * Returns false — leaving `q` as identity — when the measurement is not a convincing fit.
 *
 * The fit test matters as much as the snap. A real convention mismatch lands within a few
 * degrees of a quarter turn about one axis; the Motifect pack had a single clip out of
 * forty measuring 73.4°, which is 16.6° from any quarter turn and therefore is not an
 * axis mismatch at all — it is one FBX whose node transforms were saved mid-pose, so its
 * "rest" reads wrong. Rotating that one clip 90° would lay the character on its side.
 */
function snapToAxisConvention(q: THREE.Quaternion): boolean {
  q.normalize();
  // Work from the positive-w hemisphere so the axis sign is well defined.
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const angle = 2 * Math.acos(Math.min(1, q.w));
  const s = Math.sqrt(Math.max(1 - q.w * q.w, 0));
  if (s < 1e-6) { q.identity(); return false; }

  const axis = new THREE.Vector3(q.x / s, q.y / s, q.z / s);
  const ax = Math.abs(axis.x), ay = Math.abs(axis.y), az = Math.abs(axis.z);
  const cardinal = ax >= ay && ax >= az ? new THREE.Vector3(Math.sign(axis.x), 0, 0)
    : ay >= az ? new THREE.Vector3(0, Math.sign(axis.y), 0)
      : new THREE.Vector3(0, 0, Math.sign(axis.z));

  const quarter = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const angleFits = Math.abs(angle - quarter) <= AXIS_FIT_RAD;
  const axisFits = axis.dot(cardinal) >= Math.cos(AXIS_FIT_RAD);
  if (quarter < 1e-6 || !angleFits || !axisFits) { q.identity(); return false; }

  q.setFromAxisAngle(cardinal, quarter);
  return true;
}

function orthoFrame(primary: THREE.Vector3, frame: AnatomicalFrame): THREE.Quaternion {
  const x = primary.clone().normalize();
  // Try forward, then up, then left. A foot points almost exactly along `forward`, so a
  // single reference would leave that one bone's roll undefined. Both rigs walk the same
  // list in the same order, which is what keeps the convention shared between them.
  let y = new THREE.Vector3();
  for (const ref of [frame.forward, frame.up, frame.left]) {
    y.copy(ref).addScaledVector(x, -ref.dot(x));
    if (y.lengthSq() > 1e-6) break;
  }
  if (y.lengthSq() < 1e-8) {
    const alt = Math.abs(x.dot(_WORLD_UP)) < 0.9 ? _WORLD_UP : _WORLD_FWD;
    y = alt.clone().addScaledVector(x, -alt.dot(x));
  }
  y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * Measure a rig's up/left/forward from its bind pose (hips→neck and right→left arm).
 * Canonical lookups, not substring matching, so a Rigify or Daz rig resolves exactly
 * as well as Mixamo does.
 */
function anatomicalFrame(
  graph: Map<string, SkeletonNode>,
  match: SkeletonProfileMatch,
  label: string,
  warnings: string[],
): AnatomicalFrame {
  const up = new THREE.Vector3(0, 1, 0);
  const left = new THREE.Vector3(1, 0, 0);

  const hips = canonWorldPos(graph, match, 'Hips');
  const top = canonWorldPos(graph, match, 'Neck')
    ?? canonWorldPos(graph, match, 'Head')
    ?? canonWorldPos(graph, match, 'Spine2')
    ?? canonWorldPos(graph, match, 'Spine1')
    ?? canonWorldPos(graph, match, 'Spine');
  if (hips && top) {
    const v = new THREE.Vector3().subVectors(top, hips);
    if (v.lengthSq() > 1e-12) up.copy(v).normalize();
  }

  const la = canonWorldPos(graph, match, 'LeftArm') ?? canonWorldPos(graph, match, 'LeftShoulder');
  const ra = canonWorldPos(graph, match, 'RightArm') ?? canonWorldPos(graph, match, 'RightShoulder');
  if (la && ra) {
    const v = new THREE.Vector3().subVectors(la, ra);
    if (v.lengthSq() > 1e-12) left.copy(v).normalize();
  }

  const forward = new THREE.Vector3().crossVectors(left, up);
  if (forward.lengthSq() < 1e-8) {
    // up ∥ left: a bind pose that isn't upright, or shoulders that coincide.
    // Without this guard normalize() yields NaN and poisons every output quaternion.
    warnings.push(`[retarget] ${label}: degenerate anatomical frame (up ∥ left) — falling back to world axes.`);
    up.set(0, 1, 0); left.set(1, 0, 0); forward.set(0, 0, 1);
  } else {
    forward.normalize();
    up.crossVectors(forward, left).normalize();
    left.crossVectors(up, forward).normalize();
  }

  const basis = new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, forward))
    .normalize();

  return { up, down: up.clone().negate(), left, right: left.clone().negate(), forward, basis };
}

/**
 * World-space direction a bone points at bind, or null when it cannot be measured.
 */
function bindDirection(
  graph: Map<string, SkeletonNode>,
  match: SkeletonProfileMatch,
  canon: CanonicalBone,
  minBoneLength: number,
): THREE.Vector3 | null {
  const self = canonWorldPos(graph, match, canon);
  if (!self) return null;
  for (const kid of DIRECTION_CHILD[canon] ?? []) {
    const child = canonWorldPos(graph, match, kid);
    if (!child) continue;
    const dir = child.sub(self);
    // Length check BEFORE normalize. Afterwards lengthSq() is only ever 1 or 0, so a
    // near-zero bone (float noise, a zero-length helper) would sail through a
    // post-normalize guard while carrying a garbage direction.
    if (dir.length() < minBoneLength) continue;
    return dir.normalize();
  }
  return null;
}

/**
 * The rotation that brings the SOURCE's bind pose onto the TARGET's, for one bone.
 *
 * This is the correction `C_s` in the header's math, and it exists for exactly one
 * reason: `M_axes = B_s⁻¹·B_t` is a pure axis-convention map only when both rigs are in
 * the SAME anatomical pose at bind. When one is A-posed and the other T-posed it is not,
 * and the difference leaks into every frame.
 *
 * Note what this does NOT do: it never invents an "ideal" direction to force bones onto.
 * It rotates the source's measured bind direction onto the target's measured bind
 * direction, so a bone whose two rigs already agree gets an identity correction and is
 * left completely alone. That is what makes it safe to apply to the spine and fingers,
 * where an idealised direction would have destroyed real anatomy.
 *
 * Uses a FULL orthonormal frame rather than `Quaternion.setFromUnitVectors`: a direction
 * constrains only 2 of a quaternion's 3 DOF, so a shortest-arc correction leaves the roll
 * about the bone axis arbitrary, and that arbitrary roll gets baked permanently into
 * M_axes — which is what tips an elbow or knee into hinging sideways.
 */
function bindAlignment(
  srcGraph: Map<string, SkeletonNode>, srcMatch: SkeletonProfileMatch, srcFrame: AnatomicalFrame, srcMin: number,
  tgtGraph: Map<string, SkeletonNode>, tgtMatch: SkeletonProfileMatch, tgtFrame: AnatomicalFrame, tgtMin: number,
  canon: CanonicalBone | undefined,
): THREE.Quaternion {
  const ident = new THREE.Quaternion();
  if (!canon || !DIRECTION_CHILD[canon]) return ident;
  const ds = bindDirection(srcGraph, srcMatch, canon, srcMin);
  const dt = bindDirection(tgtGraph, tgtMatch, canon, tgtMin);
  if (!ds || !dt) return ident;
  // Each rig's roll reference comes from its OWN anatomical frame, so the convention is
  // "relative to this body", not "relative to the world".
  return orthoFrame(dt, tgtFrame).multiply(orthoFrame(ds, srcFrame).invert()).normalize();
}

export function retargetClips(
  clips: THREE.AnimationClip[],
  targetBoneNames: string[],
  options: RetargetOptions = {},
): RetargetResult {
  const srcBoneNames = options.sourceBoneNames ?? collectBoneNamesFromClips(clips);
  const srcMatch = detectSkeletonProfile(srcBoneNames);
  const dstMatch = detectSkeletonProfile(targetBoneNames);
  const nameMap = buildRetargetNameMap(srcMatch, dstMatch);
  const rootBone = options.rootBone ?? dstMatch.profile.rootBone ?? 'Hips';

  const warnings: string[] = [];
  const droppedTracks: string[] = [];
  const retargeted: THREE.AnimationClip[] = [];
  const scales: number[] = [];
  const hasRootTrack: boolean[] = [];

  if (srcMatch.missingRequired.length > 0) {
    warnings.push(`[retarget] source rig '${srcMatch.profile.id}' missing required bones: ${srcMatch.missingRequired.join(', ')}.`);
  }
  if (srcMatch.score < 0.15) {
    warnings.push(`[retarget] low source score ${srcMatch.score.toFixed(2)} for '${srcMatch.profile.id}'.`);
  }

  const useWorldSpace = !!(options.sourceSkeleton && options.targetSkeleton && options.sourceSkeleton.size > 0 && options.targetSkeleton.size > 0);

  // With both bind poses in hand the translation scale is a pure geometry ratio —
  // no per-clip guessing. The old median-animated-hips-height heuristic silently
  // produced a different (and wrong) scale for crouch, prone, sit and roll clips,
  // where the median hip height is nothing like the standing height.
  let bindScale: number | null = null;
  if (useWorldSpace) {
    const srcRef = legLength(options.sourceSkeleton!, srcMatch) ?? hipsHeight(options.sourceSkeleton!, srcMatch);
    const dstRef = legLength(options.targetSkeleton!, dstMatch) ?? hipsHeight(options.targetSkeleton!, dstMatch);
    if (srcRef && dstRef) {
      // The ratio converts SOURCE units into TARGET units — which is only the right
      // answer when the target rig is itself authored at the metre scale root motion
      // is emitted in. Some pipelines ship a character at an arbitrary node scale and
      // scale it up at runtime; there the per-clip metre heuristic is what downstream
      // expects, and the geometric ratio would be off by that node scale.
      const s = dstRef / srcRef;
      if (dstRef < HUMANOID_LEG_M[0] || dstRef > HUMANOID_LEG_M[1]) {
        warnings.push(`[retarget] target rig measures ${dstRef.toPrecision(3)} units hip→ankle, so it is not authored at metre scale — using the per-clip scale heuristic rather than the bind-pose ratio.`);
      } else if (Number.isFinite(s) && s > 1e-4 && s < 1e4) {
        bindScale = s;
      } else {
        warnings.push(`[retarget] implausible bind-pose scale ratio ${s} — falling back to per-clip measurement.`);
      }
    }
  }

  for (const clip of clips) {
    const measured = bindScale ?? measureTranslationScale(clip);
    const translationScale = options.translationScale ?? measured ?? suggestScaleFactor(srcMatch, dstMatch);
    scales.push(translationScale);

    if (useWorldSpace) {
      const r = retargetWorldSpace(clip, nameMap, srcMatch, dstMatch, rootBone, translationScale, options);
      retargeted.push(r.clip);
      hasRootTrack.push(r.hasRoot);
      droppedTracks.push(...r.dropped);
      warnings.push(...r.warnings);
    } else {
      const r = retargetRename(clip, nameMap, rootBone, translationScale, options);
      retargeted.push(r.clip);
      hasRootTrack.push(r.hasRoot);
      droppedTracks.push(...r.dropped);
    }
  }

  if (options.verbose && droppedTracks.length > 0) {
    for (const t of droppedTracks) console.warn('[retarget] dropped:', t);
  } else if (droppedTracks.length > 0 && retargeted.length > 0) {
    const shown = droppedTracks.slice(0, 8).join(', ');
    warnings.push(`[retarget] dropped ${droppedTracks.length} unmapped/non-root tracks (e.g. ${shown}).`);
  }

  return {
    clips: retargeted,
    sourceMatch: srcMatch,
    targetMatch: dstMatch,
    nameMap,
    translationScale: scales[0] ?? 1,
    scales,
    hasRootTrack,
    // Rig-level diagnostics are identical for every clip in a multi-clip call.
    warnings: [...new Set(warnings)],
    droppedTracks,
  };
}

// ─── World-space rest-pose retargeting ────────────────────────────────────

interface WsResult {
  clip: THREE.AnimationClip;
  hasRoot: boolean;
  dropped: string[];
  warnings: string[];
}

function retargetWorldSpace(
  clip: THREE.AnimationClip,
  nameMap: Map<string, string>,
  srcMatch: SkeletonProfileMatch,
  dstMatch: SkeletonProfileMatch,
  rootBone: string,
  translationScale: number,
  options: RetargetOptions,
): WsResult {
  const sourceGraph = options.sourceSkeleton!;
  const targetGraph = options.targetSkeleton!;
  const dropped: string[] = [];
  const warnings: string[] = [];
  const keepRoot = options.keepRootMotion ?? true;
  const autoTPose = options.autoTPose ?? true;
  const alignFrames = options.alignWorldFrames ?? true;

  // Index source rotation and position tracks by bone.
  const rotTracks = new Map<string, THREE.QuaternionKeyframeTrack>();
  const posTracks = new Map<string, THREE.VectorKeyframeTrack>();
  for (const t of clip.tracks) {
    const bone = trackBoneName(t.name);
    const prop = trackProperty(t.name);
    if (prop === 'quaternion') rotTracks.set(bone, t as THREE.QuaternionKeyframeTrack);
    else if (prop === 'position') posTracks.set(bone, t as THREE.VectorKeyframeTrack);
  }

  // ── Anatomical frames + world alignment ──
  const srcFrame = anatomicalFrame(sourceGraph, srcMatch, `source '${srcMatch.profile.id}'`, warnings);
  const tgtFrame = anatomicalFrame(targetGraph, dstMatch, `target '${dstMatch.profile.id}'`, warnings);

  // L: source world → target world. Right-multiplying by M_axes can only ever
  // remap the BONE frame; a source authored Z-up or facing -Z is a WORLD-side
  // mismatch and needs this left multiply, otherwise an arm swinging forward on
  // the source swings in a rotated direction on the target.
  const alignQ = tgtFrame.basis.clone().multiply(srcFrame.basis.clone().invert()).normalize();
  const alignAngle = 2 * Math.acos(Math.min(1, Math.abs(alignQ.w)));
  if (!alignFrames || alignAngle < ALIGN_MIN_RAD) {
    alignQ.identity();
  } else {
    // Snap to an exact quarter turn about an exact cardinal axis. The measured value
    // carries the same estimation noise as the threshold above, so applying it raw
    // would leave the rig a few degrees off true even in the case this is meant to fix.
    if (snapToAxisConvention(alignQ)) {
      const snapped = 2 * Math.acos(Math.min(1, Math.abs(alignQ.w)));
      warnings.push(`[retarget] source/target world frames differ by ${THREE.MathUtils.radToDeg(alignAngle).toFixed(1)}° — treating as an axis-convention mismatch and rotating the animation ${THREE.MathUtils.radToDeg(snapped).toFixed(0)}° into the target's frame.`);
    } else {
      warnings.push(`[retarget] source rig's anatomical frame is ${THREE.MathUtils.radToDeg(alignAngle).toFixed(1)}° off the target's, which fits no axis convention — leaving the animation unrotated. Usually means this file's node transforms were saved mid-pose rather than at bind.`);
    }
  }
  const alignInv = alignQ.clone().invert();

  // Scale-relative epsilon for "this bone is too short to give a direction".
  const srcSpan = legLength(sourceGraph, srcMatch) ?? hipsHeight(sourceGraph, srcMatch) ?? 1;
  const tgtSpan = legLength(targetGraph, dstMatch) ?? hipsHeight(targetGraph, dstMatch) ?? 1;

  // Every rotation here comes from decomposing a world matrix. That decomposition is
  // only meaningful for a similarity transform: a mirrored bind pose (a right side
  // authored with scale.x = -1, still common in older Maya/Max exports) or a sheared
  // one yields a quaternion that means nothing, and the failure is silent.
  validateBindScale(sourceGraph, srcMatch, `source '${srcMatch.profile.id}'`, warnings);
  validateBindScale(targetGraph, dstMatch, `target '${dstMatch.profile.id}'`, warnings);

  // ── Bind-pose alignment, cached per canonical bone ──
  // Keyed on the CANONICAL bone, not on a rig-specific name: the correction is a
  // property of the source/target PAIR, so there is nothing to collide.
  const alignCache = new Map<CanonicalBone, THREE.Quaternion>();
  const correctionFor = (srcBoneName: string): THREE.Quaternion => {
    const canon = srcMatch.sourceToCanonical.get(srcBoneName);
    if (!canon || !autoTPose) return IDENT;
    const hit = alignCache.get(canon);
    if (hit) return hit;
    const q = bindAlignment(
      sourceGraph, srcMatch, srcFrame, srcSpan * 1e-3,
      targetGraph, dstMatch, tgtFrame, tgtSpan * 1e-3,
      canon,
    );
    alignCache.set(canon, q);
    return q;
  };

  const boneWorldRest = (graph: Map<string, SkeletonNode>, name: string): THREE.Quaternion => {
    const node = graph.get(name);
    return node ? node.worldQuat.clone() : new THREE.Quaternion();
  };

  // ── Nearest mapped ancestor in the source hierarchy ──
  const mpCache = new Map<string, string | null>();
  const getMappedParent = (srcName: string): string | null => {
    if (mpCache.has(srcName)) return mpCache.get(srcName)!;
    let p = sourceGraph.get(srcName)?.parent ?? null;
    while (p) {
      if (nameMap.has(p) && targetGraph.has(nameMap.get(p)!) && sourceGraph.has(p)) { mpCache.set(srcName, p); return p; }
      p = sourceGraph.get(p)?.parent ?? null;
    }
    mpCache.set(srcName, null);
    return null;
  };

  // ── Topological sort: parents before children ──
  const mappedBones: string[] = [];
  for (const [srcName] of rotTracks) {
    const tgt = nameMap.get(srcName);
    if (tgt && targetGraph.has(tgt) && sourceGraph.has(srcName)) mappedBones.push(srcName);
    else dropped.push(srcName);
  }
  const mappedSet = new Set(mappedBones);
  const depthOf = new Map<string, number>();
  const getDepth = (n: string): number => {
    if (depthOf.has(n)) return depthOf.get(n)!;
    depthOf.set(n, 0); // cycle guard
    const mp = getMappedParent(n);
    const d = mp && mappedSet.has(mp) ? getDepth(mp) + 1 : 0;
    depthOf.set(n, d);
    return d;
  };
  for (const b of mappedBones) getDepth(b);
  mappedBones.sort((a, b) => getDepth(a) - getDepth(b));

  // ── Cached animated-world data for hierarchical FK ──
  const srcAnimStore = new Map<string, { times: ArrayLike<number>, vals: Float32Array }>();
  const tgtAnimStore = new Map<string, { times: ArrayLike<number>, vals: Float32Array }>();

  const getSrcAnimWorld = (srcName: string, t: number, out: THREE.Quaternion): void => {
    const d = srcAnimStore.get(srcName);
    if (d) { sampleQuatRaw(d.times, d.vals, t, out); return; }
    out.copy(boneWorldRest(sourceGraph, srcName));
  };
  const getTgtAnimWorld = (srcName: string, t: number, out: THREE.Quaternion): void => {
    const d = tgtAnimStore.get(srcName);
    if (d) { sampleQuatRaw(d.times, d.vals, t, out); return; }
    const tgtName = nameMap.get(srcName);
    out.copy(tgtName ? boneWorldRest(targetGraph, tgtName) : IDENT);
  };

  // ── Animated world rotation of the UNMAPPED ancestors above a top-level bone ──
  //
  // A UE clip puts turn-in-place yaw on the `root` bone, which has no counterpart
  // on a Mixamo target and so is never mapped. Treating its chain as fixed at rest
  // silently drops that yaw from every rotation — while the root-motion FK below
  // happily uses it for translation, leaving the character sliding along a curve it
  // never turns into. Composing the chain here folds the yaw into the target's hips
  // local rotation, which is where a Mixamo rig expects it.
  //
  // Reduces exactly to the rest world rotation when no ancestor is animated, so
  // rigs without a root bone are unaffected.
  const ancestorChains = new Map<string, { seed: THREE.Quaternion; chain: SkeletonNode[] } | null>();
  const ancestorChainFor = (srcName: string) => {
    if (ancestorChains.has(srcName)) return ancestorChains.get(srcName)!;
    const chain: SkeletonNode[] = [];
    for (let p = sourceGraph.get(srcName)?.parent ?? null; p; p = sourceGraph.get(p)?.parent ?? null) {
      const n = sourceGraph.get(p);
      if (!n) break;
      chain.unshift(n);
      if (chain.length > 64) break; // cycle guard
    }
    const entry = chain.length === 0 || !chain.some(n => rotTracks.has(n.name))
      ? null
      : { seed: chain[0].worldQuat.clone().multiply(chain[0].quat.clone().invert()), chain };
    ancestorChains.set(srcName, entry);
    return entry;
  };
  const _anc = new THREE.Quaternion();
  const srcAncestorAnimWorld = (srcName: string, t: number, out: THREE.Quaternion): boolean => {
    const entry = ancestorChainFor(srcName);
    if (!entry) return false;
    out.copy(entry.seed);
    for (const node of entry.chain) {
      const rt = rotTracks.get(node.name);
      if (rt) sampleQuatRaw(rt.times, rt.values, t, _anc); else _anc.copy(node.quat);
      out.multiply(_anc);
    }
    out.normalize();
    return true;
  };

  const outTracks: THREE.KeyframeTrack[] = [];
  // "has root motion" means a root TRANSLATION track was emitted — it feeds
  // AnimationPack.rootMotion, which decides whether physics drives the body.
  // Flagging it for the hips *rotation* track (as this path used to) made it true
  // for essentially every clip, including ones with keepRootMotion:false.
  let hasRoot = false;
  const foldedIntermediates: string[] = [];

  // ── Hierarchical FK retargeting ──────────────────────────────────────────
  //
  // Per-bone independent retargeting assumes every parent stays at rest. In
  // reality the Mixer plays all tracks at once, so each parent's retargeted
  // deviation propagates to children. The hierarchical pass walks parent → child:
  //
  //   1. srcAW  = srcParentAnimWorld(t) × between × srcLocal(t)   (true source FK)
  //   2. tgtAW  = L × srcAW × M_axes                              (see header math)
  //   3. tgtLoc = tgtEffectiveParentAnimWorld(t)⁻¹ × tgtAW        (back to local)
  //
  // Step 3 is not redundant work — three.js tracks are LOCAL quaternions, so the
  // desired world orientations have to be re-expressed against the already-
  // retargeted parent or the hierarchy fights itself.
  //
  // "between" captures unmapped intermediate nodes between the mapped parent and
  // this bone, from their REST transforms.
  for (const srcName of mappedBones) {
    const tgtName = nameMap.get(srcName)!;
    const srcNode = sourceGraph.get(srcName)!;
    const tgtNode = targetGraph.get(tgtName)!;
    const track = rotTracks.get(srcName)!;

    const srcRestQ = srcNode.worldQuat;
    const tgtRestQ = tgtNode.worldQuat;

    // C_s carries the whole pose difference; the target IS the reference, so C_t = I.
    const T_s = correctionFor(srcName).clone().multiply(srcRestQ).normalize();
    const T_t = tgtRestQ.clone();

    // M_axes = T_s⁻¹ · L⁻¹ · T_t   (paired with the left multiply by L below)
    const M_axes = T_s.clone().invert().multiply(alignInv).multiply(T_t).normalize();

    const mp = getMappedParent(srcName);
    const srcImmParent = srcNode.parent ? sourceGraph.get(srcNode.parent) : undefined;
    const tgtImmParent = tgtNode.parent ? targetGraph.get(tgtNode.parent) : undefined;
    const srcImmPRest = srcImmParent ? srcImmParent.worldQuat.clone() : new THREE.Quaternion();
    const tgtImmPRest = tgtImmParent ? tgtImmParent.worldQuat.clone() : new THREE.Quaternion();

    const srcBetween = new THREE.Quaternion();
    const tgtBetween = new THREE.Quaternion();
    // Nodes strictly between the mapped parent and this bone, ordered top-down.
    const spanNodes: SkeletonNode[] = [];
    if (mp) {
      srcBetween.copy(boneWorldRest(sourceGraph, mp)).invert().multiply(srcImmPRest).normalize();
      tgtBetween.copy(boneWorldRest(targetGraph, nameMap.get(mp)!)).invert().multiply(tgtImmPRest).normalize();

      for (let p = srcNode.parent; p && p !== mp; p = sourceGraph.get(p)?.parent ?? null) {
        const n = sourceGraph.get(p);
        if (!n) break;
        spanNodes.unshift(n);
        if (spanNodes.length > 64) break; // cycle guard
      }
    }
    // A rig with more links than the target — UE's Neck1/Neck2 against Mixamo's
    // single Neck, or spine_01..spine_05 against Spine/Spine1/Spine2 — animates
    // bones that never get mapped. Folding only their REST transform in drops that
    // motion outright: the head under-rotates by however much Neck2 turned. Walking
    // the span with its ANIMATED locals concentrates the lost link's rotation into
    // the next mapped bone, which is the best a rotation-only retarget can do.
    //
    // Π(rest locals over the span) is exactly srcBetween, so this reduces to the
    // constant when nothing in the span is animated.
    const spanAnimated = spanNodes.some(n => rotTracks.has(n.name));
    if (spanAnimated) for (const n of spanNodes) if (rotTracks.has(n.name) && !foldedIntermediates.includes(n.name)) foldedIntermediates.push(n.name);

    const times = track.times;
    const srcVals = track.values;
    const nFrames = times.length;
    const tgtLocalVals = new Float32Array(nFrames * 4);
    const srcWorldVals = new Float32Array(nFrames * 4);
    const tgtWorldVals = new Float32Array(nFrames * 4);

    const _srcLocal = new THREE.Quaternion();
    const _srcEffP = new THREE.Quaternion();
    const _srcAW = new THREE.Quaternion();
    const _tgtAW = new THREE.Quaternion();
    const _tgtEffP = new THREE.Quaternion();
    const _tgtL = new THREE.Quaternion();
    const _span = new THREE.Quaternion();

    for (let k = 0; k < nFrames; k++) {
      const t = times[k];
      _srcLocal.fromArray(srcVals, k * 4);

      if (mp) {
        getSrcAnimWorld(mp, t, _srcEffP);
        if (spanAnimated) {
          for (const n of spanNodes) {
            const rt = rotTracks.get(n.name);
            if (rt) sampleQuatRaw(rt.times, rt.values, t, _span); else _span.copy(n.quat);
            _srcEffP.multiply(_span);
          }
          _srcEffP.normalize();
        } else {
          _srcEffP.multiply(srcBetween);
        }
      }
      else if (!srcAncestorAnimWorld(srcName, t, _srcEffP)) { _srcEffP.copy(srcImmPRest); }

      _srcAW.copy(_srcEffP).multiply(_srcLocal).normalize();
      srcWorldVals[k * 4] = _srcAW.x; srcWorldVals[k * 4 + 1] = _srcAW.y;
      srcWorldVals[k * 4 + 2] = _srcAW.z; srcWorldVals[k * 4 + 3] = _srcAW.w;

      // tgtAW = L · srcAW · M_axes
      _tgtAW.copy(alignQ).multiply(_srcAW).multiply(M_axes).normalize();
      tgtWorldVals[k * 4] = _tgtAW.x; tgtWorldVals[k * 4 + 1] = _tgtAW.y;
      tgtWorldVals[k * 4 + 2] = _tgtAW.z; tgtWorldVals[k * 4 + 3] = _tgtAW.w;

      if (mp) { getTgtAnimWorld(mp, t, _tgtEffP); _tgtEffP.multiply(tgtBetween); }
      else    { _tgtEffP.copy(tgtImmPRest); }

      _tgtL.copy(_tgtEffP).invert().multiply(_tgtAW).normalize();
      tgtLocalVals[k * 4] = _tgtL.x; tgtLocalVals[k * 4 + 1] = _tgtL.y;
      tgtLocalVals[k * 4 + 2] = _tgtL.z; tgtLocalVals[k * 4 + 3] = _tgtL.w;
    }

    srcAnimStore.set(srcName, { times, vals: srcWorldVals });
    tgtAnimStore.set(srcName, { times, vals: tgtWorldVals });
    outTracks.push(new THREE.QuaternionKeyframeTrack(`${tgtName}.quaternion`, Array.from(times), tgtLocalVals));
  }

  if (foldedIntermediates.length > 0) {
    warnings.push(`[retarget] ${foldedIntermediates.length} animated bone(s) have no target counterpart; their rotation is folded into the next mapped bone rather than lost: ${foldedIntermediates.slice(0, 6).join(', ')}. The bend concentrates at one joint instead of spreading across the chain.`);
  }

  // ── Root motion ──────────────────────────────────────────────────────────
  if (keepRoot) {
    const rootTrack = buildRootMotionTrack(
      clip, sourceGraph, targetGraph, srcMatch, dstMatch, nameMap,
      rotTracks, posTracks, translationScale, alignQ, rootBone, warnings,
    );
    if (rootTrack) { outTracks.push(rootTrack); hasRoot = true; }
  } else {
    for (const [bone] of posTracks) {
      if (ROOT_HINTS.includes(normalizeBoneName(bone))) dropped.push(`${bone}.position [root-motion stripped]`);
    }
  }

  // ── End-effector correction ──────────────────────────────────────────────
  // Rotation-only retargeting cannot preserve contact: matching every bone's world
  // ORIENTATION says nothing about where a limb of a different length ends up.
  // Always measure the drift (it is the number that tells you whether you need this);
  // only correct it when asked, because the correction rewrites leg tracks.
  applyFootLock(
    outTracks, sourceGraph, targetGraph, srcMatch, dstMatch,
    rotTracks, posTracks, translationScale, alignQ,
    options.footLock ?? false, warnings,
  );

  if (outTracks.length === 0) {
    warnings.push(`[retarget] clip '${clip.name}' produced 0 tracks.`);
  }

  const out = new THREE.AnimationClip(clip.name, clip.duration, outTracks);
  (out as unknown as Record<string, unknown>).blendMode = (clip as unknown as Record<string, unknown>).blendMode;
  return { clip: out, hasRoot, dropped, warnings };
}

/**
 * Build the target hips position track by full forward kinematics from the scene
 * root, rather than by copying the source hips track.
 *
 * Two things this fixes that a direct copy cannot:
 *
 *  • UE root motion. A UE clip animates BOTH `root` (the world travel) and
 *    `pelvis` (the hip bob). Reading only the pelvis track throws away every step
 *    the character takes; reading only `root` throws away the bob. FK composes them.
 *
 *  • Space. The source track's values live in the source parent's LOCAL space. If
 *    the source FBX carries a Z-up→Y-up axis-correction node and the target does
 *    not, copying the numbers across turns "walk forward" into "walk upward". Going
 *    local → world → (align) → target-local is the only correct route.
 */
function buildRootMotionTrack(
  clip: THREE.AnimationClip,
  sourceGraph: Map<string, SkeletonNode>,
  targetGraph: Map<string, SkeletonNode>,
  srcMatch: SkeletonProfileMatch,
  dstMatch: SkeletonProfileMatch,
  nameMap: Map<string, string>,
  rotTracks: Map<string, THREE.QuaternionKeyframeTrack>,
  posTracks: Map<string, THREE.VectorKeyframeTrack>,
  translationScale: number,
  alignQ: THREE.Quaternion,
  rootBone: string,
  warnings: string[],
): THREE.VectorKeyframeTrack | null {
  const srcHipsName = srcMatch.canonicalToSource.get('Hips')
    ?? [...posTracks.keys()].find(b => ROOT_HINTS.includes(normalizeBoneName(b)));
  if (!srcHipsName || !sourceGraph.has(srcHipsName)) return null;

  const tgtHipsName = nameMap.get(srcHipsName) ?? dstMatch.canonicalToSource.get('Hips') ?? rootBone;
  const tgtHips = targetGraph.get(tgtHipsName);
  if (!tgtHips) return null;

  // Chain from the topmost named ancestor down to the hips.
  const chain: SkeletonNode[] = [];
  for (let n: SkeletonNode | undefined = sourceGraph.get(srcHipsName); n; n = n.parent ? sourceGraph.get(n.parent) : undefined) {
    chain.unshift(n);
    if (chain.length > 64) break; // cycle guard
  }
  if (chain.length === 0) return null;

  // Seed with whatever sits ABOVE the chain (unnamed axis nodes, scene transforms),
  // recovered as worldMatrix · localMatrix⁻¹ so rest FK reproduces worldMatrix exactly.
  const top = chain[0];
  const seed = new THREE.Matrix4().copy(top.worldMatrix)
    .multiply(new THREE.Matrix4().compose(top.pos, top.quat, top.scale).invert());

  const animated = chain.filter(n => rotTracks.has(n.name) || posTracks.has(n.name));
  if (animated.length === 0) return null;

  const timeSet = new Set<number>();
  for (const n of animated) {
    const pt = posTracks.get(n.name);
    const rt = rotTracks.get(n.name);
    if (pt) for (const t of pt.times) timeSet.add(t);
    if (rt) for (const t of rt.times) timeSet.add(t);
  }
  const times = [...timeSet].sort((a, b) => a - b);
  if (times.length === 0) return null;

  // Target hips parent world (rest) — the space the output track must live in.
  const tgtParent = tgtHips.parent ? targetGraph.get(tgtHips.parent) : undefined;
  const tgtParentWorld = tgtParent
    ? tgtParent.worldMatrix.clone()
    : new THREE.Matrix4().copy(tgtHips.worldMatrix)
        .multiply(new THREE.Matrix4().compose(tgtHips.pos, tgtHips.quat, tgtHips.scale).invert());
  const tgtParentWorldInv = tgtParentWorld.clone().invert();

  const srcRestWorldPos = new THREE.Vector3().setFromMatrixPosition(sourceGraph.get(srcHipsName)!.worldMatrix);
  const tgtRestWorldPos = new THREE.Vector3().setFromMatrixPosition(tgtHips.worldMatrix);

  const values = new Float32Array(times.length * 3);
  const m = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const world = new THREE.Vector3();

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    m.copy(seed);
    for (const node of chain) {
      const pt = posTracks.get(node.name);
      const rt = rotTracks.get(node.name);
      if (pt) sampleVec3Raw(pt.times, pt.values, t, p); else p.copy(node.pos);
      if (rt) sampleQuatRaw(rt.times, rt.values, t, q); else q.copy(node.quat);
      m.multiply(local.compose(p, q, node.scale));
    }
    world.setFromMatrixPosition(m).sub(srcRestWorldPos);      // source-world delta
    world.multiplyScalar(translationScale).applyQuaternion(alignQ); // → target world
    world.add(tgtRestWorldPos).applyMatrix4(tgtParentWorldInv);     // → target local

    if (!Number.isFinite(world.x) || !Number.isFinite(world.y) || !Number.isFinite(world.z)) {
      warnings.push(`[retarget] non-finite root motion at t=${t} in '${clip.name}' — root track skipped.`);
      return null;
    }
    values[i * 3] = world.x; values[i * 3 + 1] = world.y; values[i * 3 + 2] = world.z;
  }

  return new THREE.VectorKeyframeTrack(`${tgtHipsName}.position`, times, values);
}

// ─── Foot locking / end-effector correction ────────────────────────────────

interface RawTrack { times: ArrayLike<number>; values: ArrayLike<number>; }

/** Parents-before-children ordering over a skeleton graph. */
function topoOrder(graph: Map<string, SkeletonNode>): SkeletonNode[] {
  const depth = new Map<string, number>();
  const depthOf = (name: string): number => {
    const cached = depth.get(name);
    if (cached !== undefined) return cached;
    depth.set(name, 0); // cycle guard
    const p = graph.get(name)?.parent;
    const d = p && graph.has(p) ? depthOf(p) + 1 : 0;
    depth.set(name, d);
    return d;
  };
  return [...graph.values()].sort((a, b) => depthOf(a.name) - depthOf(b.name));
}

/**
 * Evaluate a skeleton's world matrices at time t, using animated locals where a
 * track exists and rest locals everywhere else. Reduces exactly to the rest pose
 * when no tracks are supplied.
 */
function evaluateGraph(
  order: SkeletonNode[],
  graph: Map<string, SkeletonNode>,
  rot: Map<string, RawTrack>,
  pos: Map<string, RawTrack>,
  t: number,
  out: Map<string, THREE.Matrix4>,
): void {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const local = new THREE.Matrix4();
  for (const node of order) {
    const pt = pos.get(node.name);
    const rt = rot.get(node.name);
    if (pt) sampleVec3Raw(pt.times, pt.values, t, p); else p.copy(node.pos);
    if (rt) sampleQuatRaw(rt.times, rt.values, t, q); else q.copy(node.quat);
    local.compose(p, q, node.scale);

    const parentM = node.parent ? out.get(node.parent) : undefined;
    const m = out.get(node.name) ?? new THREE.Matrix4();
    if (parentM) {
      m.multiplyMatrices(parentM, local);
    } else {
      // Seed with whatever sits above this node (unnamed axis nodes, scene
      // transforms), recovered so that the rest evaluation reproduces worldMatrix.
      m.copy(node.worldMatrix).multiply(
        new THREE.Matrix4().compose(node.pos, node.quat, node.scale).invert(),
      ).multiply(local);
    }
    out.set(node.name, m);
  }
}

/**
 * Analytic two-bone IK. Returns the new mid-joint position and the (possibly
 * distance-clamped) end position.
 *
 * The bend plane is taken from the joint's CURRENT orientation rather than from a
 * fixed pole vector, so the solve preserves whichever way the animation was already
 * bending the knee instead of snapping it to a canonical forward bend.
 */
function solveTwoBone(
  root: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, target: THREE.Vector3,
): { mid: THREE.Vector3; end: THREE.Vector3 } {
  const l1 = root.distanceTo(mid);
  const l2 = mid.distanceTo(end);
  const toTarget = new THREE.Vector3().subVectors(target, root);
  let d = toTarget.length();
  if (d < 1e-6 || l1 < 1e-6 || l2 < 1e-6) return { mid: mid.clone(), end: end.clone() };
  const dir = toTarget.divideScalar(d);

  // At or beyond full extension, place the joint on the straight line rather than
  // clamping the distance and solving. Near full extension the knee position is
  // wildly ill-conditioned — a 0.1mm distance clamp swings it by ~1cm — so forcing
  // a bend that isn't needed visibly kicks the knee on an already-straight leg.
  const reach = l1 + l2;
  if (d >= reach) {
    return { mid: root.clone().addScaledVector(dir, l1), end: root.clone().addScaledVector(dir, reach) };
  }
  d = Math.max(d, Math.abs(l1 - l2) + 1e-6);

  // Normal of the existing bend plane. Rotating `dir` about it by +angle moves
  // toward the current knee, which keeps the bend on the side it was already on.
  const axis = new THREE.Vector3().crossVectors(dir, new THREE.Vector3().subVectors(mid, root));
  if (axis.lengthSq() < 1e-10) {
    // Perfectly straight limb: any perpendicular will do.
    axis.crossVectors(dir, Math.abs(dir.y) < 0.9 ? _WORLD_UP : _WORLD_FWD);
    if (axis.lengthSq() < 1e-10) return { mid: mid.clone(), end: end.clone() };
  }
  axis.normalize();

  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const bent = dir.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, Math.acos(cosA)));
  return {
    mid: root.clone().addScaledVector(bent, l1),
    end: root.clone().addScaledVector(dir, d),
  };
}

export interface FootLockOptions {
  /** Ankle speed, as a fraction of leg length per second, below which the foot
   *  counts as planted. Default 0.35. */
  speedThreshold?: number;
  /** Ankle height above the clip's minimum, as a fraction of leg length, under
   *  which a plant is allowed. Default 0.12. */
  heightThreshold?: number;
  /** How far the hips may be pulled toward an unreachable foot, as a fraction of
   *  leg length. Default 0.3. */
  maxHipsShift?: number;
}

const LEG_CHAIN = [
  { hip: 'LeftUpLeg', knee: 'LeftLeg', ankle: 'LeftFoot' },
  { hip: 'RightUpLeg', knee: 'RightLeg', ankle: 'RightFoot' },
] as const;

/**
 * Measure — and optionally correct — end-effector drift.
 *
 * Matching every bone's world orientation is a complete description of a POSE, not
 * of a TRAJECTORY: a target with shorter legs traces a smaller circle with its foot
 * and slides. This pass maps the source's ankle path into target space, holds it
 * still across detected plants, pulls the hips toward any foot the target cannot
 * reach, then solves two-bone IK per leg and restores the original foot orientation.
 *
 * Mutates `outTracks` in place, replacing the leg and hips tracks.
 */
function applyFootLock(
  outTracks: THREE.KeyframeTrack[],
  sourceGraph: Map<string, SkeletonNode>,
  targetGraph: Map<string, SkeletonNode>,
  srcMatch: SkeletonProfileMatch,
  dstMatch: SkeletonProfileMatch,
  srcRot: Map<string, THREE.QuaternionKeyframeTrack>,
  srcPos: Map<string, THREE.VectorKeyframeTrack>,
  translationScale: number,
  alignQ: THREE.Quaternion,
  setting: boolean | FootLockOptions,
  warnings: string[],
): void {
  const enabled = setting !== false;
  const opts: FootLockOptions = typeof setting === 'object' ? setting : {};
  const speedThreshold = opts.speedThreshold ?? 0.35;
  const heightThreshold = opts.heightThreshold ?? 0.12;
  const maxHipsShift = opts.maxHipsShift ?? 0.3;

  // Resolve both leg chains on both rigs; bail cleanly if either rig is partial.
  const legs = LEG_CHAIN.map(l => {
    const s = { hip: srcMatch.canonicalToSource.get(l.hip), knee: srcMatch.canonicalToSource.get(l.knee), ankle: srcMatch.canonicalToSource.get(l.ankle) };
    const d = { hip: dstMatch.canonicalToSource.get(l.hip), knee: dstMatch.canonicalToSource.get(l.knee), ankle: dstMatch.canonicalToSource.get(l.ankle) };
    if (!s.hip || !s.knee || !s.ankle || !d.hip || !d.knee || !d.ankle) return null;
    if (!sourceGraph.has(s.ankle) || !targetGraph.has(d.ankle)) return null;
    // The analytic solve assumes a direct hip→knee→ankle chain.
    if (targetGraph.get(d.knee)!.parent !== d.hip || targetGraph.get(d.ankle)!.parent !== d.knee) return null;
    return { src: s as Record<string, string>, dst: d as Record<string, string> };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const srcHipsName = srcMatch.canonicalToSource.get('Hips');
  const tgtHipsName = dstMatch.canonicalToSource.get('Hips');
  if (legs.length === 0 || !srcHipsName || !tgtHipsName || !targetGraph.has(tgtHipsName)) {
    if (enabled) warnings.push('[retarget] footLock requested but the leg chains could not be resolved on both rigs — skipped.');
    return;
  }

  const tgtLegLen = legLength(targetGraph, dstMatch) ?? 1;

  // Time grid: every key the retargeted clip actually has.
  const timeSet = new Set<number>();
  for (const t of outTracks) for (const v of t.times) timeSet.add(v);
  const times = [...timeSet].sort((a, b) => a - b);
  if (times.length === 0) return;

  // Index the retargeted output so we can evaluate the target rig.
  const tgtRot = new Map<string, RawTrack>();
  const tgtPos = new Map<string, RawTrack>();
  for (const t of outTracks) {
    const bone = trackBoneName(t.name);
    const prop = trackProperty(t.name);
    if (prop === 'quaternion') tgtRot.set(bone, t);
    else if (prop === 'position') tgtPos.set(bone, t);
  }

  const srcOrder = topoOrder(sourceGraph);
  const tgtOrder = topoOrder(targetGraph);
  const srcWorld = new Map<string, THREE.Matrix4>();
  const tgtWorld = new Map<string, THREE.Matrix4>();

  const srcRotRaw = new Map<string, RawTrack>(srcRot);
  const srcPosRaw = new Map<string, RawTrack>(srcPos);

  // Desired ankle path, anchored so the source's BIND ankle maps to the target's
  // bind ankle — that is what makes ground contact land on the ground.
  const srcAnkleRest = legs.map(l => new THREE.Vector3().setFromMatrixPosition(sourceGraph.get(l.src.ankle)!.worldMatrix));
  const tgtAnkleRest = legs.map(l => new THREE.Vector3().setFromMatrixPosition(targetGraph.get(l.dst.ankle)!.worldMatrix));

  const desired: THREE.Vector3[][] = legs.map(() => []);
  const actual: THREE.Vector3[][] = legs.map(() => []);
  const tgtHipsPath: THREE.Vector3[] = [];

  for (let i = 0; i < times.length; i++) {
    evaluateGraph(srcOrder, sourceGraph, srcRotRaw, srcPosRaw, times[i], srcWorld);
    evaluateGraph(tgtOrder, targetGraph, tgtRot, tgtPos, times[i], tgtWorld);
    tgtHipsPath.push(new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(tgtHipsName)!));
    for (let g = 0; g < legs.length; g++) {
      const s = new THREE.Vector3().setFromMatrixPosition(srcWorld.get(legs[g].src.ankle)!);
      desired[g].push(s.sub(srcAnkleRest[g]).multiplyScalar(translationScale).applyQuaternion(alignQ).add(tgtAnkleRest[g]));
      actual[g].push(new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(legs[g].dst.ankle)!));
    }
  }

  let maxDrift = 0;
  for (let g = 0; g < legs.length; g++) {
    for (let i = 0; i < times.length; i++) maxDrift = Math.max(maxDrift, desired[g][i].distanceTo(actual[g][i]));
  }
  const driftFrac = maxDrift / tgtLegLen;

  // Drift larger than half a leg is not a proportion mismatch — the two rigs are
  // being measured in different spaces (a character authored at an arbitrary node
  // scale against clips emitted in metres, say). IK would dutifully drag the feet
  // to coordinates that mean nothing, so refuse rather than "correct" it.
  if (driftFrac > DRIFT_SANITY) {
    warnings.push(`[retarget] ankle paths differ by ${driftFrac.toFixed(1)}× the target's leg length — the rigs are not in a common scale, so footLock is skipped. Check that the character and its clips share a unit system.`);
    return;
  }

  if (!enabled) {
    if (driftFrac > 0.02) {
      warnings.push(`[retarget] feet drift up to ${(driftFrac * 100).toFixed(0)}% of leg length from the source's path — pass footLock:true to correct it.`);
    }
    return;
  }

  // ── Plant detection, on the SOURCE path (the authored intent) ──
  let minY = Infinity;
  for (const path of desired) for (const p of path) minY = Math.min(minY, p.y);
  const speedLimit = speedThreshold * tgtLegLen;
  const heightLimit = heightThreshold * tgtLegLen;

  for (let g = 0; g < legs.length; g++) {
    const path = desired[g];
    const planted: boolean[] = path.map((p, i) => {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const dt = times[Math.min(times.length - 1, i + 1)] - times[Math.max(0, i - 1)];
      const speed = dt > 1e-6 ? prev.distanceTo(next) / dt : 0;
      return speed < speedLimit && (p.y - minY) < heightLimit;
    });
    // Freeze each plant interval at its median position — this is what actually
    // removes the slide, including any jitter already present in the source.
    for (let i = 0; i < planted.length;) {
      if (!planted[i]) { i++; continue; }
      let j = i;
      while (j + 1 < planted.length && planted[j + 1]) j++;
      const lock = path[Math.floor((i + j) / 2)].clone();
      for (let k = i; k <= j; k++) path[k].copy(lock);
      i = j + 1;
    }
  }

  // ── Solve ──
  const tgtHips = targetGraph.get(tgtHipsName)!;
  const tgtHipsParent = tgtHips.parent ? targetGraph.get(tgtHips.parent) : undefined;
  const tgtHipsParentWorld = tgtHipsParent
    ? tgtHipsParent.worldMatrix.clone()
    : new THREE.Matrix4().copy(tgtHips.worldMatrix)
        .multiply(new THREE.Matrix4().compose(tgtHips.pos, tgtHips.quat, tgtHips.scale).invert());
  const tgtHipsParentInv = tgtHipsParentWorld.clone().invert();

  const hipsOut = new Float32Array(times.length * 3);
  const legOut = legs.map(() => ({
    hip: new Float32Array(times.length * 4),
    knee: new Float32Array(times.length * 4),
    ankle: new Float32Array(times.length * 4),
  }));

  const wq = new THREE.Quaternion();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();

  for (let i = 0; i < times.length; i++) {
    evaluateGraph(tgtOrder, targetGraph, tgtRot, tgtPos, times[i], tgtWorld);

    const hipsPos = new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(tgtHipsName)!);

    // Pull the hips toward whichever foot is furthest out of reach. Without this a
    // short-legged target either does the splits or floats off its contact.
    let shift = new THREE.Vector3();
    let worst = 0;
    for (let g = 0; g < legs.length; g++) {
      const hip = new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(legs[g].dst.hip)!);
      const knee = new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(legs[g].dst.knee)!);
      const ankle = new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(legs[g].dst.ankle)!);
      const reach = hip.distanceTo(knee) + knee.distanceTo(ankle);
      // No epsilon here. Shaving even 0.1mm off `reach` makes an already-straight
      // leg read as out of reach, so the hips shift toward the foot by that much —
      // which then forces the solve to bend a knee that should stay locked. Near
      // full extension the knee is ill-conditioned enough that a 0.1mm shift kicks
      // it by ~7mm.
      const need = hip.distanceTo(desired[g][i]) - reach;
      if (need > worst) {
        worst = need;
        shift = new THREE.Vector3().subVectors(desired[g][i], hip).normalize().multiplyScalar(
          Math.min(need, maxHipsShift * tgtLegLen),
        );
      }
    }
    hipsPos.add(shift);
    tmpP.copy(hipsPos).applyMatrix4(tgtHipsParentInv);
    hipsOut[i * 3] = tmpP.x; hipsOut[i * 3 + 1] = tmpP.y; hipsOut[i * 3 + 2] = tmpP.z;

    for (let g = 0; g < legs.length; g++) {
      const { hip: hipN, knee: kneeN, ankle: ankleN } = legs[g].dst;
      const hipM = tgtWorld.get(hipN)!;
      const hip = new THREE.Vector3().setFromMatrixPosition(hipM).add(shift);
      const knee = new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(kneeN)!).add(shift);
      const ankle = new THREE.Vector3().setFromMatrixPosition(tgtWorld.get(ankleN)!).add(shift);

      const hipQ = new THREE.Quaternion(); hipM.decompose(tmpP, hipQ, tmpS);
      const kneeQ = new THREE.Quaternion(); tgtWorld.get(kneeN)!.decompose(tmpP, kneeQ, tmpS);
      const ankleQ = new THREE.Quaternion(); tgtWorld.get(ankleN)!.decompose(tmpP, ankleQ, tmpS);

      const sol = solveTwoBone(hip, knee, ankle, desired[g][i]);

      // Shortest-arc IS correct here — unlike the T-pose correction, we want to
      // swing each bone onto its new direction and add no roll of our own.
      const swingUpper = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3().subVectors(knee, hip).normalize(),
        new THREE.Vector3().subVectors(sol.mid, hip).normalize(),
      );
      const upperWorld = swingUpper.multiply(hipQ).normalize();
      const swingLower = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3().subVectors(ankle, knee).normalize(),
        new THREE.Vector3().subVectors(sol.end, sol.mid).normalize(),
      );
      const lowerWorld = swingLower.multiply(kneeQ).normalize();

      // Hips rotation is untouched, so the upper leg's parent world rotation is
      // whatever the retarget already produced.
      const hipParentName = targetGraph.get(hipN)!.parent;
      const parentQ = new THREE.Quaternion();
      if (hipParentName && tgtWorld.has(hipParentName)) tgtWorld.get(hipParentName)!.decompose(tmpP, parentQ, tmpS);

      wq.copy(parentQ).invert().multiply(upperWorld).normalize();
      legOut[g].hip.set([wq.x, wq.y, wq.z, wq.w], i * 4);
      wq.copy(upperWorld).invert().multiply(lowerWorld).normalize();
      legOut[g].knee.set([wq.x, wq.y, wq.z, wq.w], i * 4);
      // Preserve the foot's world orientation so IK never tilts the sole.
      wq.copy(lowerWorld).invert().multiply(ankleQ).normalize();
      legOut[g].ankle.set([wq.x, wq.y, wq.z, wq.w], i * 4);
    }
  }

  const replace = (name: string, track: THREE.KeyframeTrack) => {
    const at = outTracks.findIndex(t => t.name === name);
    if (at >= 0) outTracks[at] = track; else outTracks.push(track);
  };
  if (tgtPos.has(tgtHipsName)) {
    replace(`${tgtHipsName}.position`, new THREE.VectorKeyframeTrack(`${tgtHipsName}.position`, times, hipsOut));
  }
  for (let g = 0; g < legs.length; g++) {
    const { hip, knee, ankle } = legs[g].dst;
    replace(`${hip}.quaternion`, new THREE.QuaternionKeyframeTrack(`${hip}.quaternion`, times, legOut[g].hip));
    replace(`${knee}.quaternion`, new THREE.QuaternionKeyframeTrack(`${knee}.quaternion`, times, legOut[g].knee));
    replace(`${ankle}.quaternion`, new THREE.QuaternionKeyframeTrack(`${ankle}.quaternion`, times, legOut[g].ankle));
  }
  warnings.push(`[retarget] footLock applied — corrected up to ${(driftFrac * 100).toFixed(0)}% of leg length in ankle drift.`);
}

// ─── Rename + scale (lightweight fallback) ─────────────────────────────────

function retargetRename(
  clip: THREE.AnimationClip,
  nameMap: Map<string, string>,
  rootBone: string,
  translationScale: number,
  options: RetargetOptions,
): { clip: THREE.AnimationClip; hasRoot: boolean; dropped: string[] } {
  const keepRoot = options.keepRootMotion ?? true;
  const dropped: string[] = [];
  const outTracks: THREE.KeyframeTrack[] = [];
  let keptRoot = false;

  for (const track of clip.tracks) {
    const srcBone = trackBoneName(track.name);
    const property = trackProperty(track.name);
    const dstBone = nameMap.get(srcBone);
    if (!dstBone) { dropped.push(track.name); continue; }

    const isRootPos = (dstBone === rootBone || dstBone.endsWith(rootBone)) && property === 'position';
    if (isRootPos && !keepRoot) { dropped.push(`${track.name} [root-motion stripped]`); continue; }
    if (!isRootPos && (property === 'position' || property === 'scale') && !options.preserveBoneTranslations) {
      dropped.push(`${track.name} [non-root transform stripped]`);
      continue;
    }

    const cloned = (track as unknown as { clone?: () => THREE.KeyframeTrack }).clone?.() ?? cloneTrackFallback(track);
    (cloned as unknown as { name: string }).name = `${dstBone}.${property}`;
    if (property === 'position' && translationScale !== 1) {
      const v = (cloned as THREE.VectorKeyframeTrack).values;
      if (v) for (let i = 0; i < v.length; i++) v[i] *= translationScale;
    }
    if (isRootPos) keptRoot = true;
    outTracks.push(cloned);
  }

  const out = new THREE.AnimationClip(clip.name, clip.duration, outTracks);
  (out as unknown as Record<string, unknown>).blendMode = (clip as unknown as Record<string, unknown>).blendMode;
  return { clip: out, hasRoot: keptRoot, dropped };
}

function cloneTrackFallback(track: THREE.KeyframeTrack): THREE.KeyframeTrack {
  const times = (track as unknown as { times: Float32Array }).times;
  const values = (track as unknown as { values: Float32Array }).values;
  return new (track as unknown as { constructor: new (n: string, t: Float32Array, v: Float32Array) => THREE.KeyframeTrack }).constructor(track.name, times.slice(), values.slice());
}

export function retargetSingleClip(
  clip: THREE.AnimationClip,
  targetBoneNames: string[],
  options: RetargetOptions = {},
): RetargetResult {
  return retargetClips([clip], targetBoneNames, options);
}

export function extractRootTrack(clip: THREE.AnimationClip, rootBone = 'Hips'): THREE.VectorKeyframeTrack | null {
  for (const t of clip.tracks) {
    const bone = trackBoneName(t.name);
    if ((bone === rootBone || bone.endsWith(rootBone)) && trackProperty(t.name) === 'position') {
      return t as THREE.VectorKeyframeTrack;
    }
  }
  return null;
}

export function collectTargetBoneNames(characterRoot: THREE.Object3D): string[] {
  const out: string[] = [];
  let foundSkeleton = false;
  characterRoot.traverse(o => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      foundSkeleton = true;
      for (const b of sm.skeleton.bones) if (b.name) out.push(b.name);
    }
  });
  if (!foundSkeleton) {
    characterRoot.traverse(o => { if (o.name) out.push(o.name); });
  }
  return [...new Set(out)];
}

/** Exported for tests: the sampling primitives and the bind-alignment math. */
export const __internals = { sampleQuatAt, sampleQuatRaw, sampleVec3Raw, orthoFrame, anatomicalFrame, bindDirection, bindAlignment, legLength };
