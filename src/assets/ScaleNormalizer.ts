import * as THREE from 'three';
import type { AssetType } from '../animation/AssetManifest';

/**
 * ScaleNormalizer.ts — make every model in the world agree about how big a metre is.
 *
 * Assets arrive from wildly different pipelines and none of them agree on units. Measured
 * across this project's own library: the Mixamo characters export at ~1/160 scale (11mm
 * tall), one enemy at 1/190, two others at roughly correct metres, and four katanas at
 * 4.9, 15.2, 62.1 and 111.3 units long. Fixing that by hand-tuning a scale number per
 * spawn is how a world ends up with a 60-metre sword leaning against a 2-metre house.
 *
 * So: every asset belongs to a SIZE CLASS with a real-world dimension band, and the engine
 * scales it into that band on spawn.
 *
 * Two rules do the work:
 *
 *   1. A model already inside its band is LEFT ALONE. Authored variation is intentional —
 *      a 5'7" character should stay 5'7" — and normalising it away would flatten a cast of
 *      characters into identical clones.
 *   2. A model outside its band is scaled to the class NOMINAL. Out there we have no
 *      signal about intent (a 0.011-unit character is not "very short", it is broken),
 *      so the nominal is the only honest answer.
 *
 * `targetSize` on the asset entry overrides both — that is the "this is final" escape
 * hatch, used for the character roster below.
 *
 * Never guesses. A class it cannot infer returns null and the model is left untouched,
 * because silently resizing a building that might be a bungalow or a tower block is worse
 * than leaving it alone.
 */

/** Which dimension of the bounding box defines "how big" a thing is. */
export type Governing =
  /** Y extent. Characters, buildings, lamp posts — anything whose size reads as height. */
  | 'height'
  /** Largest of X/Y/Z. Props and weapons, whose authored orientation is unpredictable:
   *  of this project's four swords one runs along Z and another along X. */
  | 'longest'
  /** Larger of X/Z. Vehicles and furniture, which are defined by their plan footprint and
   *  may face down either horizontal axis. Height would rank an SUV above a limousine. */
  | 'footprint';

export interface SizeSpec {
  governing: Governing;
  /** Metres. Inside [min, max] a model is left at its authored size. */
  min: number;
  nominal: number;
  max: number;
  label: string;
}

export type SizeClass = keyof typeof SIZE_CLASSES;

/**
 * Real-world dimension bands, in metres.
 *
 * Storey heights assume ~3.0-3.5 m floor-to-floor plus roof, so a single-storey house
 * measures 3-5 m at the ridge rather than the 3 m people expect from the floor count.
 */
export const SIZE_CLASSES = {
  // ── People ──
  character:        { governing: 'height',    min: 1.676, nominal: 1.778, max: 1.880, label: "adult 5'6\"-6'2\"" },
  character_child:  { governing: 'height',    min: 1.00,  nominal: 1.30,  max: 1.55,  label: 'child' },
  character_large:  { governing: 'height',    min: 1.90,  nominal: 2.30,  max: 3.20,  label: 'large humanoid / boss' },

  // ── Buildings ──
  house_1story:     { governing: 'height',    min: 3.0,   nominal: 4.2,   max: 5.5,   label: 'single-storey house' },
  house_2story:     { governing: 'height',    min: 5.5,   nominal: 7.5,   max: 9.5,   label: 'two-storey house' },
  house_3story:     { governing: 'height',    min: 9.5,   nominal: 11.5,  max: 14.0,  label: 'three-storey house' },
  commercial_low:   { governing: 'height',    min: 4.0,   nominal: 7.0,   max: 12.0,  label: 'shop / strip mall / warehouse' },
  commercial_mid:   { governing: 'height',    min: 12.0,  nominal: 25.0,  max: 45.0,  label: 'mid-rise office (4-12 storeys)' },
  highrise:         { governing: 'height',    min: 45.0,  nominal: 90.0,  max: 180.0, label: 'downtown high-rise' },
  skyscraper:       { governing: 'height',    min: 180.0, nominal: 300.0, max: 830.0, label: 'skyscraper' },

  // ── Vehicles ──
  car:              { governing: 'footprint', min: 3.8,   nominal: 4.6,   max: 5.4,   label: 'car' },
  van:              { governing: 'footprint', min: 4.6,   nominal: 5.4,   max: 6.5,   label: 'van' },
  truck:            { governing: 'footprint', min: 5.5,   nominal: 8.0,   max: 16.0,  label: 'truck' },
  bus:              { governing: 'footprint', min: 9.0,   nominal: 12.2,  max: 18.0,  label: 'bus' },
  motorcycle:       { governing: 'footprint', min: 1.8,   nominal: 2.15,  max: 2.6,   label: 'motorcycle' },
  bicycle:          { governing: 'footprint', min: 1.5,   nominal: 1.75,  max: 2.0,   label: 'bicycle' },

  // ── Street furniture ──
  streetlamp:       { governing: 'height',    min: 4.0,   nominal: 6.5,   max: 12.0,  label: 'street lamp' },
  traffic_light:    { governing: 'height',    min: 3.0,   nominal: 4.5,   max: 7.0,   label: 'traffic light' },
  bench:            { governing: 'footprint', min: 1.2,   nominal: 1.7,   max: 2.2,   label: 'bench' },
  trashcan:         { governing: 'height',    min: 0.6,   nominal: 1.0,   max: 1.4,   label: 'trash can' },
  mailbox:          { governing: 'height',    min: 0.9,   nominal: 1.3,   max: 1.7,   label: 'mailbox' },
  vending_machine:  { governing: 'height',    min: 1.6,   nominal: 1.9,   max: 2.2,   label: 'vending machine' },
  fountain:         { governing: 'footprint', min: 1.5,   nominal: 3.0,   max: 8.0,   label: 'fountain' },
  planter:          { governing: 'footprint', min: 0.4,   nominal: 1.0,   max: 2.5,   label: 'planter' },
  gate:             { governing: 'height',    min: 1.0,   nominal: 1.8,   max: 3.0,   label: 'gate' },
  door:             { governing: 'height',    min: 1.98,  nominal: 2.03,  max: 2.4,   label: 'door' },

  // ── Nature ──
  tree:             { governing: 'height',    min: 2.5,   nominal: 8.0,   max: 30.0,  label: 'tree' },
  bush:             { governing: 'height',    min: 0.3,   nominal: 1.0,   max: 2.5,   label: 'bush' },
  rock:             { governing: 'longest',   min: 0.2,   nominal: 1.0,   max: 6.0,   label: 'rock' },

  // ── Weapons ──
  weapon_sword:     { governing: 'longest',   min: 0.7,   nominal: 1.05,  max: 1.6,   label: 'sword' },
  weapon_knife:     { governing: 'longest',   min: 0.15,  nominal: 0.28,  max: 0.45,  label: 'knife' },
  weapon_rifle:     { governing: 'longest',   min: 0.7,   nominal: 0.95,  max: 1.3,   label: 'rifle' },
  weapon_pistol:    { governing: 'longest',   min: 0.15,  nominal: 0.22,  max: 0.35,  label: 'pistol' },
  weapon_staff:     { governing: 'longest',   min: 1.2,   nominal: 1.8,   max: 2.4,   label: 'staff' },

  // ── Loose props ──
  prop_small:       { governing: 'longest',   min: 0.05,  nominal: 0.4,   max: 1.5,   label: 'small prop' },
  prop_medium:      { governing: 'longest',   min: 0.5,   nominal: 1.5,   max: 3.0,   label: 'medium prop' },
} as const satisfies Record<string, SizeSpec>;

/**
 * Tag → size class, checked in order, first match wins.
 *
 * Order matters where tag sets overlap: `katana` carries both 'katana' and 'sword', and
 * 'motorcycle' assets usually also carry 'vehicle', so the specific entries come first
 * and the broad ones ('vehicle', 'building') last.
 */
const TAG_RULES: ReadonlyArray<readonly [SizeClass, readonly string[]]> = [
  // Weapons before the generic prop rules — a katana is tagged 'prop' on some imports.
  ['weapon_sword', ['sword', 'katana', 'blade', 'greatsword']],
  ['weapon_knife', ['knife', 'dagger', 'shiv']],
  ['weapon_rifle', ['rifle', 'shotgun', 'smg', 'ar15']],
  ['weapon_pistol', ['pistol', 'handgun', 'revolver', 'glock']],
  ['weapon_staff', ['staff', 'spear', 'polearm']],

  // Specific vehicles before 'vehicle'.
  ['motorcycle', ['motorcycle', 'motorbike', 'bike']],
  ['bicycle', ['bicycle', 'cycle']],
  ['bus', ['bus', 'coach']],
  ['truck', ['truck', 'lorry', 'semi']],
  ['van', ['van', 'minivan']],
  ['car', ['car', 'sedan', 'automobile', 'coupe', 'hatchback', 'suv', 'vehicle']],

  // Loose debris FIRST. Scattered litter carries a 'trash' tag just like a trash can
  // does, and this project has 91 debris props that would otherwise each be inflated
  // into a 1-metre bin. 'trash' alone is therefore not enough to mean "receptacle".
  ['prop_small', ['debris', 'litter', 'rubble']],

  // Street furniture before the generic prop rules.
  ['streetlamp', ['streetlamp', 'lamppost', 'lamp']],
  ['traffic_light', ['trafficlight', 'stoplight', 'signal']],
  ['vending_machine', ['vending']],
  ['mailbox', ['mailbox', 'postbox']],
  ['trashcan', ['trashcan', 'garbage', 'bin', 'dumpster', 'wastebin']],
  ['bench', ['bench', 'seating']],
  ['fountain', ['fountain']],
  ['planter', ['planter']],
  ['gate', ['gate']],
  ['door', ['door', 'doorway']],

  ['tree', ['tree']],
  ['bush', ['bush', 'shrub', 'hedge']],
  ['rock', ['rock', 'boulder', 'stone']],

  // Buildings: only ever from an explicit storey/kind tag. See classifyAsset.
  ['skyscraper', ['skyscraper', 'tower']],
  ['highrise', ['highrise', 'high-rise', 'downtown']],
  ['commercial_mid', ['midrise', 'office']],
  ['commercial_low', ['shop', 'store', 'stripmall', 'warehouse', 'commercial', 'retail']],
  ['house_3story', ['3story', 'threestory', 'townhouse']],
  ['house_2story', ['2story', 'twostory']],
  ['house_1story', ['1story', 'onestory', 'bungalow', 'ranch']],

  ['character_child', ['child', 'kid']],
  ['character_large', ['boss', 'ogre', 'giant']],
  ['character', ['character', 'enemy', 'npc', 'humanoid', 'person']],

];

export interface ClassifyInput {
  type: AssetType;
  tags: readonly string[];
  /** Explicit override from the asset entry — always wins. */
  sizeClass?: SizeClass;
}

/**
 * Work out which size band an asset belongs to, or null if it cannot be known.
 *
 * Returning null is a real answer, not a failure: an untagged `building` could be a garden
 * shed or an office tower, and picking one at random would produce a world that is
 * confidently wrong rather than merely unnormalised.
 */
export function classifyAsset(input: ClassifyInput): SizeClass | null {
  if (input.sizeClass && input.sizeClass in SIZE_CLASSES) return input.sizeClass;

  const tags = new Set(input.tags.map(t => t.toLowerCase().replace(/[\s_-]/g, '')));

  // Things with no physical size to normalise, or whose size IS the authored intent.
  // A level model is not "a building that came out too big", and an animation asset has
  // no geometry at all — its category tag must never fall through to a shape rule.
  if (input.type === 'animation' || tags.has('animation') || tags.has('map') || tags.has('level')) return null;

  for (const [cls, keys] of TAG_RULES) {
    for (const k of keys) if (tags.has(k)) return cls;
  }

  // A `character` asset is unambiguous even with no tags — every humanoid rig is a person
  // unless told otherwise. Everything else needs a tag; see the doc comment.
  if (input.type === 'character') return 'character';
  return null;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * Measure a model's governing dimension, in the units it was authored in.
 *
 * Measures with the root's own scale factored out, so calling this twice on the same model
 * returns the same number whether or not it has already been normalised — otherwise
 * re-spawning a cached asset would compound its scale on every checkout.
 */
export function measureGoverning(model: THREE.Object3D, governing: Governing): number {
  const prev = model.scale.clone();
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);
  _box.makeEmpty();
  _box.setFromObject(model);
  model.scale.copy(prev);
  model.updateMatrixWorld(true);

  if (_box.isEmpty()) return 0;
  _box.getSize(_size);
  if (!Number.isFinite(_size.x) || !Number.isFinite(_size.y) || !Number.isFinite(_size.z)) return 0;

  switch (governing) {
    case 'height': return _size.y;
    case 'footprint': return Math.max(_size.x, _size.z);
    case 'longest': return Math.max(_size.x, _size.y, _size.z);
  }
}

export interface NormalizeOptions {
  /** Exact governing dimension in metres. Overrides the band entirely. */
  targetSize?: number;
  /** Extra author-supplied multiplier, applied on top of normalisation. */
  extraScale?: number;
}

export interface NormalizeResult {
  sizeClass: SizeClass;
  /** Governing dimension as authored, in the model's own units. */
  measured: number;
  /** Governing dimension after normalisation, in metres. */
  resolved: number;
  /** Uniform factor applied (excluding `extraScale`). */
  factor: number;
  /** True when the model was already in band and left at its authored size. */
  inBand: boolean;
  reason: 'in-band' | 'scaled-to-nominal' | 'explicit-target' | 'unmeasurable';
}

/** Compute the normalisation without touching the model. */
export function planNormalization(
  measured: number,
  sizeClass: SizeClass,
  opts: NormalizeOptions = {},
): NormalizeResult {
  const spec = SIZE_CLASSES[sizeClass] as SizeSpec;
  const base: Omit<NormalizeResult, 'factor' | 'resolved' | 'inBand' | 'reason'> = { sizeClass, measured };

  if (!(measured > 1e-9)) {
    // A model with no renderable geometry (an empty, a lights-only rig) measures zero.
    // Scaling by nominal/0 would be Infinity, so leave it be.
    return { ...base, factor: 1, resolved: 0, inBand: false, reason: 'unmeasurable' };
  }
  if (opts.targetSize && opts.targetSize > 1e-9) {
    return { ...base, factor: opts.targetSize / measured, resolved: opts.targetSize, inBand: false, reason: 'explicit-target' };
  }
  if (measured >= spec.min && measured <= spec.max) {
    return { ...base, factor: 1, resolved: measured, inBand: true, reason: 'in-band' };
  }
  return { ...base, factor: spec.nominal / measured, resolved: spec.nominal, inBand: false, reason: 'scaled-to-nominal' };
}

/**
 * Re-bind every SkinnedMesh to its skeleton at the current (already-scaled) rest pose.
 *
 * Mixamo rigs capture their bind inverses at the ~1/160 export scale; once the model is
 * scaled the root scale does not factor cleanly back through the bone chain and the
 * skinned vertices collapse to a point (invisible). MUST run before any clip poses the
 * skeleton, while it is still at rest.
 */
export function rebindSkinnedMeshes(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      // Detach the inverse array BEFORE recalculating.
      //
      // SkeletonUtils.clone() calls Skeleton.clone(), which is `new Skeleton(bones,
      // this.boneInverses)` — and that constructor stores the array BY REFERENCE. So
      // every clone of a cached asset shares one boneInverses array with the canonical.
      // calculateInverses() truncates and refills it in place, so rebinding one spawned
      // character silently rewrote the bind pose of the canonical and of every other
      // instance, compounding the scale on each successive spawn. Symptoms were a
      // skinned bounding box collapsing toward zero and the retargeter measuring a
      // 21,500-unit leg on a 1.7 m character.
      sm.skeleton.boneInverses = [];
      sm.skeleton.calculateInverses();
      sm.bind(sm.skeleton, sm.matrixWorld.clone());
    }
  });
}

/**
 * Measure the model, scale it into its size class, and re-bind any skinned meshes.
 * Returns null when the asset has no inferable size class (left untouched).
 */
export function normalizeModel(
  model: THREE.Object3D,
  sizeClass: SizeClass | null,
  opts: NormalizeOptions = {},
): NormalizeResult | null {
  if (!sizeClass) return null;
  const spec = SIZE_CLASSES[sizeClass] as SizeSpec;
  const plan = planNormalization(measureGoverning(model, spec.governing), sizeClass, opts);

  const total = plan.factor * (opts.extraScale ?? 1);
  model.scale.setScalar(total);
  model.updateMatrixWorld(true);

  let skinned = false;
  model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
  if (skinned && plan.factor !== 1) rebindSkinnedMeshes(model);

  return plan;
}

/** Human-readable one-liner for logs and the inspector. */
export function describeNormalization(id: string, r: NormalizeResult): string {
  const spec = SIZE_CLASSES[r.sizeClass] as SizeSpec;
  if (r.reason === 'unmeasurable') return `[scale] '${id}': no measurable geometry — left at authored scale.`;
  if (r.inBand) return `[scale] '${id}': ${r.measured.toFixed(2)}m already within ${spec.label} (${spec.min}-${spec.max}m) — left as authored.`;
  return `[scale] '${id}': ${r.measured.toPrecision(3)} → ${r.resolved.toFixed(3)}m as ${spec.label} (×${r.factor.toPrecision(4)}).`;
}
