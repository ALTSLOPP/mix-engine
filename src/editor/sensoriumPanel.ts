import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { escapeHtml, showToast } from '../ui/domUtils';
import { container } from './dom';
import { isCharacterRb } from './sceneHelpers';

// --- SENSORIUM panel ------------------------------------------------------
// A floating panel that lets the user (or the IDE) run a scenario by profile, watch
// the run's progress + felt score, and browse past recordings. The underlying
// engine.sensorium is the real surface — this is just a UX shell.
let sensoriumPanel: HTMLDivElement | null = null;
let sensoriumList: HTMLDivElement | null = null;
let sensoriumStatus: HTMLSpanElement | null = null;
let sensoriumFeel: HTMLDivElement | null = null;

const SENSORIUM_PROFILES: { id: any; label: string; title: string }[] = [
  { id: 'driving', label: '🏎 Drive', title: 'Test driving: launch, corner, brake, reverse' },
  { id: 'locomotion', label: '🚶 Walk', title: 'Test locomotion: walk, strafe, run, turn' },
  { id: 'jump', label: '🦘 Jump', title: 'Test jumping: arc, hang time, landing' },
  { id: 'camera', label: '🎥 Cam', title: 'Test camera: orbit, framing, smoothness' },
  { id: 'stress', label: '⚡ Stress', title: 'Stress test: rapid input, frame pacing' },
];

export function setupSensoriumPanel(engine: Engine): void {
  sensoriumPanel = document.createElement('div');
  sensoriumPanel.id = 'sensorium-panel';
  sensoriumPanel.style.cssText =
    'position:absolute;bottom:12px;left:12px;z-index:50;min-width:248px;max-width:312px;background:rgba(10,12,16,0.92);border:1px solid var(--accent-cyan);border-radius:8px;padding:10px 12px;font-size:11px;color:#fff;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
  sensoriumPanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span style="font-weight:bold;color:var(--accent-cyan);letter-spacing:1px;font-size:11px;" title="The AI's perception layer — it watches AND feels the game.">◎ SENSORIUM</span>
      <span id="sensorium-status" style="font-size:9px;color:var(--text-muted);">idle</span>
    </div>
    <div style="font-size:8px;color:var(--text-muted);margin-bottom:5px;">RUN A SCENARIO</div>
    <div id="sensorium-profiles" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">
      ${SENSORIUM_PROFILES.map((p) =>
        `<button class="btn-secondary sensorium-profile" data-profile="${p.id}" title="${p.title}" style="flex:1 1 30%;font-size:10px;padding:4px 2px;">${p.label}</button>`,
      ).join('')}
    </div>
    <div style="display:flex;gap:4px;margin-bottom:8px;">
      <button class="btn-secondary" id="btn-sensorium-stop" style="flex:1;font-size:10px;padding:4px;color:#ef4444;border-color:rgba(239,68,68,0.4);" disabled>■ Stop</button>
    </div>
    <div id="sensorium-feel" style="display:none;font-size:10px;margin-bottom:8px;padding:6px;border-radius:6px;background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.2);"></div>
    <div style="font-size:9px;color:var(--text-muted);margin-bottom:4px;">RECENT RUNS</div>
    <div id="sensorium-list" style="max-height:130px;overflow-y:auto;font-size:10px;"></div>
    <div style="font-size:8px;color:var(--text-muted);margin-top:6px;line-height:1.4;">The engine drives, records video + telemetry, and <b>feels</b> the run (responsiveness, grip, smoothness…). Hand the video + contact-sheet to a vision model. From an IDE: <code>sensorium_test</code> / <code>mix.test('driving')</code>.</div>
  `;
  const vp = document.getElementById('viewport-wrapper') ?? container!;
  vp.appendChild(sensoriumPanel);
  sensoriumStatus = sensoriumPanel.querySelector('#sensorium-status');
  sensoriumList = sensoriumPanel.querySelector('#sensorium-list');
  sensoriumFeel = sensoriumPanel.querySelector('#sensorium-feel');

  const btnStop = sensoriumPanel.querySelector('#btn-sensorium-stop') as HTMLButtonElement;
  const profileBtns = Array.from(sensoriumPanel.querySelectorAll('.sensorium-profile')) as HTMLButtonElement[];

  profileBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const profile = btn.getAttribute('data-profile');
      if (profile) void runScenario(engine, profile);
    });
  });
  btnStop.addEventListener('click', () => engine.abortSensorium());

  // Poll status every 500ms so the UI reflects live state.
  setInterval(() => {
    if (!sensoriumStatus) return;
    const active = engine.sensorium.isActive;
    sensoriumStatus.textContent = active ? 'recording…' : 'idle';
    sensoriumStatus.style.color = active ? 'var(--accent-cyan)' : 'var(--text-muted)';
    btnStop.disabled = !active;
    profileBtns.forEach((b) => { b.disabled = active; b.style.opacity = active ? '0.4' : '1'; });
  }, 500);

  void refreshSensoriumList();
  setInterval(() => void refreshSensoriumList(), 4000);
}

function feelColor(score: number): string {
  return score >= 70 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-gold)' : '#ef4444';
}

export function showFeel(report: any): void {
  if (!sensoriumFeel) return;
  const feel = report.feel;
  if (!feel) { sensoriumFeel.style.display = 'none'; return; }
  const metricBars = (feel.metrics || []).slice(0, 6).map((m: any) =>
    `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
       <span style="flex:none;width:84px;color:var(--text-muted);font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.label)}</span>
       <span style="flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;"><span style="display:block;height:100%;width:${Math.round(m.score)}%;background:${feelColor(m.score)};"></span></span>
       <span style="flex:none;width:20px;text-align:right;font-size:8px;color:${feelColor(m.score)};">${Math.round(m.score)}</span>
     </div>`,
  ).join('');
  // Quick-links to the artifacts this run produced (only those that persisted).
  const a = report.artifacts || {};
  const link = (href: string, label: string) =>
    `<a href="${href}" target="_blank" style="color:var(--accent-cyan);text-decoration:none;border:1px solid rgba(0,240,255,0.3);border-radius:4px;padding:1px 5px;font-size:8px;">${label}</a>`;
  const links = [
    a.video ? link(a.video, '▷ video') : '',
    a.contactSheet ? link(a.contactSheet, '▦ frames') : '',
    a.report ? link(a.report, '⤓ report') : '',
  ].filter(Boolean).join(' ');
  sensoriumFeel.style.display = 'block';
  sensoriumFeel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
      <span style="font-weight:bold;">FEEL: <span style="color:${feelColor(feel.overall)}">${feel.overall}/100</span> <span style="color:var(--text-muted);font-weight:normal;">(${feel.band})</span></span>
      <span style="font-size:8px;color:var(--text-muted);">${feel.responsivenessMs.toFixed(0)}ms · ${feel.topSpeed.toFixed(1)} m/s</span>
    </div>
    ${metricBars}
    ${links ? `<div style="display:flex;gap:4px;margin-top:5px;">${links}</div>` : ''}`;
}

async function refreshSensoriumList(): Promise<void> {
  if (!sensoriumList) return;
  try {
    const res = await fetch('/api/sensorium/list');
    if (!res.ok) return;
    const list = (await res.json()) as { name: string; savedAt: number; success: boolean; anomalies: number; feel: number; profile: string }[];
    if (!list.length) {
      sensoriumList.innerHTML = '<div style="color:var(--text-muted);font-style:italic;">No runs yet — pick a scenario above.</div>';
      return;
    }
    sensoriumList.innerHTML = list.slice(0, 8).map((r) => {
      const dot = r.success ? 'var(--accent-green)' : (r.anomalies > 3 ? '#ef4444' : 'var(--accent-gold)');
      const ago = agoString(r.savedAt);
      const feel = typeof r.feel === 'number' && r.feel > 0 ? `<span style="color:${feelColor(r.feel)};font-size:9px;flex:none;">${r.feel}</span>` : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" data-name="${r.name}" title="Open report.json">
        <span style="display:flex;align-items:center;gap:6px;overflow:hidden;">
          <span style="width:6px;height:6px;border-radius:50%;background:${dot};flex:none;"></span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.name)}</span>
        </span>
        <span style="display:flex;align-items:center;gap:6px;flex:none;">${feel}<span style="color:var(--text-muted);font-size:9px;">${ago}</span></span>
      </div>`;
    }).join('');
    sensoriumList.querySelectorAll('[data-name]').forEach((el) => {
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-name');
        if (name) window.open(`/sensorium/${name}/report.json`, '_blank');
      });
    });
  } catch {
    /* dev server absent */
  }
}

function agoString(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Run a scenario by profile. Spawns a character if the scene has none, then lets
 *  SENSORIUM drive + record + analyze it. */
export async function runScenario(engine: Engine, profile: string): Promise<void> {
  if (engine.sensorium.isActive) { showToast('A SENSORIUM run is already active.', 'warn'); return; }
  const hasCharacter = engine.sceneManager.rigidBodyList.some(isCharacterRb);
  if (!hasCharacter) {
    engine.sceneManager.requestSpawn(
      new THREE.Vector3(0, 1.5, 0),
      { kind: 'character', params: { assetId: 'ayo' } },
      { rootMotion: true },
    );
    await new Promise((r) => setTimeout(r, 500));
  }
  showToast(`SENSORIUM: running ${profile} scenario…`, 'info');
  try {
    const report = await engine.testSensorium(profile as any, { game: 'MIX Engine demo scene' });
    showFeel(report);
    const verdict = report.success ? '✓ passed' : '⚠ issues';
    showToast(
      `SENSORIUM ${verdict} — feel ${report.feel.overall}/100 (${report.feel.band}), ${report.anomalies.length} anomalies.`,
      report.success ? 'success' : 'warn',
    );
    void refreshSensoriumList();
    window.dispatchEvent(new CustomEvent('mix:sensorium-complete', { detail: report }));
  } catch (err) {
    showToast('SENSORIUM failed: ' + (err as Error).message, 'error');
  }
}
