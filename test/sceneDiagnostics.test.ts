import { describe, it, expect } from 'vitest';
import {
  SceneDiagnostics,
  type EntityDiag,
  type FrameHealth,
  type DiagReport,
} from '../src/rendering/SceneDiagnostics';

// The render path (id pass + frame readback) needs a real WebGL context and is verified
// live in the browser. Here we lock down the PURE reasoning that turns measured numbers
// into the agent-facing flags / anomalies / summary — the part that decides pass/fail.

function entity(over: Partial<EntityDiag> = {}): EntityDiag {
  return {
    id: 1, name: undefined, kind: 'character',
    visible: true, coveragePx: 4000, coveragePct: 0.05,
    onScreen: true, behindCamera: false, screen: { x: 0.5, y: 0.5 },
    sizeM: { x: 0.6, y: 1.8, z: 0.4 }, maxDimM: 1.8, flags: [],
    ...over,
  };
}
function frame(over: Partial<FrameHealth> = {}): FrameHealth {
  return { width: 320, height: 200, avgLuminance: 90, blackPct: 0.1, brightPct: 0.05, isBlack: false, isBlownOut: false, ...over };
}

describe('SceneDiagnostics.flagsFor', () => {
  it('flags a healthy, on-screen, normal-size entity with nothing', () => {
    expect(SceneDiagnostics.flagsFor(entity())).toEqual([]);
  });

  it('flags an off-screen 0-px entity as offscreen + invisible', () => {
    const f = SceneDiagnostics.flagsFor(entity({ coveragePx: 0, coveragePct: 0, onScreen: false }));
    expect(f).toContain('offscreen');
    expect(f).toContain('invisible');
  });

  it('distinguishes "in frustum but draws nothing" (occluded/unrendered) from off-screen', () => {
    const f = SceneDiagnostics.flagsFor(entity({ coveragePx: 0, coveragePct: 0, onScreen: true }));
    expect(f).toContain('occluded_or_unrendered');
    expect(f).toContain('invisible');
    expect(f).not.toContain('offscreen');
  });

  it('flags a behind-camera entity distinctly', () => {
    const f = SceneDiagnostics.flagsFor(entity({ coveragePx: 0, coveragePct: 0, onScreen: false, behindCamera: true }));
    expect(f).toContain('behind_camera');
    expect(f).toContain('invisible');
  });

  it('flags a 1 cm import as tiny and a 238 m CHARACTER as huge (the real scale bugs)', () => {
    expect(SceneDiagnostics.flagsFor(entity({ maxDimM: 0.01, sizeM: { x: 0.01, y: 0.01, z: 0.01 } }))).toContain('tiny');
    expect(SceneDiagnostics.flagsFor(entity({ kind: 'character', maxDimM: 238 }))).toContain('huge');
  });

  it('does NOT flag world-scale-by-design kinds (map/terrain) as huge — avoids false alarms', () => {
    expect(SceneDiagnostics.flagsFor(entity({ kind: 'mapModel', maxDimM: 677 }))).not.toContain('huge');
    expect(SceneDiagnostics.flagsFor(entity({ kind: 'terrain', maxDimM: 4000 }))).not.toContain('huge');
    // a generic prop the agent placed at 600 m is still worth flagging
    expect(SceneDiagnostics.flagsFor(entity({ kind: 'box', maxDimM: 600 }))).toContain('huge');
  });

  it('flags a few-pixel speck as barely_visible (below the prominence floor)', () => {
    const f = SceneDiagnostics.flagsFor(entity({ coveragePx: 3, coveragePct: 0.00005 }));
    expect(f).toContain('barely_visible');
    expect(f).not.toContain('invisible');
  });
});

describe('SceneDiagnostics.collectAnomalies', () => {
  it('reports a black frame', () => {
    const a = SceneDiagnostics.collectAnomalies(frame({ isBlack: true, avgLuminance: 1 }), []);
    expect(a.join(' ')).toMatch(/black/i);
  });

  it('reports a blown-out frame', () => {
    const a = SceneDiagnostics.collectAnomalies(frame({ isBlownOut: true, brightPct: 0.95 }), []);
    expect(a.join(' ')).toMatch(/blown out/i);
  });

  it('explains an IN-VIEW-but-invisible entity (the actionable bug) with a reason', () => {
    const e = entity({ id: 5, name: 'ayo', coveragePx: 0, coveragePct: 0, onScreen: true, visible: false, flags: ['occluded_or_unrendered', 'invisible'] });
    const a = SceneDiagnostics.collectAnomalies(frame(), [e]);
    expect(a.length).toBe(1);
    expect(a[0]).toMatch(/#5 "ayo"/);
    expect(a[0]).toMatch(/0 px/);
  });

  it('stays QUIET about entities that are simply off-screen / behind the camera (normal)', () => {
    const offscreen = entity({ id: 8, coveragePx: 0, coveragePct: 0, onScreen: false, visible: false, flags: ['offscreen', 'invisible'] });
    const behind = entity({ id: 9, coveragePx: 0, coveragePct: 0, onScreen: false, behindCamera: true, visible: false, flags: ['behind_camera', 'invisible'] });
    // Aiming the camera elsewhere must NOT spam an anomaly per unseen entity.
    expect(SceneDiagnostics.collectAnomalies(frame(), [offscreen, behind])).toEqual([]);
  });

  it('says nothing when the frame is fine and entities render', () => {
    expect(SceneDiagnostics.collectAnomalies(frame(), [entity()])).toEqual([]);
  });
});

describe('SceneDiagnostics.summarize', () => {
  it('renders a token-efficient report with frame, entities and anomalies', () => {
    const report: DiagReport = {
      frame: frame({ avgLuminance: 88 }),
      entities: [
        entity({ id: 1, name: 'player', coveragePct: 0.12 }),
        entity({ id: 2, name: 'ghost', visible: false, coveragePx: 0, coveragePct: 0, flags: ['invisible'] }),
      ],
      anomalies: ['#2 "ghost" (character): renders 0 px — INVISIBLE'],
    };
    const s = SceneDiagnostics.summarize(report);
    expect(s).toMatch(/frame 320×200/);
    expect(s).toMatch(/2 observed, 1 visible/);
    expect(s).toMatch(/#1 "player"/);
    expect(s).toMatch(/NOT VISIBLE/);
    expect(s).toMatch(/anomalies:/);
  });

  it('says "anomalies: none" on a clean scene', () => {
    const report: DiagReport = { frame: frame(), entities: [entity()], anomalies: [] };
    expect(SceneDiagnostics.summarize(report)).toMatch(/anomalies: none/);
  });
});
