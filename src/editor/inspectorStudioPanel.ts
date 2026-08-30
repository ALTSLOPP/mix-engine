import type { Engine } from '../engine/Engine';
import { ValidatorRegistry } from '../inspector/ValidatorRegistry';
import { escapeHtml, showToast } from '../ui/domUtils';

/**
 * Render the live Inspector Studio panel and validation status into a container.
 */
export function renderInspectorStudioPanel(engine: Engine, container: HTMLElement): void {
  const selectedRb = engine.gizmo.attached;
  const entityId = selectedRb ? engine.sceneManager.entityOf(selectedRb) : null;
  const blueprint = entityId !== null ? engine.sceneManager.getBlueprint(entityId) : null;
  const target = blueprint ?? selectedRb;

  if (!target) {
    container.innerHTML = `
      <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:11px;">
        <div style="font-size:24px; margin-bottom:8px;">\uD83D\uDD0E</div>
        <strong>MIX Inspector Studio</strong><br/>
        Select an entity to view its metadata schema, PropertyTree reflection, and validation report.
      </div>
    `;
    return;
  }

  const report = ValidatorRegistry.validateTarget(target);
  const statusColor = report.valid ? '#10b981' : '#ef4444';
  const statusText = report.valid ? 'VALID (No Issues)' : `${report.errors.length} Error(s)`;

  const errorsHtml = report.errors
    .map(
      (e) => `
    <div style="background:rgba(239,68,68,0.1); border-left:3px solid #ef4444; padding:4px 6px; font-size:10px; margin-bottom:4px;">
      <div style="font-weight:bold; color:#ef4444;">${escapeHtml(e.validatorId)}: ${escapeHtml(e.message)}</div>
      ${e.suggestedAction ? `<div style="color:var(--text-muted); font-size:9px;">Suggestion: ${escapeHtml(e.suggestedAction)}</div>` : ''}
    </div>
  `,
    )
    .join('');

  const tree = engine.inspector.getTree(target);
  const bodyHtml = engine.inspector.renderInspectorHTML(target);

  container.innerHTML = `
    <div style="padding:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:bold; font-size:12px;">\uD83D\uDD0E Inspector Studio</span>
        <div style="display:flex; gap:4px; align-items:center;">
          <button class="btn-icon" id="btn-inspect-undo" title="Undo" style="padding:2px 6px; font-size:10px;" ${!tree.canUndo() ? 'disabled' : ''}>\u21B6</button>
          <button class="btn-icon" id="btn-inspect-redo" title="Redo" style="padding:2px 6px; font-size:10px;" ${!tree.canRedo() ? 'disabled' : ''}>\u21B7</button>
          <span style="font-size:10px; font-weight:bold; color:${statusColor}; margin-left:4px;">${statusText}</span>
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <input type="text" class="form-control-input" id="inspector-search-input" placeholder="Search properties (Odin)..." style="width:100%; font-size:10px; padding:3px 6px;" />
      </div>

      ${errorsHtml ? `<div style="margin-bottom:8px;">${errorsHtml}</div>` : ''}

      <div class="inspector-studio-body">
        ${bodyHtml}
      </div>

      <div style="margin-top:12px; display:flex; gap:6px;">
        <button class="btn-secondary" id="btn-inspect-validate-now" style="flex:1; font-size:10px;">Validate</button>
        <button class="btn-secondary" id="btn-inspect-export-json" style="flex:1; font-size:10px;">Export JSON</button>
      </div>
    </div>
  `;

  // Bind live change listeners
  const bindInputs = () => {
    const inputs = container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.inspector-input, .inspector-input-subfield');
    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        const path = input.dataset.path;
        if (!path) return;
        let val: unknown = input.value;
        if (input.type === 'number' || input.type === 'range') {
          val = parseFloat(input.value);
        } else if (input.type === 'checkbox') {
          val = (input as HTMLInputElement).checked;
        }
        tree.writeValue(path, val);
      });
    });

    // Collection: Array item inputs
    container.querySelectorAll<HTMLInputElement>('.inspector-array-input').forEach((input) => {
      input.addEventListener('change', () => {
        const arrPath = input.dataset.arrayPath;
        const idx = parseInt(input.dataset.index ?? '-1', 10);
        if (!arrPath || idx < 0) return;
        const arr = tree.readValue(arrPath);
        if (Array.isArray(arr)) {
          const newArr = [...arr];
          const orig = newArr[idx];
          let parsed: unknown = input.value;
          if (typeof orig === 'number') {
            const n = parseFloat(input.value);
            if (!isNaN(n)) parsed = n;
          } else if (typeof orig === 'boolean') {
            parsed = input.value.toLowerCase() === 'true';
          }
          newArr[idx] = parsed;
          tree.writeValue(arrPath, newArr);
        }
      });
    });

    // Collection: Array add button
    container.querySelectorAll<HTMLButtonElement>('.inspector-array-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arrPath = btn.dataset.arrayPath;
        if (!arrPath) return;
        const arr = tree.readValue(arrPath);
        const len = Array.isArray(arr) ? arr.length : 0;
        let defaultVal: unknown = '';
        if (len > 0 && Array.isArray(arr)) {
          const sample = arr[len - 1];
          if (typeof sample === 'number') defaultVal = 0;
          else if (typeof sample === 'boolean') defaultVal = false;
          else if (typeof sample === 'object' && sample !== null) {
            defaultVal = Array.isArray(sample) ? [] : { ...sample };
          }
        }
        tree.insertArrayItem(arrPath, len, defaultVal);
        renderInspectorStudioPanel(engine, container);
      });
    });

    // Collection: Array move up button
    container.querySelectorAll<HTMLButtonElement>('.inspector-array-move-up').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arrPath = btn.dataset.arrayPath;
        const idx = parseInt(btn.dataset.index ?? '-1', 10);
        if (!arrPath || idx <= 0) return;
        tree.moveArrayItem(arrPath, idx, idx - 1);
        renderInspectorStudioPanel(engine, container);
      });
    });

    // Collection: Array move down button
    container.querySelectorAll<HTMLButtonElement>('.inspector-array-move-down').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arrPath = btn.dataset.arrayPath;
        const idx = parseInt(btn.dataset.index ?? '-1', 10);
        if (!arrPath || idx < 0) return;
        tree.moveArrayItem(arrPath, idx, idx + 1);
        renderInspectorStudioPanel(engine, container);
      });
    });

    // Collection: Array remove button
    container.querySelectorAll<HTMLButtonElement>('.inspector-array-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arrPath = btn.dataset.arrayPath;
        const idx = parseInt(btn.dataset.index ?? '-1', 10);
        if (!arrPath || idx < 0) return;
        tree.removeArrayItem(arrPath, idx);
        renderInspectorStudioPanel(engine, container);
      });
    });

    // Collection: Map add button
    container.querySelectorAll<HTMLButtonElement>('.inspector-map-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mapPath = btn.dataset.mapPath;
        if (!mapPath) return;
        const key = `key_${Date.now() % 1000}`;
        tree.setMapEntry(mapPath, key, '');
        renderInspectorStudioPanel(engine, container);
      });
    });

    // Collection: Map remove button
    container.querySelectorAll<HTMLButtonElement>('.inspector-map-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mapPath = btn.dataset.mapPath;
        const key = btn.dataset.key;
        if (!mapPath || !key) return;
        tree.removeMapEntry(mapPath, key);
        renderInspectorStudioPanel(engine, container);
      });
    });

    // Collection: Map value change
    container.querySelectorAll<HTMLInputElement>('.inspector-map-val-input').forEach((input) => {
      input.addEventListener('change', () => {
        const mapPath = input.dataset.mapPath;
        const key = input.dataset.key;
        if (!mapPath || !key) return;
        tree.setMapEntry(mapPath, key, input.value);
      });
    });

    // Polymorphic type selector
    container.querySelectorAll<HTMLSelectElement>('.inspector-poly-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const path = sel.dataset.path;
        if (!path) return;
        const newType = sel.value;
        const node = tree.findNode(path);
        const polyTypes = node?.metadata.polymorphicTypes || {};
        const defaultTemplate = (polyTypes[newType] || {}) as Record<string, unknown>;
        tree.writeValue(path, { ...defaultTemplate, $type: newType });
        tree.rebuild();
        renderInspectorStudioPanel(engine, container);
      });
    });
  };


  bindInputs();

  // Search filter
  const searchInput = container.querySelector<HTMLInputElement>('#inspector-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      const body = container.querySelector('.inspector-studio-body');
      if (body) {
        body.innerHTML = engine.inspector.renderInspectorHTML(target, undefined, q);
        bindInputs();
      }
    });
  }

  // Undo / Redo
  const btnUndo = container.querySelector<HTMLButtonElement>('#btn-inspect-undo');
  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      if (tree.undo()) {
        renderInspectorStudioPanel(engine, container);
      }
    });
  }

  const btnRedo = container.querySelector<HTMLButtonElement>('#btn-inspect-redo');
  if (btnRedo) {
    btnRedo.addEventListener('click', () => {
      if (tree.redo()) {
        renderInspectorStudioPanel(engine, container);
      }
    });
  }

  // Bind action buttons
  const actionBtns = container.querySelectorAll<HTMLButtonElement>('.inspector-action-btn');
  actionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.command;
      const actId = btn.dataset.action;
      if (cmd) {
        engine.aiBridge.execute({ type: cmd as any, entityId } as any);
        showToast(`Executed inspector action '${actId || cmd}'`, 'info');
      } else if (actId && tree.schema?.actions?.[actId]?.execute) {
        tree.schema.actions[actId].execute(target);
        showToast(`Executed action '${actId}'`, 'info');
      }
    });
  });

  const btnValidate = container.querySelector('#btn-inspect-validate-now');
  if (btnValidate) {
    btnValidate.addEventListener('click', () => {
      const rep = ValidatorRegistry.validateTarget(target, tree);
      showToast(rep.valid ? 'Validation passed cleanly.' : `Found ${rep.totalIssues} validation issue(s).`, rep.valid ? 'success' : 'warn');
      renderInspectorStudioPanel(engine, container);
    });
  }

  const btnExport = container.querySelector('#btn-inspect-export-json');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const { SerializationEngine } = await import('../inspector');
      const json = SerializationEngine.serialize(target);
      navigator.clipboard
        .writeText(json)
        .then(() => showToast('Entity serialized to clipboard.', 'success'))
        .catch(() => showToast('Failed to copy.', 'error'));
    });
  }
}

