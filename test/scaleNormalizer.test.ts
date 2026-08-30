// Size normalisation: classification rules and the scaling maths.
//
// The measured numbers used here come from this project's actual asset library, so the
// tests fail if a rule change would resize a real model the wrong way.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  SIZE_CLASSES,
  classifyAsset,
  measureGoverning,
  planNormalization,
  normalizeModel,
  rebindSkinnedMeshes,
  type SizeClass,
} from '../src/assets/ScaleNormalizer';
import type { AssetType } from '../src/animation/AssetManifest';

const cls = (type: AssetType, tags: string[], sizeClass?: SizeClass) =>
  classifyAsset({ type, tags, sizeClass });

/** A box of the given dimensions, as a stand-in for a loaded model. */
function boxModel(x: number, y: number, z: number): THREE.Object3D {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z));
  g.add(m);
  return g;
}

describe('classifyAsset', () => {
  it('reads the size class off the entry when given one', () => {
    expect(cls('building', ['whatever'], 'skyscraper')).toBe('skyscraper');
  });

  it('treats any character asset as a person even with no tags', () => {
    expect(cls('character', [])).toBe('character');
    expect(cls('character', ['preset', 'character'])).toBe('character');
  });

  it('classifies this project\'s real preset tags', () => {
    // Exactly the tags Engine.registerPresets uses.
    expect(cls('misc', ['preset', 'model', 'enemy'])).toBe('character');
    expect(cls('misc', ['preset', 'model', 'weapon', 'sword', 'katana'])).toBe('weapon_sword');
    expect(cls('misc', ['prop', 'outdoor', 'lamp', 'streetlamp', 'light'])).toBe('streetlamp');
    expect(cls('misc', ['prop', 'outdoor', 'bench', 'seating'])).toBe('bench');
    expect(cls('misc', ['prop', 'outdoor', 'vending', 'machine'])).toBe('vending_machine');
    expect(cls('misc', ['prop', 'outdoor', 'mailbox'])).toBe('mailbox');
    expect(cls('misc', ['prop', 'outdoor', 'gate'])).toBe('gate');
    expect(cls('misc', ['prop', 'outdoor', 'planter'])).toBe('planter');
  });

  it('keeps scattered debris out of the trash-can class', () => {
    // 91 presets carry ['preset','model','trash','debris']. Reading 'trash' as
    // "receptacle" would inflate every one of them into a 1-metre bin.
    expect(cls('misc', ['preset', 'model', 'trash', 'debris'])).toBe('prop_small');
    // ...while the actual bin, which carries 'bin' and 'garbage', still resolves.
    expect(cls('misc', ['prop', 'outdoor', 'trash', 'bin', 'can', 'garbage'])).toBe('trashcan');
  });

  it('refuses to guess', () => {
    // An untagged building could be a shed or a tower; picking one would be
    // confidently wrong rather than merely unnormalised.
    expect(cls('building', [])).toBeNull();
    expect(cls('prop', [])).toBeNull();
    expect(cls('misc', ['preset', 'model'])).toBeNull();
  });

  it('never normalises maps or animation assets', () => {
    expect(cls('misc', ['preset', 'model', 'map'])).toBeNull();
    expect(cls('animation', ['preset', 'animation', 'Locomotion'])).toBeNull();
    // A category tag like "swords animations" must not reach the weapon rule.
    expect(cls('misc', ['preset', 'animation', 'swords animations'])).toBeNull();
  });

  it('prefers the specific tag when tags overlap', () => {
    expect(cls('vehicle', ['vehicle', 'motorcycle'])).toBe('motorcycle');
    expect(cls('vehicle', ['vehicle', 'bus'])).toBe('bus');
    expect(cls('vehicle', ['vehicle'])).toBe('car');
  });
});

describe('measureGoverning', () => {
  it('picks the right axis per governing mode', () => {
    const m = boxModel(2, 5, 3);
    expect(measureGoverning(m, 'height')).toBeCloseTo(5, 6);
    expect(measureGoverning(m, 'footprint')).toBeCloseTo(3, 6);
    expect(measureGoverning(m, 'longest')).toBeCloseTo(5, 6);
  });

  it('is unaffected by a scale already on the model', () => {
    // Re-spawning a cached asset must not compound its scale on every checkout.
    const m = boxModel(2, 5, 3);
    const before = measureGoverning(m, 'height');
    m.scale.setScalar(37);
    expect(measureGoverning(m, 'height')).toBeCloseTo(before, 6);
    expect(m.scale.x).toBe(37); // and the measurement restores what it found
  });

  it('returns 0 for geometry-free models rather than dividing by it', () => {
    expect(measureGoverning(new THREE.Group(), 'height')).toBe(0);
  });
});

describe('planNormalization', () => {
  it('leaves an in-band model at its authored size', () => {
    const r = planNormalization(1.72, 'character');
    expect(r.inBand).toBe(true);
    expect(r.factor).toBe(1);
    expect(r.resolved).toBeCloseTo(1.72, 6);
  });

  it('scales an out-of-band model to the class nominal', () => {
    const r = planNormalization(0.0111, 'character'); // the real Mixamo export scale
    expect(r.inBand).toBe(false);
    expect(r.resolved).toBeCloseTo(SIZE_CLASSES.character.nominal, 6);
    expect(r.factor).toBeCloseTo(1.778 / 0.0111, 3);
  });

  it('honours an explicit target over the band', () => {
    const r = planNormalization(0.0111, 'character', { targetSize: 1.757 });
    expect(r.reason).toBe('explicit-target');
    expect(r.resolved).toBeCloseTo(1.757, 6);
  });

  it('does not divide by a zero measurement', () => {
    const r = planNormalization(0, 'character');
    expect(r.reason).toBe('unmeasurable');
    expect(r.factor).toBe(1);
    expect(Number.isFinite(r.resolved)).toBe(true);
  });

  it('brings this project\'s four real katanas to a usable length', () => {
    // Authored longest dimensions, measured from the shipped GLBs.
    for (const measured of [4.95, 15.242, 62.077, 111.305]) {
      const r = planNormalization(measured, 'weapon_sword');
      expect(r.resolved).toBeGreaterThanOrEqual(SIZE_CLASSES.weapon_sword.min);
      expect(r.resolved).toBeLessThanOrEqual(SIZE_CLASSES.weapon_sword.max);
    }
  });

  it('handles the real enemy models the way their sizes deserve', () => {
    // Akademiks measures 1.87 m — a plausible person, so left alone.
    expect(planNormalization(1.8706, 'character').inBand).toBe(true);
    // Granny at 1.99 m is over the band; Jelly roll at 0.01 is a broken export.
    // Both land on the nominal.
    expect(planNormalization(1.9873, 'character').resolved).toBeCloseTo(1.778, 6);
    expect(planNormalization(0.0100, 'character').resolved).toBeCloseTo(1.778, 6);
  });
});

describe('normalizeModel', () => {
  it('leaves the model alone when the class is unknown', () => {
    const m = boxModel(1, 900, 1);
    expect(normalizeModel(m, null)).toBeNull();
    expect(m.scale.x).toBe(1);
  });

  it('actually resizes the model to the resolved dimension', () => {
    const m = boxModel(0.5, 0.0111, 0.3);
    const r = normalizeModel(m, 'character')!;
    expect(r.resolved).toBeCloseTo(1.778, 6);
    // Measured through the applied scale: the model really is that tall now.
    const box = new THREE.Box3().setFromObject((m.updateMatrixWorld(true), m));
    expect(box.getSize(new THREE.Vector3()).y).toBeCloseTo(1.778, 3);
  });

  it('composes an author-supplied scale on top of normalisation', () => {
    const m = boxModel(0.5, 0.0111, 0.3);
    normalizeModel(m, 'character', { extraScale: 2 });
    m.updateMatrixWorld(true);
    const h = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y;
    expect(h).toBeCloseTo(1.778 * 2, 3);
  });

  it('is idempotent across repeated spawns of one cached asset', () => {
    const m = boxModel(0.5, 0.0111, 0.3);
    normalizeModel(m, 'character');
    const first = m.scale.x;
    normalizeModel(m, 'character');
    expect(m.scale.x).toBeCloseTo(first, 9);
  });
});

describe('size bands are internally coherent', () => {
  it('orders min <= nominal <= max everywhere', () => {
    for (const [name, spec] of Object.entries(SIZE_CLASSES)) {
      expect(spec.min, `${name} min`).toBeLessThanOrEqual(spec.nominal);
      expect(spec.nominal, `${name} nominal`).toBeLessThanOrEqual(spec.max);
      expect(spec.min, `${name} min`).toBeGreaterThan(0);
    }
  });

  it('puts the character band at 5\'6"-6\'2" as specified', () => {
    expect(SIZE_CLASSES.character.min).toBeCloseTo((5 * 12 + 6) * 0.0254, 3); // 5'6"
    expect(SIZE_CLASSES.character.max).toBeCloseTo((6 * 12 + 2) * 0.0254, 3); // 6'2"
  });

  it('keeps every locked character height inside the band', () => {
    // The values Engine.registerPresets pins for the roster.
    const b = SIZE_CLASSES.character;
    for (const h of [1.757, 1.755, 1.785, 1.815]) {
      expect(h).toBeGreaterThanOrEqual(b.min);
      expect(h).toBeLessThanOrEqual(b.max);
    }
  });

  it('does not let building bands overlap out of order', () => {
    const ladder: SizeClass[] = [
      'house_1story', 'house_2story', 'house_3story',
      'commercial_mid', 'highrise', 'skyscraper',
    ];
    for (let i = 1; i < ladder.length; i++) {
      const lo = SIZE_CLASSES[ladder[i - 1]];
      const hi = SIZE_CLASSES[ladder[i]];
      expect(hi.nominal, `${ladder[i]} vs ${ladder[i - 1]}`).toBeGreaterThan(lo.nominal);
    }
  });
});

describe('rebindSkinnedMeshes', () => {
  /** A minimal two-bone skinned mesh. */
  function skinnedRig(): THREE.Group {
    const g = new THREE.Group();
    const root = new THREE.Bone();
    const child = new THREE.Bone();
    child.position.set(0, 1, 0);
    root.add(child);
    const geo = new THREE.BoxGeometry(0.2, 2, 0.2);
    const skinIndex: number[] = [];
    const skinWeight: number[] = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      skinIndex.push(0, 1, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    const skeleton = new THREE.Skeleton([root, child]);
    g.add(root);
    g.add(mesh);
    mesh.bind(skeleton);
    g.updateMatrixWorld(true);
    return g;
  }

  it('does not rewrite the bind pose shared with the canonical', () => {
    // SkeletonUtils.clone hands the clone the SAME boneInverses array object, so an
    // in-place calculateInverses() on one spawned instance used to corrupt the cached
    // canonical and every other instance — compounding on each successive spawn.
    const canonical = skinnedRig();
    const canonMesh = canonical.children.find(c => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
    const before = canonMesh.skeleton.boneInverses.map(m => m.clone());

    const clone = cloneWithSkeleton(canonical) as THREE.Group;
    clone.scale.setScalar(50);
    clone.updateMatrixWorld(true);
    rebindSkinnedMeshes(clone);

    for (let i = 0; i < before.length; i++) {
      expect(canonMesh.skeleton.boneInverses[i].elements)
        .toEqual(before[i].elements);
    }
  });

  it('keeps repeated spawns of one cached asset at a stable size', () => {
    const canonical = skinnedRig();
    const heights: number[] = [];
    for (let spawn = 0; spawn < 4; spawn++) {
      const inst = cloneWithSkeleton(canonical) as THREE.Group;
      normalizeModel(inst, 'character');
      inst.updateMatrixWorld(true);
      heights.push(new THREE.Box3().setFromObject(inst).getSize(new THREE.Vector3()).y);
    }
    for (const h of heights) expect(h).toBeCloseTo(heights[0], 6);
  });
});
