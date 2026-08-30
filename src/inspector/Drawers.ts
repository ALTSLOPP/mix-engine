import type { PropertyNode } from './PropertyNode';
import type { PropertyTree } from './PropertyTree';
import type { ActionMetadata, GroupMetadata } from './types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PropertyDrawer {
  priority: number;
  canDraw(node: PropertyNode): boolean;
  renderHTML(node: PropertyNode, tree: PropertyTree): string;
}

export interface GroupDrawer {
  priority: number;
  renderHTML(
    groupName: string,
    meta: GroupMetadata,
    renderedChildrenHtml: string,
    activeTab?: string,
  ): string;
}

export class DrawerRegistry {
  private static propertyDrawers: PropertyDrawer[] = [];
  private static groupDrawers = new Map<string, GroupDrawer>();

  static registerPropertyDrawer(drawer: PropertyDrawer): void {
    this.propertyDrawers.push(drawer);
    this.propertyDrawers.sort((a, b) => b.priority - a.priority);
  }

  static registerGroupDrawer(type: string, drawer: GroupDrawer): void {
    this.groupDrawers.set(type, drawer);
  }

  static findPropertyDrawer(node: PropertyNode): PropertyDrawer | null {
    for (const drawer of this.propertyDrawers) {
      if (drawer.canDraw(node)) return drawer;
    }
    return null;
  }

  static findGroupDrawer(type: string): GroupDrawer | null {
    return this.groupDrawers.get(type) ?? null;
  }
}

// ── Built-in default property drawers ───────────────────────────────────────

class NumberDrawer implements PropertyDrawer {
  priority = 10;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'number';
  }
  renderHTML(node: PropertyNode): string {
    const val = Number(node.value ?? 0);
    const meta = node.metadata;
    const isSlider = meta.range || (meta.min !== undefined && meta.max !== undefined);

    if (isSlider) {
      const min = meta.range ? meta.range[0] : (meta.min ?? 0);
      const max = meta.range ? meta.range[1] : (meta.max ?? 100);
      const step = meta.step ?? 1;
      return `
        <div class="form-group inspector-field" data-path="${node.path}">
          <label style="display:flex; justify-content:space-between;">
            <span>${meta.label || node.name}</span>
            <span class="field-readout">${val.toFixed(2)} ${meta.unit || ''}</span>
          </label>
          <input type="range" class="form-control-slider inspector-input" data-path="${node.path}" min="${min}" max="${max}" step="${step}" value="${val}" ${meta.readOnly ? 'disabled' : ''} />
        </div>
      `;
    }

    return `
      <div class="form-group inspector-field" data-path="${node.path}">
        <label>${meta.label || node.name} ${meta.unit ? `(${meta.unit})` : ''}</label>
        <input type="number" class="form-control-input inspector-input" data-path="${node.path}" value="${val}" step="${meta.step ?? 0.1}" ${meta.readOnly ? 'disabled' : ''} />
      </div>
    `;
  }
}

class BooleanDrawer implements PropertyDrawer {
  priority = 10;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'boolean';
  }
  renderHTML(node: PropertyNode): string {
    const checked = Boolean(node.value);
    const meta = node.metadata;
    return `
      <div class="form-group inspector-field" data-path="${node.path}" style="display:flex; justify-content:space-between; align-items:center;">
        <label style="margin-bottom:0;">${meta.label || node.name}</label>
        <input type="checkbox" class="inspector-input" data-path="${node.path}" ${checked ? 'checked' : ''} ${meta.readOnly ? 'disabled' : ''} />
      </div>
    `;
  }
}

class StringDrawer implements PropertyDrawer {
  priority = 5;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'string' && !node.metadata.options;
  }
  renderHTML(node: PropertyNode): string {
    const val = String(node.value ?? '');
    const meta = node.metadata;
    return `
      <div class="form-group inspector-field" data-path="${node.path}">
        <label>${escapeHtml(meta.label || node.name)}</label>
        <input type="text" class="form-control-input inspector-input" data-path="${escapeHtml(node.path)}" value="${escapeHtml(val)}" ${meta.readOnly ? 'disabled' : ''} />
      </div>
    `;
  }
}

class EnumDrawer implements PropertyDrawer {
  priority = 15;
  canDraw(node: PropertyNode): boolean {
    return Boolean(node.metadata.options);
  }
  renderHTML(node: PropertyNode): string {
    const val = String(node.value ?? '');
    const meta = node.metadata;
    const opts = meta.options || [];

    let optionsHtml = '';
    for (const opt of opts) {
      if (typeof opt === 'string') {
        optionsHtml += `<option value="${escapeHtml(opt)}" ${opt === val ? 'selected' : ''}>${escapeHtml(opt)}</option>`;
      } else {
        optionsHtml += `<option value="${escapeHtml(opt.value)}" ${opt.value === val ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`;
      }
    }

    return `
      <div class="form-group inspector-field" data-path="${node.path}">
        <label>${escapeHtml(meta.label || node.name)}</label>
        <select class="form-control-select inspector-input" data-path="${escapeHtml(node.path)}" ${meta.readOnly ? 'disabled' : ''}>
          ${optionsHtml}
        </select>
      </div>
    `;
  }
}

class ColorDrawer implements PropertyDrawer {
  priority = 12;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'color' || Boolean(node.metadata.colorPicker);
  }
  renderHTML(node: PropertyNode): string {
    const val = String(node.value ?? '#ffffff');
    const meta = node.metadata;
    return `
      <div class="form-group inspector-field" data-path="${node.path}">
        <label>${meta.label || node.name}</label>
        <div style="display:flex; gap:6px; align-items:center;">
          <input type="color" class="inspector-input" data-path="${node.path}" value="${val.startsWith('#') ? val : '#ffffff'}" style="width:32px; height:24px; padding:0; border:none; background:transparent; cursor:pointer;" ${meta.readOnly ? 'disabled' : ''} />
          <input type="text" class="form-control-input inspector-input" data-path="${node.path}" value="${val}" style="flex:1;" ${meta.readOnly ? 'disabled' : ''} />
        </div>
      </div>
    `;
  }
}

class VectorDrawer implements PropertyDrawer {
  priority = 12;
  canDraw(node: PropertyNode): boolean {
    if (node.type === 'vector2' || node.type === 'vector3') return true;
    const v = node.value;
    return Boolean(v && typeof v === 'object' && 'x' in v && 'y' in v);
  }
  renderHTML(node: PropertyNode): string {
    const val = (node.value || {}) as Record<string, number>;
    const meta = node.metadata;
    const is3D = 'z' in val || node.type === 'vector3';
    return `
      <div class="form-group inspector-field" data-path="${node.path}">
        <label>${meta.label || node.name}</label>
        <div style="display:flex; gap:4px;">
          <div style="flex:1; display:flex; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:3px; padding:0 4px;">
            <span style="color:#ef4444; font-size:9px; font-weight:bold; margin-right:4px;">X</span>
            <input type="number" class="inspector-input-subfield" data-path="${node.path}.x" value="${val.x ?? 0}" step="0.1" style="width:100%; background:transparent; border:none; color:inherit; font-size:11px;" ${meta.readOnly ? 'disabled' : ''} />
          </div>
          <div style="flex:1; display:flex; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:3px; padding:0 4px;">
            <span style="color:#10b981; font-size:9px; font-weight:bold; margin-right:4px;">Y</span>
            <input type="number" class="inspector-input-subfield" data-path="${node.path}.y" value="${val.y ?? 0}" step="0.1" style="width:100%; background:transparent; border:none; color:inherit; font-size:11px;" ${meta.readOnly ? 'disabled' : ''} />
          </div>
          ${
            is3D
              ? `<div style="flex:1; display:flex; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:3px; padding:0 4px;">
                  <span style="color:#3b82f6; font-size:9px; font-weight:bold; margin-right:4px;">Z</span>
                  <input type="number" class="inspector-input-subfield" data-path="${node.path}.z" value="${val.z ?? 0}" step="0.1" style="width:100%; background:transparent; border:none; color:inherit; font-size:11px;" ${meta.readOnly ? 'disabled' : ''} />
                </div>`
              : ''
          }
        </div>
      </div>
    `;
  }
}

class AssetDrawer implements PropertyDrawer {
  priority = 14;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'asset' || Boolean(node.metadata.assetType);
  }
  renderHTML(node: PropertyNode): string {
    const val = String(node.value ?? '');
    const meta = node.metadata;
    return `
      <div class="form-group inspector-field" data-path="${node.path}">
        <label style="display:flex; justify-content:space-between;">
          <span>${meta.label || node.name}</span>
          <span style="color:var(--text-muted); font-size:9px;">[${meta.assetType || 'asset'}]</span>
        </label>
        <div style="display:flex; gap:4px;">
          <input type="text" class="form-control-input inspector-input" data-path="${node.path}" value="${val}" placeholder="Select or type asset ID..." ${meta.readOnly ? 'disabled' : ''} style="flex:1;" />
          <button class="btn-secondary inspector-browse-btn" data-path="${node.path}" data-type="${meta.assetType || 'any'}" style="padding:0 8px; font-size:10px;">Browse</button>
        </div>
      </div>
    `;
  }
}

class ArrayDrawer implements PropertyDrawer {
  priority = 8;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'array' || Array.isArray(node.value);
  }
  renderHTML(node: PropertyNode, tree: PropertyTree): string {
    const arr = Array.isArray(node.value) ? node.value : [];
    const meta = node.metadata;
    const path = escapeHtml(node.path);

    let itemsHtml = '';
    for (let i = 0; i < arr.length; i++) {
      const itemVal = arr[i];
      const isObject = itemVal && typeof itemVal === 'object';
      const itemDisplay = isObject ? JSON.stringify(itemVal) : String(itemVal ?? '');

      itemsHtml += `
        <div class="inspector-array-item" data-array-path="${path}" data-index="${i}" style="display:flex; align-items:center; gap:4px; margin-bottom:4px; background:rgba(255,255,255,0.02); padding:3px 6px; border-radius:3px; border:1px solid rgba(255,255,255,0.05);">
          <span style="font-size:9px; color:var(--text-muted); width:16px;">#${i}</span>
          <input type="text" class="form-control-input inspector-array-input" data-array-path="${path}" data-index="${i}" value="${escapeHtml(itemDisplay)}" style="flex:1; font-size:11px; height:22px;" ${meta.readOnly ? 'disabled' : ''} />
          <button type="button" class="btn-icon inspector-array-move-up" data-array-path="${path}" data-index="${i}" title="Move Up" style="padding:1px 4px; font-size:9px;" ${i === 0 || meta.readOnly ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn-icon inspector-array-move-down" data-array-path="${path}" data-index="${i}" title="Move Down" style="padding:1px 4px; font-size:9px;" ${i === arr.length - 1 || meta.readOnly ? 'disabled' : ''}>▼</button>
          <button type="button" class="btn-icon inspector-array-remove" data-array-path="${path}" data-index="${i}" title="Remove Item" style="padding:1px 4px; font-size:9px; color:#ef4444;" ${meta.readOnly ? 'disabled' : ''}>✕</button>
        </div>
      `;
    }

    return `
      <div class="form-group inspector-field inspector-collection-field" data-path="${path}" style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label style="margin-bottom:0; font-weight:bold; font-size:11px;">${escapeHtml(meta.label || node.name)} <span style="color:var(--text-muted); font-size:9px;">(${arr.length})</span></label>
          <button type="button" class="btn-secondary inspector-array-add" data-array-path="${path}" style="padding:2px 6px; font-size:9px;" ${meta.readOnly ? 'disabled' : ''}>+ Add Item</button>
        </div>
        <div class="inspector-array-container" style="padding:4px; background:rgba(0,0,0,0.15); border-radius:4px; border:1px solid var(--border-color);">
          ${itemsHtml || '<div style="font-size:10px; color:var(--text-muted); padding:4px; text-align:center;">(Empty Array)</div>'}
        </div>
      </div>
    `;
  }
}

class MapDrawer implements PropertyDrawer {
  priority = 8;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'map' || Boolean(node.metadata.type === 'map');
  }
  renderHTML(node: PropertyNode, tree: PropertyTree): string {
    const val = node.value;
    const entries: Array<[string, unknown]> =
      val instanceof Map ? Array.from(val.entries()) : val && typeof val === 'object' ? Object.entries(val) : [];
    const meta = node.metadata;
    const path = escapeHtml(node.path);

    let entriesHtml = '';
    for (const [k, v] of entries) {
      entriesHtml += `
        <div class="inspector-map-row" data-map-path="${path}" data-key="${escapeHtml(k)}" style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
          <input type="text" class="form-control-input" value="${escapeHtml(k)}" readonly style="width:35%; font-size:10px; background:rgba(255,255,255,0.03);" />
          <input type="text" class="form-control-input inspector-map-val-input" data-map-path="${path}" data-key="${escapeHtml(k)}" value="${escapeHtml(String(v ?? ''))}" style="flex:1; font-size:10px;" ${meta.readOnly ? 'disabled' : ''} />
          <button type="button" class="btn-icon inspector-map-remove" data-map-path="${path}" data-key="${escapeHtml(k)}" title="Remove Entry" style="padding:1px 4px; font-size:9px; color:#ef4444;" ${meta.readOnly ? 'disabled' : ''}>✕</button>
        </div>
      `;
    }

    return `
      <div class="form-group inspector-field" data-path="${path}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label style="margin-bottom:0; font-weight:bold; font-size:11px;">${escapeHtml(meta.label || node.name)}</label>
          <button type="button" class="btn-secondary inspector-map-add" data-map-path="${path}" style="padding:2px 6px; font-size:9px;" ${meta.readOnly ? 'disabled' : ''}>+ Add Key</button>
        </div>
        <div style="padding:4px; background:rgba(0,0,0,0.15); border-radius:4px; border:1px solid var(--border-color);">
          ${entriesHtml || '<div style="font-size:10px; color:var(--text-muted); padding:4px; text-align:center;">(Empty Map)</div>'}
        </div>
      </div>
    `;
  }
}

class PolymorphicDrawer implements PropertyDrawer {
  priority = 16;
  canDraw(node: PropertyNode): boolean {
    return node.type === 'polymorphic' || Boolean(node.metadata.polymorphicTypes);
  }
  renderHTML(node: PropertyNode, tree: PropertyTree): string {
    const val = node.value;
    const meta = node.metadata;
    const path = escapeHtml(node.path);
    const polyTypes = meta.polymorphicTypes || {};
    const typeNames = Object.keys(polyTypes);
    const currentTypeName = val && typeof val === 'object' && ('$type' in val || '__type' in val)
      ? (val as Record<string, unknown>).$type || (val as Record<string, unknown>).__type
      : typeNames[0] || 'default';

    let optionsHtml = '';
    for (const tn of typeNames) {
      optionsHtml += `<option value="${escapeHtml(tn)}" ${tn === currentTypeName ? 'selected' : ''}>${escapeHtml(tn)}</option>`;
    }

    let subFieldsHtml = '';
    if (val && typeof val === 'object') {
      const currentProps = val as Record<string, unknown>;
      for (const [propKey, propVal] of Object.entries(currentProps)) {
        if (propKey === '$type' || propKey === '__type') continue;
        const subPath = path ? `${path}.${propKey}` : propKey;
        const displayVal = typeof propVal === 'object' ? JSON.stringify(propVal) : String(propVal ?? '');
        subFieldsHtml += `
          <div class="form-group" style="margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span style="font-size:10px; color:var(--text-muted); width:30%; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(propKey)}</span>
            <input type="text" class="form-control-input inspector-input" data-path="${escapeHtml(subPath)}" value="${escapeHtml(displayVal)}" style="flex:1; font-size:10px; height:22px;" ${meta.readOnly ? 'disabled' : ''} />
          </div>
        `;
      }
    }

    return `
      <div class="form-group inspector-field" data-path="${path}" style="border:1px solid rgba(139,92,246,0.3); border-radius:4px; padding:6px; background:rgba(139,92,246,0.03); margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label style="font-weight:bold; color:var(--accent-purple); font-size:11px; margin-bottom:0;">
            ${escapeHtml(meta.label || node.name)} <span style="font-size:9px; color:var(--text-muted);">[Polymorphic]</span>
          </label>
          <select class="form-control-select inspector-poly-select" data-path="${path}" style="font-size:10px; padding:2px 4px; width:auto;" ${meta.readOnly ? 'disabled' : ''}>
            ${optionsHtml}
          </select>
        </div>
        ${subFieldsHtml ? `<div style="padding-left:4px; border-left:2px solid rgba(139,92,246,0.4); margin-top:6px;">${subFieldsHtml}</div>` : ''}
      </div>
    `;
  }
}


// Register built-in drawers
DrawerRegistry.registerPropertyDrawer(new NumberDrawer());
DrawerRegistry.registerPropertyDrawer(new BooleanDrawer());
DrawerRegistry.registerPropertyDrawer(new ColorDrawer());
DrawerRegistry.registerPropertyDrawer(new VectorDrawer());
DrawerRegistry.registerPropertyDrawer(new AssetDrawer());
DrawerRegistry.registerPropertyDrawer(new PolymorphicDrawer());
DrawerRegistry.registerPropertyDrawer(new ArrayDrawer());
DrawerRegistry.registerPropertyDrawer(new MapDrawer());
DrawerRegistry.registerPropertyDrawer(new EnumDrawer());
DrawerRegistry.registerPropertyDrawer(new StringDrawer());

// Register built-in group drawers
DrawerRegistry.registerGroupDrawer('tab', {
  priority: 10,
  renderHTML(groupName, meta, childrenHtml, activeTab) {
    const isSelected = activeTab === groupName;
    return `
      <div class="inspector-tab-content ${isSelected ? 'active' : ''}" data-tab="${groupName}" style="${isSelected ? '' : 'display:none;'}">
        ${childrenHtml}
      </div>
    `;
  },
});

DrawerRegistry.registerGroupDrawer('foldout', {
  priority: 10,
  renderHTML(groupName, meta, childrenHtml) {
    const open = meta.defaultOpen ?? true;
    return `
      <details class="inspector-foldout" ${open ? 'open' : ''} style="margin-bottom:8px; border:1px solid var(--border-color); border-radius:4px; padding:6px;">
        <summary style="cursor:pointer; font-weight:bold; color:var(--text-muted); font-size:10px; text-transform:uppercase;">${meta.label || groupName}</summary>
        <div style="margin-top:6px;">
          ${childrenHtml}
        </div>
      </details>
    `;
  },
});

