import type { Engine } from '../engine/Engine';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { escapeHtml } from '../ui/domUtils';
import { outlinerContent, outlinerSearch } from './dom';
import { getAssetId } from './sceneHelpers';
import { updateInspector } from './inspector';

// --- Dynamic World Outliner renderer ---------------------------------------
export function updateOutliner(engine: Engine): void {
  if (!outlinerContent) return;

  const list = engine.sceneManager.rigidBodyList;
  const selectedRb = engine.gizmo.attached;
  const searchVal = outlinerSearch ? outlinerSearch.value.toLowerCase() : '';

  // Entity count badge in the outliner header (QoL).
  const countEl = document.getElementById('outliner-count');
  if (countEl) countEl.textContent = String(list.length);

  // Map to find components by ID
  const entitiesMap = new Map<number, { rb: RigidBodyComponent, idx: number }>();
  list.forEach((rb, idx) => {
    const id = engine.sceneManager.entityAtIndex(idx);
    if (id === undefined) return;
    entitiesMap.set(id, { rb, idx });
  });

  // Calculate parenting tree roots & children lists
  const roots: number[] = [];
  const childrenMap = new Map<number, number[]>();

  entitiesMap.forEach((val, id) => {
    const parentId = engine.sceneManager.getParent(id);
    if (parentId !== undefined && entitiesMap.has(parentId)) {
      let arr = childrenMap.get(parentId);
      if (!arr) {
        arr = [];
        childrenMap.set(parentId, arr);
      }
      arr.push(id);
    } else {
      roots.push(id);
    }
  });

  // Traverse tree to get ordering and depths
  const orderedIds: { id: number, depth: number }[] = [];
  function traverse(id: number, depth: number) {
    orderedIds.push({ id, depth });
    const children = childrenMap.get(id);
    if (children) {
      for (const cid of children) {
        traverse(cid, depth + 1);
      }
    }
  }

  for (const rid of roots) {
    traverse(rid, 0);
  }

  let html = '';
  const renderNode = (id: number, depth: number) => {
    const item = entitiesMap.get(id);
    if (!item) return;
    const { rb, idx } = item;
    const assetId = getAssetId(rb);
    const isExtrusion = !assetId && (rb.mesh as any).geometry && ((rb.mesh as any).geometry.type === 'ExtrudeGeometry');
    const geomType = (rb.mesh as any).geometry?.type;

    const blueprint = engine.sceneManager.getBlueprint(id);
    const isLight = blueprint && blueprint.kind === 'light';

    let name = 'Box';
    let icon = '⛁';

    if (assetId) {
      name = `${assetId.toUpperCase()} (Character)`;
      icon = '👤';
    } else if (isLight) {
      const lightType = String(blueprint.params.lightType ?? 'point');
      name = `${lightType.toUpperCase()} Light #${id}`;
      icon = '💡';
    } else if (isExtrusion) {
      name = `Extruded Building #${id}`;
      icon = '⚃';
    } else if (rb.mesh.name) {
      name = rb.mesh.name;
      icon = name.toLowerCase().includes('sphere') ? '⚪' : name.toLowerCase().includes('tree') ? '🌲' : '⛁';
    } else if (geomType === 'SphereGeometry') {
      name = `Sphere #${id}`;
      icon = '⚪';
    } else if (geomType === 'BoxGeometry') {
      name = `Box #${id}`;
      icon = '⛁';
    }

    if (searchVal && !name.toLowerCase().includes(searchVal)) return;

    const isSelected = selectedRb === rb;
    const paddingLeft = depth * 16 + 8;
    const branchPrefix = depth > 0
      ? `<span style="opacity: 0.35; margin-right: 4px; font-family: monospace;">${'│ '.repeat(depth - 1)}└─</span>`
      : '';

    html += `
      <div class="tree-node ${isSelected ? 'selected' : ''}" data-entity-idx="${idx}" style="padding-left: ${paddingLeft}px;" title="${escapeHtml(name)} — click to select, double-click to focus">
        ${branchPrefix}
        <span class="tree-node-icon" style="color: ${isSelected ? 'var(--accent-cyan)' : 'inherit'}">${icon}</span>
        <span>${escapeHtml(name)}</span>
      </div>
    `;
  };

  if (searchVal) {
    list.forEach((rb, idx) => {
      const id = engine.sceneManager.entityAtIndex(idx);
    if (id === undefined) return;
      renderNode(id, 0);
    });
  } else {
    for (const item of orderedIds) {
      renderNode(item.id, item.depth);
    }
  }

  outlinerContent.innerHTML = html || `<div style="text-align:center;color:var(--text-muted);font-size:10px;padding-top:20px;">No entities matching search</div>`;

  // Attach select click listeners
  outlinerContent.querySelectorAll('.tree-node').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.getAttribute('data-entity-idx') || '0', 10);
      const rb = engine.sceneManager.rigidBodyList[idx];
      if (rb) {
        engine.gizmo.attach(rb);
        updateOutliner(engine);
        updateInspector(engine);
      }
    });
  });
}
