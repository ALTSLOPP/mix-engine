import type { Engine } from '../engine/Engine';
import { escapeHtml, showToast } from '../ui/domUtils';

/**
 * Render the live Motion Director debugger and timeline panel into a container.
 */
export function renderMotionDirectorPanel(engine: Engine, container: HTMLElement): void {
  const selectedRb = engine.gizmo.attached;
  const entityId = selectedRb ? engine.sceneManager.entityOf(selectedRb) : null;
  const graph = entityId !== null ? engine.motion.getGraph(entityId) : null;

  if (!graph || entityId === null) {
    container.innerHTML = `
      <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:11px;">
        <div style="font-size:24px; margin-bottom:8px;">\uD83C\uDFAC</div>
        <strong>MIX Motion Director</strong><br/>
        Select an animated entity in the Outliner or Viewport to inspect its live MotionGraph.
      </div>
    `;
    return;
  }

  const inspection = graph.inspect();
  const layersHtml = inspection.layers
    .map(
      (l) => `
      <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:4px; padding:8px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-weight:bold; font-size:11px; color:var(--accent-purple);">Layer ${l.index}: ${escapeHtml(l.name)} (${l.blendMode})</span>
          <span style="font-size:10px; color:var(--text-muted);">Weight: ${(l.weight * 100).toFixed(0)}%</span>
        </div>
        <div style="margin-bottom:6px;">
          <input type="range" class="form-control-slider motion-layer-slider" data-layer="${escapeHtml(l.name)}" min="0" max="1" step="0.01" value="${l.weight}" style="width:100%;" />
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${l.activeStates
            .map(
              (s) => `
            <div style="background:rgba(0,0,0,0.2); padding:4px 6px; border-radius:3px; font-size:10px;">
              <div style="display:flex; justify-content:space-between;">
                <span style="color:#60a5fa;">${escapeHtml(s.clipName || s.id)}</span>
                <span style="color:var(--text-muted);">${(s.normalizedTime * 100).toFixed(0)}% [${s.status}]</span>
              </div>
              <div style="width:100%; height:4px; background:#333; border-radius:2px; margin-top:3px; overflow:hidden;">
                <div style="width:${Math.min(100, s.normalizedTime * 100)}%; height:100%; background:var(--accent-purple);"></div>
              </div>
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    `,
    )
    .join('');

  const params = graph.parameters.toJSON();
  const paramsHtml = Object.keys(params).length
    ? `<div style="margin-top:10px; font-size:10px;">
        <div style="font-weight:bold; color:var(--text-muted); margin-bottom:4px;">PARAMETERS</div>
        <table style="width:100%; border-collapse:collapse;">
          ${Object.entries(params)
            .map(
              ([k, v]) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:2px 0; color:var(--text-muted);">${escapeHtml(k)}</td>
              <td style="padding:2px 0; text-align:right; font-family:monospace; color:#34d399;">${JSON.stringify(v)}</td>
            </tr>
          `,
            )
            .join('')}
        </table>
      </div>`
    : '';

  container.innerHTML = `
    <div style="padding:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-weight:bold; font-size:12px;">\uD83C\uDFAC Motion Director (#${entityId})</span>
        <button class="btn-secondary" id="btn-motion-copy-diag" style="padding:2px 6px; font-size:9px;">Copy Diagnostics JSON</button>
      </div>

      <div style="margin-bottom:10px; display:flex; gap:6px;">
        <button class="btn-secondary" id="btn-motion-pause" style="flex:1; font-size:10px;">Pause</button>
        <button class="btn-secondary" id="btn-motion-resume" style="flex:1; font-size:10px;">Resume</button>
      </div>

      <div style="font-weight:bold; font-size:10px; color:var(--text-muted); margin-bottom:6px;">ACTIVE LAYERS (${inspection.activeLayerCount})</div>
      ${layersHtml}
      ${paramsHtml}
    </div>
  `;

  const btnCopy = container.querySelector('#btn-motion-copy-diag');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard
        .writeText(JSON.stringify(inspection, null, 2))
        .then(() => showToast('Motion Director diagnostics copied to clipboard.', 'success'))
        .catch(() => showToast('Failed to copy.', 'error'));
    });
  }

  const btnPause = container.querySelector('#btn-motion-pause');
  if (btnPause) btnPause.addEventListener('click', () => graph.pause());

  const btnResume = container.querySelector('#btn-motion-resume');
  if (btnResume) btnResume.addEventListener('click', () => graph.resume());

  const sliders = container.querySelectorAll<HTMLInputElement>('.motion-layer-slider');
  sliders.forEach((slider) => {
    slider.addEventListener('input', () => {
      const layerName = slider.dataset.layer;
      if (layerName) {
        graph.setLayerWeight(layerName, parseFloat(slider.value), 0.05);
      }
    });
  });
}
