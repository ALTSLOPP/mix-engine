import { DrawerRegistry } from './Drawers';
import { PropertyTree } from './PropertyTree';
import { SafeResolver } from './SafeResolver';
import { SchemaRegistry } from './SchemaRegistry';
import type { InspectorSchemaDef } from './types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * InspectorStudioManager — Central coordinator for Inspector Studio PropertyTrees and rendering.
 */
export class InspectorStudioManager {
  private activeTrees = new Map<any, PropertyTree>();

  getTree(target: any, schema?: InspectorSchemaDef): PropertyTree {
    let tree = this.activeTrees.get(target);
    if (!tree) {
      const resolvedSchema = schema ?? SchemaRegistry.get(target);
      tree = new PropertyTree(target, resolvedSchema);
      this.activeTrees.set(target, tree);
    }
    return tree;
  }

  renderInspectorHTML(target: any, activeTab?: string, searchQuery = '', schema?: InspectorSchemaDef): string {
    const tree = this.getTree(target, schema);
    const resolvedSchema = tree.schema;
    const nodes = tree.getAllNodes().filter((n) => n.path !== '');


    // Context for condition resolution
    const context: Record<string, unknown> = {
      $target: target,
      $root: tree.readValue(''),
    };
    for (const node of nodes) {
      context[node.name] = node.value;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();

    // Filter visible nodes via SafeResolver and search filter
    const visibleNodes = nodes.filter((node) => {
      if (node.metadata.showIf) {
        if (!SafeResolver.evaluateBoolean(node.metadata.showIf, context, true)) return false;
      }
      if (node.metadata.hideIf) {
        if (SafeResolver.evaluateBoolean(node.metadata.hideIf, context, false)) return false;
      }

      if (normalizedQuery) {
        const label = String(node.metadata.label || '').toLowerCase();
        const name = node.name.toLowerCase();
        const path = node.path.toLowerCase();
        return label.includes(normalizedQuery) || name.includes(normalizedQuery) || path.includes(normalizedQuery);
      }

      return true;
    });

    // Render properties
    let html = '';
    for (const node of visibleNodes) {
      const drawer = DrawerRegistry.findPropertyDrawer(node);
      if (drawer) {
        html += drawer.renderHTML(node, tree);
      }
    }

    // Render actions
    if (schema?.actions) {
      html += `<div class="inspector-actions" style="margin-top:12px; display:flex; gap:6px; flex-wrap:wrap;">`;
      for (const [id, act] of Object.entries(schema.actions)) {
        if (act.showIf && !SafeResolver.evaluateBoolean(act.showIf, context, true)) {
          continue;
        }
        if (normalizedQuery && !id.toLowerCase().includes(normalizedQuery) && !String(act.label || '').toLowerCase().includes(normalizedQuery)) {
          continue;
        }
        html += `
          <button class="btn-secondary inspector-action-btn" data-action="${escapeHtml(id)}" data-command="${escapeHtml(act.command || '')}" style="flex:1;">
            ${escapeHtml(act.label || id)}
          </button>
        `;
      }
      html += `</div>`;
    }

    return html;
  }

  clear(): void {
    this.activeTrees.clear();
  }
}

