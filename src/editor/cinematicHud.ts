import type { Engine } from '../engine/Engine';
import { showToast } from '../ui/domUtils';
import { container } from './dom';

// --- Cinematic HUD overlay -------------------------------------------------
// A small pill that appears whenever a scripted camera sequence is playing, so the
// user knows the viewport is being directed by the IDE (and can press Esc to abort).
let cinematicBanner: HTMLDivElement | null = null;
let cinematicLabel: HTMLSpanElement | null = null;

export function setupCinematicHud(engine: Engine): void {
  cinematicBanner = document.createElement('div');
  cinematicBanner.id = 'cinematic-banner';
  cinematicBanner.style.cssText =
    'position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:50;display:none;align-items:center;gap:8px;padding:6px 14px;background:rgba(10,12,16,0.92);border:1px solid var(--accent-purple);border-radius:20px;font-size:11px;color:#fff;font-family:inherit;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
  cinematicBanner.innerHTML =
    '<span style="width:9px;height:9px;border-radius:50%;background:var(--accent-purple);box-shadow:0 0 8px var(--accent-purple);animation:mixpulse 1s ease-in-out infinite;"></span>' +
    '<span style="color:var(--accent-purple);font-weight:bold;letter-spacing:1px;">CINEMATIC</span>' +
    '<span id="cinematic-label" style="color:var(--text-muted);"></span>';
  const vp = document.getElementById('viewport-wrapper') ?? container!;
  vp.appendChild(cinematicBanner);
  cinematicLabel = cinematicBanner.querySelector('#cinematic-label');

  // Inject the pulse keyframe once (idempotent).
  if (!document.getElementById('mix-cinematic-keyframes')) {
    const ks = document.createElement('style');
    ks.id = 'mix-cinematic-keyframes';
    ks.textContent = '@keyframes mixpulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(0.7);} }';
    document.head.appendChild(ks);
  }

  // Update the banner each frame from the cinematic state.
  engine.addUpdateHook(() => {
    if (!cinematicBanner) return;
    const active = engine.cinematic.active;
    if (active) {
      cinematicBanner.style.display = 'flex';
      const shot = engine.cinematic.currentShot;
      if (cinematicLabel && shot) {
        const idx = Math.round(engine.cinematic.progress * 100);
        cinematicLabel.textContent = `${shot.name ?? shot.kind} · ${idx}%`;
      }
    } else {
      cinematicBanner.style.display = 'none';
    }
  });

  // Esc aborts the cinematic and restores the editor camera.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && engine.cinematic.active) {
      engine.cinematic.stop();
      showToast('Cinematic aborted — editor camera restored.', 'info');
    }
  });
}
