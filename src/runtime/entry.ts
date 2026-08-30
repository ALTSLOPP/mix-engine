/**
 * runtime/entry.ts — Production web entry (ships as runtime.js).
 * No editor, no Vite HMR, no /api. Loads manifest.json or game.pak from same dir.
 */
import { bootRuntime } from './bootstrap';

const container = document.getElementById('canvas-container') ?? document.body;

bootRuntime(container as HTMLElement, {
  manifestUrl: './manifest.json',
  pakUrl: './game.pak',
  onError: (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[runtime] boot failed:', err);
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff8080;font-family:monospace;padding:24px;text-align:center">Runtime failed to boot:<br/>${msg}</div>`;
  },
}).catch(() => {});
