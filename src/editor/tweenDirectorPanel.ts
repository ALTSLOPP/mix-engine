import type { Engine } from '../engine/Engine';
import { escapeHtml, showToast } from '../ui/domUtils';

/**
 * Render the live MIX Tween Director timeline and inspector panel into a container.
 */
export function renderTweenDirectorPanel(engine: Engine, container: HTMLElement): void {
  const director = engine.tweens;
  const report = director.inspect();

  const selectedRb = engine.gizmo.attached;
  const entityId = selectedRb ? engine.sceneManager.entityOf(selectedRb) : null;
  const entityGraph = entityId !== null ? director.getGraph(entityId) : null;

  const activeTweensHtml = report.activeTweens.length
    ? report.activeTweens
        .map(
          (t) => `
        <div style="background:var(--bg-secondary, rgba(255,255,255,0.03)); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:bold; font-size:11px; color:var(--accent-cyan);">${escapeHtml(t.id)}: ${escapeHtml(t.property)}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              <span style="font-size:9px; color:var(--text-muted);">${(t.progress * 100).toFixed(0)}% [${escapeHtml(t.status)}]</span>
              <button class="btn-secondary btn-tw-toggle" data-id="${escapeHtml(t.id)}" style="padding:1px 4px; font-size:8px;">${t.status === 'paused' ? '▶' : '⏸'}</button>
              <button class="btn-secondary btn-tw-kill" data-id="${escapeHtml(t.id)}" style="padding:1px 4px; font-size:8px; color:#ef4444;">✕</button>
            </div>
          </div>
          <div style="width:100%; height:4px; background:#222; border-radius:2px; overflow:hidden; margin-bottom:4px;">
            <div style="width:${Math.min(100, Math.max(0, t.progress * 100))}%; height:100%; background:var(--accent-cyan);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--text-muted);">
            <span>Ease: ${escapeHtml(t.ease)}</span>
            <span>Dur: ${t.duration.toFixed(2)}s | Policy: ${escapeHtml(t.conflictPolicy)}</span>
          </div>
        </div>
      `,
        )
        .join('')
    : `<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:10px;">No active standalone tweens</div>`;

  const activeSequencesHtml = report.activeSequences.length
    ? report.activeSequences
        .map(
          (s) => `
        <div style="background:var(--bg-secondary, rgba(255,255,255,0.03)); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:bold; font-size:11px; color:var(--accent-purple);">${escapeHtml(s.id)} (${s.activeTrackCount} tracks)</span>
            <div style="display:flex; gap:4px; align-items:center;">
              <span style="font-size:9px; color:var(--text-muted);">${(s.progress * 100).toFixed(0)}% [${escapeHtml(s.status)}]</span>
              <button class="btn-secondary btn-seq-toggle" data-id="${escapeHtml(s.id)}" style="padding:1px 4px; font-size:8px;">${s.status === 'paused' ? '▶' : '⏸'}</button>
              <button class="btn-secondary btn-seq-kill" data-id="${escapeHtml(s.id)}" style="padding:1px 4px; font-size:8px; color:#ef4444;">✕</button>
            </div>
          </div>
          <div style="width:100%; height:5px; background:#222; border-radius:2px; overflow:hidden; margin-bottom:4px;">
            <div style="width:${Math.min(100, Math.max(0, s.progress * 100))}%; height:100%; background:var(--accent-purple);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; color:var(--text-muted); margin-bottom:4px;">
            <span>Elapsed: ${s.elapsed.toFixed(2)}s / ${s.duration.toFixed(2)}s</span>
            <span>Scale: ${s.timeScale}x</span>
          </div>
          <input type="range" class="seq-scrubber" data-id="${escapeHtml(s.id)}" min="0" max="${Math.max(0.01, s.duration)}" step="0.01" value="${s.elapsed}" style="width:100%; cursor:pointer;" />
        </div>
      `,
        )
        .join('')
    : `<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:10px;">No active sequences</div>`;

  container.innerHTML = `
    <div style="padding:10px; display:flex; flex-direction:column; height:100%; overflow-y:auto; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-weight:bold; font-size:12px; color:#fff;">🎬 MIX Tween Director</span>
        <div style="display:flex; gap:4px;">
          <button class="btn-secondary" id="btn-tween-refresh" style="padding:2px 6px; font-size:9px;">⟳ Refresh</button>
          <button class="btn-secondary" id="btn-tween-copy-diag" style="padding:2px 6px; font-size:9px;">Copy Diag JSON</button>
          <button class="btn-secondary" id="btn-tween-kill-all" style="padding:2px 6px; font-size:9px; color:#ef4444;">Kill All</button>
        </div>
      </div>

      <div style="margin-bottom:10px; display:flex; gap:6px;">
        <button class="btn-secondary" id="btn-tween-pause-all" style="flex:1; font-size:10px;">Pause All</button>
        <button class="btn-secondary" id="btn-tween-resume-all" style="flex:1; font-size:10px;">Resume All</button>
      </div>

      ${
        entityId !== null
          ? `<div style="background:rgba(0,240,255,0.05); border:1px solid rgba(0,240,255,0.2); border-radius:4px; padding:6px; margin-bottom:10px; font-size:10px;">
              <strong>Selected Entity (#${entityId})</strong>: ${entityGraph ? `${entityGraph.activeTweenList.length} active tweens` : 'Idle'}
            </div>`
          : ''
      }

      <div style="font-weight:bold; font-size:10px; color:var(--text-muted); margin-bottom:6px;">
        ACTIVE SEQUENCES (${report.activeSequenceCount})
      </div>
      <div style="margin-bottom:10px;">
        ${activeSequencesHtml}
      </div>

      <div style="font-weight:bold; font-size:10px; color:var(--text-muted); margin-bottom:6px;">
        ACTIVE TWEENS (${report.activeTweenCount})
      </div>
      <div style="margin-bottom:10px;">
        ${activeTweensHtml}
      </div>

      <div style="margin-top:auto; border-top:1px solid var(--border-color); padding-top:6px; font-size:9px; color:var(--text-muted); display:flex; justify-content:space-between;">
        <span>Pool: V3(${report.poolUsage.vector3}) Quat(${report.poolUsage.quaternion})</span>
        <span>${report.errors.length ? `<span style="color:#ef4444;">${report.errors.length} Error(s)</span>` : '<span style="color:#10b981;">Healthy</span>'}</span>
      </div>
    </div>
  `;

  // Hook top action buttons
  const btnRefresh = container.querySelector('#btn-tween-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => renderTweenDirectorPanel(engine, container));
  }

  const btnCopy = container.querySelector('#btn-tween-copy-diag');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard
        .writeText(JSON.stringify(report, null, 2))
        .then(() => showToast('Tween Director diagnostics copied to clipboard.', 'success'))
        .catch(() => showToast('Failed to copy.', 'error'));
    });
  }

  const btnPauseAll = container.querySelector('#btn-tween-pause-all');
  if (btnPauseAll) {
    btnPauseAll.addEventListener('click', () => {
      director.pauseAll();
      renderTweenDirectorPanel(engine, container);
    });
  }

  const btnResumeAll = container.querySelector('#btn-tween-resume-all');
  if (btnResumeAll) {
    btnResumeAll.addEventListener('click', () => {
      director.resumeAll();
      renderTweenDirectorPanel(engine, container);
    });
  }

  const btnKillAll = container.querySelector('#btn-tween-kill-all');
  if (btnKillAll) {
    btnKillAll.addEventListener('click', () => {
      director.killAll('manual_kill');
      renderTweenDirectorPanel(engine, container);
    });
  }

  // Hook individual tween toggle / kill
  container.querySelectorAll<HTMLButtonElement>('.btn-tw-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const tw = director.activeTweens.find((t) => t.id === id);
      if (tw) {
        if (tw.status === 'paused') tw.resume();
        else tw.pause();
        renderTweenDirectorPanel(engine, container);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.btn-tw-kill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const tw = director.activeTweens.find((t) => t.id === id);
      if (tw) {
        tw.kill('manual_kill');
        renderTweenDirectorPanel(engine, container);
      }
    });
  });

  // Hook individual sequence toggle / kill / scrub
  container.querySelectorAll<HTMLButtonElement>('.btn-seq-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const seq = director.activeSequences.find((s) => s.id === id);
      if (seq) {
        if (seq.status === 'paused') seq.resume();
        else seq.pause();
        renderTweenDirectorPanel(engine, container);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.btn-seq-kill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const seq = director.activeSequences.find((s) => s.id === id);
      if (seq) {
        seq.kill('manual_kill');
        renderTweenDirectorPanel(engine, container);
      }
    });
  });

  container.querySelectorAll<HTMLInputElement>('.seq-scrubber').forEach((input) => {
    input.addEventListener('input', () => {
      const id = input.getAttribute('data-id');
      const seq = director.activeSequences.find((s) => s.id === id);
      if (seq) {
        const time = parseFloat(input.value);
        seq.seek(time);
      }
    });
  });
}
