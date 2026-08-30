import { describe, expect, it } from 'vitest';
import { buildRetargetProReport } from '../src/animation/RetargetProReport';
import type { AnimationPackDef } from '../src/animation/AnimationPack';

const def: AnimationPackDef = {
  id: 'martial', displayName: 'Martial', targetRig: 'ayo', sourcePath: '/packs/martial', createdAt: 1,
  entries: [
    { id:'kick', displayName:'Kick', fileName:'kick.fbx', category:'combat', tags:[], duration:1, loop:false, rootMotion:true, sourceProfileId:'ue_motifect', translationScale:.01 },
    { id:'idle', displayName:'Idle', fileName:'idle.fbx', category:'idle', tags:[], duration:2, loop:true, rootMotion:false, sourceProfileId:'ue_motifect', translationScale:.01 },
  ],
};

describe('Retarget Pro agent report', () => {
  it('returns a stable grade-A machine-readable report', () => {
    const r = buildRetargetProReport(def, []);
    expect(r).toMatchObject({ readiness:'ready', grade:'A', clipCount:2, rootMotionClips:1, sourceProfiles:['ue_motifect'] });
    expect(r.categories).toEqual({ combat:1, idle:1 });
    expect(r.summary).toContain('READY');
  });

  it('blocks critical rig failures and gives an agent action', () => {
    const r = buildRetargetProReport(def, ["[retarget] source rig missing required bones: Hips"]);
    expect(r.readiness).toBe('blocked'); expect(r.grade).toBe('F');
    expect(r.critical).toHaveLength(1); expect(r.recommendations[0]).toMatch(/before applying/i);
  });

  it('keeps contact drift advisory-only and recommends the AAA preset', () => {
    const r = buildRetargetProReport(def, ['[retarget] feet drift up to 38% of leg length']);
    expect(r.readiness).toBe('ready'); expect(r.grade).toBe('A');
    expect(r.advisories).toHaveLength(1); expect(r.recommendations.join(' ')).toContain('qualityPreset:"aaa"');
  });
});
